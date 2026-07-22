import type { CapturedConsoleMessage, CapturedNetworkMessage, CapturedStepMessage } from "../utils/types";
import { ALLOWED_HOST_MATCHES } from "../utils/allowed-origins";
import { redactString } from "../utils/redaction";

export default defineContentScript({
  matches: [...ALLOWED_HOST_MATCHES],
  runAt: "document_start",
  main() {
    const loadGuard = window as Window & { __bugtrailContentLoaded?: boolean };
    if (loadGuard.__bugtrailContentLoaded) return;
    loadGuard.__bugtrailContentLoaded = true;

    const bridgeChannel = createBridgeChannel();

    let lastUrl = location.href;
    const inputTimers = new WeakMap<HTMLElement, number>();
    const lastCommittedInputValue = new WeakMap<HTMLElement, string>();
    let lastClickSignature = "";
    let lastClickAt = 0;
    let inspectNextElement = false;
    const send = (message: CapturedStepMessage | CapturedConsoleMessage | CapturedNetworkMessage) => {
      chrome.runtime.sendMessage(message).catch(() => undefined);
    };

    const setInspectMode = (enabled: boolean) => {
      inspectNextElement = enabled;
      toggleInspectionStyle(enabled);
    };

    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!isInspectModeMessage(message)) return undefined;
      setInspectMode(message.enabled);
      sendResponse({ ok: true });
      return false;
    });

    const captureRoute = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      send({
        kind: "bugtrail:step",
        step: {
          type: "route-change",
          timestamp: new Date().toISOString(),
          url: location.href,
          route: location.pathname + location.search + location.hash,
          label: document.title,
        },
      });
    };

    setInterval(captureRoute, 500);
    window.addEventListener("hashchange", captureRoute);
    window.addEventListener("popstate", captureRoute);

    document.addEventListener(
      "click",
      (event) => {
        if (inspectNextElement) {
          const inspectedTarget = inspectableElement(event.target);
          if (!inspectedTarget) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          setInspectMode(false);
          send({
            kind: "bugtrail:step",
            step: {
              type: "bug-marker",
              timestamp: new Date().toISOString(),
              url: location.href,
              route: location.pathname + location.search + location.hash,
              label: `Front-end issue: ${labelFor(inspectedTarget)}`,
              element: elementInfo(inspectedTarget),
            },
          });
          return;
        }

        const target = closestElement(event.target);
        if (!target) return;
        if (isNoiseInputClick(target)) return;
        const signature = `${target.tagName.toLowerCase()}|${selectorFor(target)}|${location.pathname}${location.search}${location.hash}`;
        const now = Date.now();
        if (signature === lastClickSignature && now - lastClickAt < 400) return;
        lastClickSignature = signature;
        lastClickAt = now;
        send({
          kind: "bugtrail:step",
          step: {
            type: isSubmit(target) ? "submit" : "click",
            timestamp: new Date().toISOString(),
            url: location.href,
            route: location.pathname + location.search + location.hash,
            label: labelFor(target),
            element: elementInfo(target),
          },
        });
      },
      true,
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && inspectNextElement) setInspectMode(false);
      },
      true,
    );

    document.addEventListener(
      "change",
      (event) => {
        const target = closestElement(event.target);
        if (!target || !isInputLike(target)) return;
        commitInputStep(send, target, lastCommittedInputValue, "change");
      },
      true,
    );

    document.addEventListener(
      "input",
      (event) => {
        const target = closestElement(event.target);
        if (!target || !isInputLike(target)) return;
        const existing = inputTimers.get(target);
        if (existing) window.clearTimeout(existing);
        inputTimers.set(
          target,
          window.setTimeout(() => {
            commitInputStep(send, target, lastCommittedInputValue, "input");
            inputTimers.delete(target);
          }, 900),
        );
      },
      true,
    );

    const handleBridgeDetail = (detail: unknown) => {
      if (!isBridgeDetail(detail)) return;
      if (detail?.kind === "console") {
        send({
          kind: "bugtrail:console",
          event: {
            level: detail.level === "warn" ? "warn" : "error",
            message: stringValue(detail.message),
            stack: optionalString(detail.stack),
            timestamp: stringValue(detail.timestamp, new Date().toISOString()),
            url: stringValue(detail.url, location.href),
          },
        });
      }
      if (detail?.kind === "network") {
        const url = stringValue(detail.url, location.href);
        send({
          kind: "bugtrail:network",
          event: {
            method: stringValue(detail.method, "GET").toUpperCase(),
            url,
            path: pathFromUrl(url),
            status: optionalNumber(detail.status),
            durationMs: optionalNumber(detail.durationMs),
            type: networkType(detail.type),
            requestPayload: detail.requestPayload,
            responsePayload: detail.responsePayload,
            responseUnavailableReason: optionalString(detail.responseUnavailableReason),
            timestamp: stringValue(detail.timestamp, new Date().toISOString()),
          },
        });
      }
    };

    window.addEventListener("message", (event) => {
      if (event.data?.source !== "bugtrail-page" || event.data?.channel !== bridgeChannel) return;
      handleBridgeDetail(event.data.detail);
    });

    document.addEventListener("bugtrail-page-event", (event) => {
      const customEvent = event as CustomEvent<{ channel?: string; detail?: unknown }>;
      if (customEvent.detail?.channel !== bridgeChannel) return;
      handleBridgeDetail(customEvent.detail.detail);
    });

    injectPageBridge(bridgeChannel);
  },
});

type BridgeDetail = BridgeConsoleDetail | BridgeNetworkDetail;

type InspectModeMessage = {
  kind: "bugtrail:set-inspect-mode";
  enabled: boolean;
};

type BridgeConsoleDetail = {
  kind: "console";
  level?: unknown;
  message?: unknown;
  stack?: unknown;
  timestamp?: unknown;
  url?: unknown;
};

type BridgeNetworkDetail = {
  kind: "network";
  method?: unknown;
  url?: unknown;
  path?: unknown;
  status?: unknown;
  durationMs?: unknown;
  type?: unknown;
  requestPayload?: unknown;
  responsePayload?: unknown;
  responseUnavailableReason?: unknown;
  timestamp?: unknown;
};

function isBridgeDetail(detail: unknown): detail is BridgeDetail {
  if (!detail || typeof detail !== "object" || !("kind" in detail)) return false;
  return (detail as { kind?: unknown }).kind === "console" || (detail as { kind?: unknown }).kind === "network";
}

function isInspectModeMessage(message: unknown): message is InspectModeMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as { kind?: unknown; enabled?: unknown };
  return candidate.kind === "bugtrail:set-inspect-mode" && typeof candidate.enabled === "boolean";
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function networkType(value: unknown): "fetch" | "xhr" | "webRequest" | undefined {
  return value === "fetch" || value === "xhr" || value === "webRequest" ? value : undefined;
}

function commitInputStep(
  send: (message: CapturedStepMessage) => void,
  target: HTMLElement,
  lastCommittedInputValue: WeakMap<HTMLElement, string>,
  source: "input" | "change",
): void {
  const value = valueFor(target) || "";
  const previous = lastCommittedInputValue.get(target);
  // Ignore blur/change noise when field was never filled.
  if (source === "change" && value === "" && previous == null) return;
  if (value === previous) return;
  lastCommittedInputValue.set(target, value);
  send({
    kind: "bugtrail:step",
    step: {
      type: target.tagName.toLowerCase() === "select" ? "select" : "input",
      timestamp: new Date().toISOString(),
      url: location.href,
      route: location.pathname + location.search + location.hash,
      label: labelFor(target),
      element: elementInfo(target),
    },
  });
}

function isNoiseInputClick(element: HTMLElement): boolean {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio" || element.type === "submit" || element.type === "button") return false;
    return true;
  }
  return element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

function createBridgeChannel(): string {
  return `bugtrail-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

function injectPageBridge(channel: string): void {
  const script = document.createElement("script");
  const url = new URL(chrome.runtime.getURL("/page-bridge.js"));
  url.searchParams.set("channel", channel);
  script.src = url.href;
  script.async = false;
  script.onload = () => script.remove();
  (document.documentElement || document.head).append(script);
}

function closestElement(target: EventTarget | null): HTMLElement | undefined {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>("button,a,input,textarea,select,[role='button'],[data-bugtrail-action],[onclick]") || undefined
    : undefined;
}

function inspectableElement(target: EventTarget | null): HTMLElement | undefined {
  if (target instanceof HTMLElement && target !== document.body && target !== document.documentElement) return target;
  if (!(target instanceof Element)) return undefined;
  let current: Element | null = target.parentElement;
  while (current && !(current instanceof HTMLElement)) current = current.parentElement;
  if (!(current instanceof HTMLElement) || current === document.body || current === document.documentElement) return undefined;
  return current;
}

function isInputLike(element: HTMLElement): boolean {
  return ["input", "textarea", "select"].includes(element.tagName.toLowerCase());
}

function isSubmit(element: HTMLElement): boolean {
  return element instanceof HTMLButtonElement && element.type === "submit" && Boolean(element.form);
}

function labelFor(element: HTMLElement): string {
  return (
    element.getAttribute("data-bugtrail-action") ||
    element.getAttribute("data-bugtrail-field") ||
    element.getAttribute("aria-label") ||
    labelText(element) ||
    element.getAttribute("placeholder") ||
    element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ||
    element.getAttribute("name") ||
    element.id ||
    element.tagName.toLowerCase()
  );
}

function elementInfo(element: HTMLElement) {
  return {
    tag: element.tagName.toLowerCase(),
    text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || undefined,
    role: element.getAttribute("role") || undefined,
    ariaLabel: element.getAttribute("aria-label") || undefined,
    name: element.getAttribute("name") || undefined,
    testId: element.getAttribute("data-testid") || undefined,
    selector: selectorFor(element),
    component: element.getAttribute("data-bugtrail-component") || undefined,
    action: element.getAttribute("data-bugtrail-action") || undefined,
    field: element.getAttribute("data-bugtrail-field") || element.getAttribute("name") || undefined,
    value: valueFor(element),
  };
}

function valueFor(element: HTMLElement): string | undefined {
  if (element instanceof HTMLInputElement) {
    if (element.type === "password") return "[REDACTED]";
    if (element.type === "checkbox" || element.type === "radio") return element.checked ? "checked" : "unchecked";
    return element.value ? redactString(element.value).slice(0, 120) : undefined;
  }
  if (element instanceof HTMLTextAreaElement) return element.value ? redactString(element.value).slice(0, 120) : undefined;
  if (element instanceof HTMLSelectElement) return element.value ? redactString(element.value).slice(0, 120) : undefined;
  return undefined;
}

function labelText(element: HTMLElement): string | undefined {
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  return element.closest("label")?.textContent?.trim();
}

function selectorFor(element: HTMLElement): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  if (element.getAttribute("data-testid")) return `[data-testid="${element.getAttribute("data-testid")}"]`;
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== document.body && parts.length < 4) {
    const tag = current.tagName.toLowerCase();
    const index = Array.from(current.parentElement?.children || []).filter((child) => child.tagName === current?.tagName).indexOf(current) + 1;
    parts.unshift(index > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function pathFromUrl(url: string): string {
  try {
    const parsed = new URL(url, location.href);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

function toggleInspectionStyle(enabled: boolean): void {
  const styleId = "bugtrail-inspection-style";
  let style = document.getElementById(styleId);
  if (enabled && !style) {
    style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      html.bugtrail-inspecting, html.bugtrail-inspecting * {
        cursor: crosshair !important;
      }

      html.bugtrail-inspecting *:hover {
        outline: 2px solid #1f6f7a !important;
        outline-offset: 2px !important;
      }
    `;
    document.documentElement.append(style);
  }
  document.documentElement.classList.toggle("bugtrail-inspecting", enabled);
}
