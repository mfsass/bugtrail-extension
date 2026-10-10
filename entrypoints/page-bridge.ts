export default defineUnlistedScript(() => {
  const channel = new URL((document.currentScript as HTMLScriptElement | null)?.src || location.href).searchParams.get("channel");
  (window as Window & { __bughunterBridgeReady?: boolean }).__bughunterBridgeReady = true;
  const post = (detail: unknown) => {
    window.postMessage({ source: "bughunter-page", channel, detail }, "*");
    document.dispatchEvent(new CustomEvent("bughunter-page-event", { detail: { channel, detail } }));
  };

  const originalConsoleError = console.error.bind(console);
  const originalConsoleWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    post({ kind: "console", level: "error", message: args.map(String).join(" "), timestamp: new Date().toISOString(), url: location.href });
    originalConsoleError(...args);
  };

  console.warn = (...args: unknown[]) => {
    post({ kind: "console", level: "warn", message: args.map(String).join(" "), timestamp: new Date().toISOString(), url: location.href });
    originalConsoleWarn(...args);
  };

  window.addEventListener("error", (event) => {
    post({
      kind: "console",
      level: "error",
      message: event.message,
      stack: event.error?.stack,
      timestamp: new Date().toISOString(),
      url: location.href,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    post({
      kind: "console",
      level: "error",
      message: String(event.reason?.message || event.reason),
      stack: event.reason?.stack,
      timestamp: new Date().toISOString(),
      url: location.href,
    });
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = performance.now();
    const request = new Request(input, init);
    const requestBody = init?.body;
    const response = await originalFetch(input, init);
    const clone = response.clone();
    let responsePayload: unknown;
    let responseUnavailableReason: string | undefined;

    try {
      const contentType = clone.headers.get("content-type") || "";
      if (contentType.includes("json")) responsePayload = await clone.json();
      else if (contentType.includes("text")) responsePayload = await clone.text();
      else responseUnavailableReason = "non-text response";
    } catch {
      responseUnavailableReason = "response body could not be read";
    }

    post({
      kind: "network",
      type: "fetch",
      method: request.method,
      url: request.url,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      requestPayload: typeof requestBody === "string" ? requestBody : undefined,
      responsePayload,
      responseUnavailableReason,
      timestamp: new Date().toISOString(),
    });

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
    Reflect.set(this, "__bughunter", { method, url: String(url), startedAt: 0 });
    return originalOpen.call(this, method, url, async ?? true, username ?? undefined, password ?? undefined);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = Reflect.get(this, "__bughunter") as { method: string; url: string; startedAt: number } | undefined;
    if (meta) meta.startedAt = performance.now();

    this.addEventListener("loadend", () => {
      if (!meta) return;
      const responseText = this.responseType === "" || this.responseType === "text" ? this.responseText : undefined;
      post({
        kind: "network",
        type: "xhr",
        method: meta.method,
        url: new URL(meta.url, location.href).href,
        status: this.status,
        durationMs: Math.round(performance.now() - meta.startedAt),
        requestPayload: typeof body === "string" ? body : undefined,
        responsePayload: responseText,
        responseUnavailableReason: responseText ? undefined : "response body unavailable",
        timestamp: new Date().toISOString(),
      });
    });

    return originalSend.call(this, body);
  };
});
