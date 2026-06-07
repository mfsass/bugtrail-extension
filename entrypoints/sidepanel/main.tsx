import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ALLOWED_HOST_MATCHES,
  displayHostFromMatch,
  inferBugTrailContext,
  isBuiltInBugTrailUrl,
  matchForOrigin,
} from "../../utils/allowed-origins";
import { displayRoute, displayUrlContext } from "../../utils/display";
import {
  bugTrailReportFilename,
  buildBugTrailReport,
} from "../../utils/report";
import { redactString } from "../../utils/redaction";
import type { BugTrailRuntimeState } from "../../utils/types";
import brandMarkUrl from "../../assets/bugtrail-logo.svg?url";
import "./style.css";

type RuntimeResponse = {
  ok: boolean;
  state?: BugTrailRuntimeState;
  error?: string;
  dataUrl?: string;
};
type ThemeMode = "system" | "light" | "dark";

function App() {
  const [state, setState] = useState<BugTrailRuntimeState>({});
  const [app, setApp] = useState("");
  const [environment, setEnvironment] = useState("");
  const [actualResult, setActualResult] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [notes, setNotes] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");
  const [activeUrl, setActiveUrl] = useState("");
  const [grantedOrigins, setGrantedOrigins] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  const session = state.session;
  const isRecording = Boolean(session && !session.endedAt);
  const report = useMemo(
    () =>
      session
        ? buildBugTrailReport({
            ...session,
            actualResult,
            expectedResult,
            notes,
          })
        : "",
    [session, actualResult, expectedResult, notes],
  );
  const currentRoute = session?.endUrl || session?.startUrl || activeUrl;
  const currentOrigin = activeUrl ? matchForOrigin(activeUrl) : undefined;
  const inferredContext = useMemo(
    () => inferBugTrailContext(activeUrl),
    [activeUrl],
  );
  const canRunOnActiveSite = activeUrl
    ? isBuiltInBugTrailUrl(activeUrl) ||
      Boolean(currentOrigin && grantedOrigins.includes(currentOrigin))
    : true;
  const userOrigins = grantedOrigins.filter(
    (origin) =>
      !ALLOWED_HOST_MATCHES.includes(
        origin as (typeof ALLOWED_HOST_MATCHES)[number],
      ),
  );

  useEffect(() => {
    void refreshState();
    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes["bugtrail-state"]) {
        const next = changes["bugtrail-state"].newValue as
          | BugTrailRuntimeState
          | undefined;
        if (next) hydrateState(next);
      }
    };
    const tabActivatedListener = () => void refreshState();
    const tabUpdatedListener = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (changeInfo.url || changeInfo.status === "complete")
        void refreshState();
    };
    const permissionListener = () => void refreshGrantedOrigins();

    chrome.storage.onChanged.addListener(storageListener);
    chrome.tabs.onActivated.addListener(tabActivatedListener);
    chrome.tabs.onUpdated.addListener(tabUpdatedListener);
    chrome.permissions.onAdded.addListener(permissionListener);
    chrome.permissions.onRemoved.addListener(permissionListener);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
      chrome.permissions.onAdded.removeListener(permissionListener);
      chrome.permissions.onRemoved.removeListener(permissionListener);
    };
  }, []);

  useEffect(() => {
    void loadThemePreference();
  }, []);

  useEffect(() => {
    applyTheme(themeMode);
    setResolvedTheme(resolveTheme(themeMode));
    if (themeMode !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      setResolvedTheme(resolveTheme("system"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [themeMode]);

  async function refreshState() {
    try {
      const response = await send({ kind: "bugtrail:get-state" });
      if (response.state) hydrateState(response.state);
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      setActiveUrl(tab?.url || "");
      await refreshGrantedOrigins();
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          "BugTrail could not read the current browser state.",
        ),
      );
    }
  }

  async function refreshGrantedOrigins() {
    try {
      const permissions = await chrome.permissions.getAll();
      setGrantedOrigins(permissions.origins || []);
    } catch {
      setGrantedOrigins([]);
    }
  }

  function hydrateState(next: BugTrailRuntimeState) {
    setState(next);
    setActualResult(next.session?.actualResult || "");
    setExpectedResult(next.session?.expectedResult || "");
    setNotes(next.session?.notes || "");
  }

  async function startTrail() {
    await runAction("start", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) throw new Error("No active tab is available.");
      setActiveUrl(tab.url || "");
      const context = inferBugTrailContext(tab.url || activeUrl);
      const response = await send({
        kind: "bugtrail:start",
        tabId: tab.id,
        app: app || context.app,
        environment: environment || context.environment,
      });
      if (!response.ok)
        throw new Error(
          response.error || "BugTrail could not start on this site.",
        );
      if (response.state) hydrateState(response.state);
    });
  }

  async function runAction(action: string, task: () => Promise<void>) {
    setBusyAction(action);
    setError("");
    setStatusMessage(actionLabel(action, "progress"));
    try {
      await task();
      setStatusMessage(actionLabel(action, "done"));
      window.setTimeout(() => setStatusMessage(""), 1800);
    } catch (caught) {
      setError(errorMessage(caught, "BugTrail action failed."));
      setStatusMessage("");
    } finally {
      setBusyAction("");
    }
  }

  async function loadThemePreference() {
    try {
      const stored = await chrome.storage.local.get("bugtrail-theme-mode");
      const next = stored["bugtrail-theme-mode"];
      if (next === "light" || next === "dark" || next === "system") {
        setThemeMode(next);
      }
    } catch {
      setThemeMode("system");
    }
  }

  async function updateTheme(next: ThemeMode) {
    setThemeMode(next);
    await chrome.storage.local.set({ "bugtrail-theme-mode": next });
  }

  async function addCurrentSite() {
    await runAction("add-site", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const origin = tab?.url ? matchForOrigin(tab.url) : undefined;
      if (!origin || !tab?.id)
        throw new Error(
          "BugTrail can only be enabled on normal http or https sites.",
        );

      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) throw new Error("Site access was not granted.");

      await send({ kind: "bugtrail:register-site", origin });
      await send({ kind: "bugtrail:inject-content", tabId: tab.id });
      await refreshGrantedOrigins();
      setActiveUrl(tab.url || "");
    });
  }

  async function removeSite(origin: string) {
    await runAction(`remove-${origin}`, async () => {
      await send({ kind: "bugtrail:unregister-site", origin });
      await chrome.permissions.remove({ origins: [origin] });
      await refreshGrantedOrigins();
    });
  }

  async function stopTrail() {
    await runAction("stop", async () => {
      const response = await send({
        kind: "bugtrail:stop",
        actualResult,
        expectedResult,
        notes,
      });
      if (!response.ok)
        throw new Error(response.error || "BugTrail could not stop the trail.");
      if (response.state) hydrateState(response.state);
    });
  }

  async function markBug() {
    await runAction("mark", async () => {
      const response = await send({ kind: "bugtrail:mark-bug" });
      if (!response.ok)
        throw new Error(response.error || "BugTrail could not mark the bug.");
      if (response.state) hydrateState(response.state);
    });
  }

  async function copyScreenshot() {
    await runAction("screenshot", async () => {
      const screenshot = (async () => {
        const response = await send({ kind: "bugtrail:capture-screenshot" });
        if (!response.ok || !response.dataUrl)
          throw new Error(
            response.error || "BugTrail could not capture the screen.",
          );
        const blob = await (await fetch(response.dataUrl)).blob();
        return blob.type === "image/png"
          ? blob
          : new Blob([blob], { type: "image/png" });
      })();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": screenshot }),
      ]);
    });
  }

  async function clearTrail() {
    await runAction("clear", async () => {
      const response = await send({ kind: "bugtrail:clear" });
      if (!response.ok)
        throw new Error(
          response.error || "BugTrail could not clear the trail.",
        );
      setCopyStatus("");
      hydrateState(response.state || {});
    });
  }

  async function copyReport() {
    await runAction("copy", async () => {
      await navigator.clipboard.writeText(report);
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus(""), 1800);
    });
  }

  async function downloadReport() {
    await runAction("download", async () => {
      if (!session)
        throw new Error("No completed BugTrail report is available.");
      const url = URL.createObjectURL(
        new Blob([report], { type: "text/markdown;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = bugTrailReportFilename({
        ...session,
        actualResult,
        expectedResult,
        notes,
      });
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  const failedApis =
    session?.networkEvents.filter((event) => (event.status ?? 0) >= 400)
      .length || 0;
  const consoleErrors =
    session?.consoleEvents.filter((event) => event.level === "error").length ||
    0;
  const captureChecks = session
    ? [
        {
          label: "Steps",
          ok: session.steps.length > 0,
          detail: `${session.steps.length} captured`,
        },
        {
          label: "Console",
          ok: session.consoleEvents.length > 0,
          detail: `${session.consoleEvents.length} event(s)`,
        },
        {
          label: "Network",
          ok: session.networkEvents.length > 0,
          detail: `${session.networkEvents.length} call(s)`,
        },
        {
          label: "Route",
          ok: Boolean(currentRoute),
          detail: currentRoute ? "Attached" : "Missing",
        },
      ]
    : [];
  const captureScore = captureChecks.length
    ? Math.round(
        (captureChecks.filter((check) => check.ok).length /
          captureChecks.length) *
          100,
      )
    : 0;
  const captureState = captureScore >= 75 ? "debug-ready" : "partial";

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-block">
          <img
            className="brand-mark"
            src={brandMarkUrl}
            alt=""
            aria-hidden="true"
          />
          <div>
            <p className="eyebrow">BugTrail</p>
            <h1>QA handoff trail</h1>
          </div>
        </div>
        <div className="topbar-right">
          <span className={isRecording ? "status recording" : "status"}>
            {isRecording && <span className="live-dot" aria-hidden="true" />}
            {isRecording ? "Recording" : session?.endedAt ? "Complete" : "Idle"}
          </span>
          <label className="theme-select">
            <span className="theme-select-label">Theme</span>
            <select
              value={themeMode}
              onChange={(event) =>
                void updateTheme(event.target.value as ThemeMode)
              }
              aria-label="Theme preference"
            >
              <option value="system">System ({resolvedTheme})</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </header>
      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>
      {error && <p className="notice error">{error}</p>}
      {statusMessage && <p className="notice success">{statusMessage}</p>}
      {!canRunOnActiveSite && !session && (
        <p className="notice">
          BugTrail is not enabled for this site yet. Add it once to make
          recording available here.
        </p>
      )}
      {currentRoute && <p className="route-pill">{routeLabel(currentRoute)}</p>}

      {!session && (
        <section className="panel">
          <div className="setup-grid">
            <label>
              App
              <input
                value={app}
                onChange={(event) => setApp(event.target.value)}
                placeholder={inferredContext.app || "App name"}
                autoComplete="off"
              />
            </label>
            <label>
              Environment
              <input
                value={environment}
                onChange={(event) => setEnvironment(event.target.value)}
                placeholder={inferredContext.environment || "Environment"}
                autoComplete="off"
              />
            </label>
          </div>
          <div className="capture-list compact">
            <span>Clicks and routes</span>
            <span>Console errors</span>
            <span>Network summary</span>
            <span>Redacted payloads</span>
          </div>
          {canRunOnActiveSite ? (
            <button
              className="primary"
              type="button"
              onClick={startTrail}
              disabled={Boolean(busyAction)}
            >
              {busyAction === "start" ? "Starting..." : "Start Trail"}
            </button>
          ) : (
            <button
              className="primary"
              type="button"
              onClick={addCurrentSite}
              disabled={Boolean(busyAction)}
            >
              {busyAction === "add-site" ? "Adding..." : "Add this site"}
            </button>
          )}
          <section className="sites" aria-label="Trusted sites">
            <h2>Trusted sites</h2>
            <div className="site-list">
              {ALLOWED_HOST_MATCHES.map((origin) => (
                <span className="site-chip" key={origin}>
                  {displayHostFromMatch(origin)}
                </span>
              ))}
              {userOrigins.map((origin) => (
                <span className="site-chip removable" key={origin}>
                  {displayHostFromMatch(origin)}
                  <button
                    type="button"
                    onClick={() => removeSite(origin)}
                    aria-label={`Remove ${displayHostFromMatch(origin)}`}
                    disabled={Boolean(busyAction)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {userOrigins.length === 0 && (
              <p className="mini-note">No custom trusted sites yet.</p>
            )}
          </section>
        </section>
      )}

      {session && (
        <>
          <section className="metrics">
            <Metric label="Primary steps" value={session.steps.length} />
            <Metric label="API calls" value={session.networkEvents.length} />
            <Metric
              label="Failed APIs"
              value={failedApis}
              warning={failedApis > 0}
            />
            <Metric
              label="Console errors"
              value={consoleErrors}
              warning={consoleErrors > 0}
            />
          </section>
          <section className="confidence" aria-label="Capture completeness">
            <div
              className={
                captureState === "debug-ready" ? "quality good" : "quality warn"
              }
            >
              <strong>
                {captureState === "debug-ready"
                  ? "Debug-ready"
                  : "Partial capture"}
              </strong>
              <span>{captureScore}% capture completeness</span>
            </div>
            <div className="capture-checks">
              {captureChecks.map((check) => (
                <span
                  key={check.label}
                  className={check.ok ? "check ok" : "check missing"}
                >
                  {check.label}: {check.detail}
                </span>
              ))}
            </div>
            <p className="privacy-state">
              Privacy mode active: sensitive tokens, IDs, and PII are masked in
              reports.
            </p>
          </section>

          <section className="timeline" aria-label="Captured steps">
            {session.steps.length === 0 ? (
              <p className="empty-state">
                No captured steps yet. Start interacting with the page to build
                your trail.
              </p>
            ) : (
              session.steps.slice(-8).map((step) => (
                <article className="step" key={step.id}>
                  <span>{step.index}</span>
                  <div>
                    <strong>{redactString(step.label || step.type)}</strong>
                    <p>{displayRoute(step.route || step.url)}</p>
                    {step.relatedNetworkEventIds.length > 0 && (
                      <small>
                        {step.relatedNetworkEventIds.length} API event(s)
                      </small>
                    )}
                    {step.relatedConsoleEventIds.length > 0 && (
                      <small className="warn">
                        {step.relatedConsoleEventIds.length} console event(s)
                      </small>
                    )}
                  </div>
                </article>
              ))
            )}
          </section>

          <section className="panel">
            <label>
              Actual result
              <textarea
                value={actualResult}
                onChange={(event) => setActualResult(event.target.value)}
                rows={3}
                placeholder="Describe what actually happened..."
              />
            </label>
            <label>
              Expected result
              <textarea
                value={expectedResult}
                onChange={(event) => setExpectedResult(event.target.value)}
                rows={3}
                placeholder="Describe what should have happened..."
              />
            </label>
            <label>
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Any additional context for the developer..."
              />
            </label>
          </section>

          <footer className="actions">
            {isRecording ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={copyScreenshot}
                  disabled={Boolean(busyAction)}
                  title="Capture current app tab and copy to clipboard"
                >
                  <CameraIcon />
                  {busyAction === "screenshot"
                    ? "Capturing..."
                    : "Copy screenshot"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={markBug}
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === "mark" ? "Marking..." : "Mark bug here"}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={stopTrail}
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === "stop" ? "Stopping..." : "Stop Trail"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={clearTrail}
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === "clear" ? "Clearing..." : "Clear"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={copyScreenshot}
                  disabled={Boolean(busyAction)}
                  title="Capture current app tab and copy to clipboard"
                >
                  <CameraIcon />
                  {busyAction === "screenshot"
                    ? "Capturing..."
                    : "Copy screenshot"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={downloadReport}
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === "download" ? "Saving..." : "Save .md"}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={copyReport}
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === "copy" ? "Copying..." : "Copy Report"}
                </button>
              </>
            )}
          </footer>
          {copyStatus && <p className="copy-status">{copyStatus}</p>}
          {!isRecording && (
            <section className="preview" aria-label="Report preview">
              <h2>Report preview</h2>
              <pre>{report}</pre>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  warning,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className={warning ? "metric warning" : "metric"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      className="btn-icon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

async function send(message: unknown): Promise<RuntimeResponse> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || typeof response !== "object")
    return { ok: false, error: "BugTrail background did not respond." };
  return response as RuntimeResponse;
}

function routeLabel(url: string): string {
  return displayUrlContext(url);
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
}

function actionLabel(action: string, stage: "progress" | "done"): string {
  const labels: Record<string, { progress: string; done: string }> = {
    start: {
      progress: "Starting recording...",
      done: "Trail recording started.",
    },
    stop: { progress: "Stopping trail...", done: "Trail recording stopped." },
    mark: {
      progress: "Adding bug marker...",
      done: "Bug marker added to trail.",
    },
    clear: { progress: "Clearing session...", done: "Trail session cleared." },
    copy: {
      progress: "Copying report...",
      done: "Report copied to clipboard.",
    },
    download: {
      progress: "Preparing markdown file...",
      done: "Markdown report is ready.",
    },
    "add-site": {
      progress: "Enabling site access...",
      done: "Site added to trusted list.",
    },
    screenshot: {
      progress: "Capturing screen...",
      done: "Screenshot copied — paste it alongside your report.",
    },
  };
  return (
    labels[action]?.[stage] ||
    (stage === "progress" ? "Working..." : "Action complete.")
  );
}

createRoot(document.getElementById("root")!).render(<App />);
