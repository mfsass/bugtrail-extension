import { addConsoleEvent, addNetworkEvent, addStep, createSession, expireStaleActiveSession, routeFromUrl } from "../utils/session";
import { ALLOWED_HOST_MATCHES, isBuiltInBugHunterUrl, matchForOrigin } from "../utils/allowed-origins";
import type { BackgroundMessage, BugHunterRuntimeState, BugHunterSession, NetworkEvent } from "../utils/types";

const STATE_KEY = "bughunter-state";
const pendingRequests = new Map<string, { method: string; url: string; startedAt: number; requestPayload?: unknown }>();
let activeRecordingTabId: number | undefined;

export default defineBackground(() => {
  void syncDynamicContentScripts();
  void hydrateActiveRecordingTab();

  chrome.action.onClicked.addListener((tab) => {
    if (tab.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  });

  chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  });

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId < 0 || details.tabId !== activeRecordingTabId || !isApiUrl(details.url)) return;
      pendingRequests.set(details.requestId, {
        method: details.method,
        url: details.url,
        startedAt: details.timeStamp,
        requestPayload: extractRequestBody(details.requestBody ?? undefined),
      });
    },
    { urls: ["http://*/*", "https://*/*"] },
    ["requestBody"],
  );

  chrome.webRequest.onCompleted.addListener(
    (details) => {
      void captureWebRequest(details.requestId, details.tabId, details.statusCode, details.timeStamp);
    },
    { urls: ["http://*/*", "https://*/*"] },
  );

  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      void captureWebRequest(details.requestId, details.tabId, undefined, details.timeStamp, details.error);
    },
    { urls: ["http://*/*", "https://*/*"] },
  );
});

async function handleMessage(message: BackgroundMessage, sender: chrome.runtime.MessageSender) {
  const state = await getState();

  if (message.kind === "bughunter:get-state") return { ok: true, state };
  if (message.kind === "bughunter:clear") {
    await setState({});
    return { ok: true, state: {} };
  }

  if (message.kind === "bughunter:inject-content") {
    await injectContentScript(message.tabId);
    return { ok: true, state };
  }

  if (message.kind === "bughunter:register-site") {
    await registerContentScriptForOrigin(message.origin);
    return { ok: true, state };
  }

  if (message.kind === "bughunter:unregister-site") {
    await unregisterContentScriptForOrigin(message.origin);
    return { ok: true, state };
  }

  if (message.kind === "bughunter:capture-screenshot") {
    try {
      const windowId = await resolveCaptureWindowId(state);
      const dataUrl =
        windowId != null
          ? await chrome.tabs.captureVisibleTab(windowId, { format: "png" })
          : await chrome.tabs.captureVisibleTab({ format: "png" });
      if (!dataUrl) throw new Error("empty capture");
      return { ok: true, state, dataUrl };
    } catch (error) {
      return { ok: false, state, error: captureErrorMessage(error) };
    }
  }

  if (message.kind === "bughunter:start") {
    const tab = await chrome.tabs.get(message.tabId);
    const tabUrl = tab.url || (await getTabUrl(message.tabId));
    if (!tabUrl || !(await canAccessUrl(tabUrl))) {
      return { ok: false, state, error: `BugHunter is not enabled for this site: ${tabUrl || "unknown URL"}` };
    }
    await injectContentScript(message.tabId);
    const session = createSession({
      tabId: message.tabId,
      url: tabUrl,
      title: tab.title,
      app: message.app,
      environment: message.environment,
      viewport: await getViewport(message.tabId),
    });
    const nextState = { activeTabId: message.tabId, session };
    await setState(nextState);
    return { ok: true, state: nextState };
  }

  if (!state.session) return { ok: true, state };

  if (message.kind === "bughunter:stop") {
    const session: BugHunterSession = {
      ...state.session,
      endedAt: new Date().toISOString(),
      endUrl: state.session.endUrl || state.session.startUrl,
      actualResult: message.actualResult,
      expectedResult: message.expectedResult,
      notes: message.notes,
    };
    const nextState = { ...state, activeTabId: undefined, session };
    await setState(nextState);
    return { ok: true, state: nextState };
  }

  if (message.kind === "bughunter:mark-bug") {
    const session = addStep(state.session, {
      type: "bug-marker",
      timestamp: new Date().toISOString(),
      url: state.session.endUrl || state.session.startUrl,
      route: routeFromUrl(state.session.endUrl || state.session.startUrl),
      label: "Bug happened here",
    });
    const nextState = { ...state, session };
    await setState(nextState);
    return { ok: true, state: nextState };
  }

  if (message.kind === "bughunter:set-inspect-mode") {
    if (state.session.endedAt || state.activeTabId == null) {
      return { ok: false, state, error: "Start a trail before inspecting an element." };
    }
    await injectContentScript(state.activeTabId);
    try {
      await chrome.tabs.sendMessage(state.activeTabId, message);
      return { ok: true, state };
    } catch {
      return { ok: false, state, error: "BugHunter could not activate element inspection on this tab." };
    }
  }

  if (sender.tab?.id !== state.activeTabId) return { ok: true, state };

  if (message.kind === "bughunter:step") {
    const nextState = { ...state, session: addStep(state.session, message.step) };
    await setState(nextState);
    return { ok: true, state: nextState };
  }

  if (message.kind === "bughunter:console") {
    const nextState = { ...state, session: addConsoleEvent(state.session, message.event) };
    await setState(nextState);
    return { ok: true, state: nextState };
  }

  if (message.kind === "bughunter:network") {
    const nextState = { ...state, session: addNetworkEvent(state.session, message.event) };
    await setState(nextState);
    return { ok: true, state: nextState };
  }

  return { ok: true, state };
}

async function captureWebRequest(requestId: string, tabId: number, status: number | undefined, endedAt: number, error?: string) {
  if (tabId !== activeRecordingTabId) {
    pendingRequests.delete(requestId);
    return;
  }
  const state = await getState();
  const pending = pendingRequests.get(requestId);
  pendingRequests.delete(requestId);
  if (!state.session || state.session.endedAt || state.activeTabId !== tabId || !pending || !isApiUrl(pending.url)) return;

  const event: Omit<NetworkEvent, "id" | "redacted" | "relatedStepId"> = {
    requestId,
    timestamp: new Date(endedAt).toISOString(),
    method: pending.method,
    url: pending.url,
    path: routeFromUrl(pending.url),
    status,
    durationMs: Math.max(0, Math.round(endedAt - pending.startedAt)),
    type: "webRequest",
    requestPayload: pending.requestPayload,
    responseUnavailableReason: error || "webRequest cannot read response bodies",
  };

  await setState({ ...state, session: addNetworkEvent(state.session, event) });
}

async function getState(): Promise<BugHunterRuntimeState> {
  const result = await chrome.storage.local.get(STATE_KEY);
  const stored = (result[STATE_KEY] as BugHunterRuntimeState | undefined) || {};
  const recovered = expireStaleActiveSession(stored);
  if (recovered !== stored) await setState(recovered);
  return recovered;
}

async function setState(state: BugHunterRuntimeState): Promise<void> {
  activeRecordingTabId = state.session && !state.session.endedAt ? state.activeTabId : undefined;
  if (activeRecordingTabId == null) pendingRequests.clear();
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

async function hydrateActiveRecordingTab(): Promise<void> {
  const state = await getState();
  activeRecordingTabId = state.session && !state.session.endedAt ? state.activeTabId : undefined;
}

async function canAccessUrl(url: string): Promise<boolean> {
  if (isBuiltInBugHunterUrl(url)) return true;
  const origin = matchForOrigin(url);
  if (!origin) return false;
  return chrome.permissions.contains({ origins: [origin] });
}

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/content.js"],
    });
  } catch {
    // Static content-script injection or unsupported pages may already cover this.
  }
}

async function syncDynamicContentScripts(): Promise<void> {
  try {
    const permissions = await chrome.permissions.getAll();
    const dynamicOrigins = (permissions.origins || []).filter((origin) => !ALLOWED_HOST_MATCHES.includes(origin as (typeof ALLOWED_HOST_MATCHES)[number]));
    await Promise.all(dynamicOrigins.map(registerContentScriptForOrigin));
  } catch {
    // Permission state can be unavailable during early startup; explicit add-site handles registration too.
  }
}

async function registerContentScriptForOrigin(origin: string): Promise<void> {
  if (!origin.endsWith("/*")) return;
  const id = contentScriptIdForOrigin(origin);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch {
    // Missing registrations are fine.
  }
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [origin],
      js: ["content-scripts/content.js"],
      runAt: "document_start",
      persistAcrossSessions: true,
    },
  ]);
}

async function unregisterContentScriptForOrigin(origin: string): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [contentScriptIdForOrigin(origin)] });
  } catch {
    // Already removed.
  }
}

function contentScriptIdForOrigin(origin: string): string {
  return `bughunter_${origin.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

async function getViewport(tabId: number): Promise<string> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => `${window.innerWidth}x${window.innerHeight}`,
    });
    return String(result?.result || "unknown");
  } catch {
    return "unknown";
  }
}

async function getTabUrl(tabId: number): Promise<string | undefined> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.location.href,
    });
    return typeof result?.result === "string" ? result.result : undefined;
  } catch {
    return undefined;
  }
}

async function resolveCaptureWindowId(state: BugHunterRuntimeState): Promise<number | undefined> {
  if (state.activeTabId != null) {
    try {
      const tab = await chrome.tabs.get(state.activeTabId);
      if (tab.windowId != null) return tab.windowId;
    } catch {
      // Recording tab may be closed; fall back to the focused window below.
    }
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.windowId;
  } catch {
    return undefined;
  }
}

function captureErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/cannot.*capture|activeTab|permission|<all_urls>/i.test(raw)) {
    return "BugHunter cannot capture this tab. Open the app tab you are testing, then try again.";
  }
  return "BugHunter could not capture the screen. Make sure the app tab is visible and try again.";
}

function extractRequestBody(body: chrome.webRequest.WebRequestBody | undefined): unknown {
  if (!body) return undefined;
  if (body.formData) return body.formData;
  const raw = body.raw?.[0]?.bytes;
  if (!raw) return undefined;
  return new TextDecoder().decode(raw);
}

function isApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return path.includes("/api/") || path.includes("/graphql") || path.includes("/rest/");
  } catch {
    return false;
  }
}
