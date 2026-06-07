import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const chromeCandidates = [
  process.env.BUGTRAIL_BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
];

const chromePath = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
const builtExtensionPath = join(process.cwd(), ".output", "chrome-mv3");
let extensionPath = builtExtensionPath;

if (!chromePath) fail("Chrome or Brave executable was not found.");
if (!existsSync(join(builtExtensionPath, "manifest.json"))) fail("Built extension not found. Run npm run build first.");

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpSession(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket.close();
  }
}

const pageHtml = `<!doctype html>
<html>
  <head><title>BugTrail Smoke Fixture</title></head>
  <body>
    <button data-testid="edit-profile-button" data-bugtrail-component="Smoke.EditButton">Edit Profile</button>
    <label>Email <input id="email" name="email" value="qa@example.com" /></label>
    <button data-testid="save-button" data-bugtrail-component="Smoke.SaveButton">Save</button>
    <script>
      document.querySelector('[data-testid="edit-profile-button"]').addEventListener('click', () => {
        history.pushState({}, '', '/customers/1/edit');
      });
      document.querySelector('[data-testid="save-button"]').addEventListener('click', async () => {
        console.error('Smoke failure for qa@example.com');
        await fetch('/api/customers/1?email=qa@example.com', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'qa@example.com', password: 'secret' })
        });
      });
    </script>
  </body>
</html>`;

const server = createServer((request, response) => {
  if (request.url?.startsWith("/api/customers/1")) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ success: false, email: "qa@example.com", code: "SMOKE_FAILURE" }));
    return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end(pageHtml);
});

let chrome;
let userDataDir;
let extensionTempDir;
let chromeLog = "";

try {
  const port = await listen(server);
  userDataDir = await mkdtemp(join(tmpdir(), "bugtrail-smoke-"));
  extensionTempDir = await mkdtemp(join(tmpdir(), "bugtrail-ext-"));
  extensionPath = join(extensionTempDir, "chrome-mv3");
  await cp(builtExtensionPath, extensionPath, { recursive: true });
  const debugPort = 9223 + Math.floor(Math.random() * 1000);
  const smokeUrl = `http://localhost:${port}/`;

  chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-popup-blocking",
    "--enable-logging=stderr",
    "--v=1",
    "--window-position=40,40",
    "--window-size=1200,900",
    smokeUrl,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  chrome.stderr?.on("data", (chunk) => {
    chromeLog += chunk.toString();
    if (chromeLog.length > 20000) chromeLog = chromeLog.slice(-20000);
  });

  await waitForDebugger(debugPort);
  const extensionIds = await findExtensionIds(debugPort, userDataDir);
  const pageTarget = await findPageTarget(debugPort, smokeUrl);
  const { target: extensionTarget, extensionId } = await openExtensionPage(debugPort, extensionIds);
  const page = await CdpSession.connect(pageTarget.webSocketDebuggerUrl);
  const extension = await CdpSession.connect(extensionTarget.webSocketDebuggerUrl);

  await page.send("Runtime.enable");
  await extension.send("Runtime.enable");
  await page.send("Page.enable");
  await activateTarget(debugPort, pageTarget.id);
  await page.send("Page.bringToFront");
  await page.send("Runtime.evaluate", { expression: "document.readyState === 'complete'", awaitPromise: true });

  const fixtureTab = await evalJson(extension, `
    chrome.tabs.query({}).then((tabs) => tabs
      .map((tab) => ({ id: tab.id, url: tab.url, pendingUrl: tab.pendingUrl, title: tab.title }))
      .find((tab) => (tab.url || tab.pendingUrl || "").startsWith("${smokeUrl}") || tab.title === "BugTrail Smoke Fixture"))
  `);
  assert(fixtureTab?.id, `smoke fixture tab was not found. Tabs: ${JSON.stringify(fixtureTab)}`);
  const tabId = fixtureTab.id;
  const startResponse = await evalJson(extension, `chrome.runtime.sendMessage({ kind: "bugtrail:start", tabId: ${tabId}, app: "Smoke App", environment: "Local" })`);
  assert(startResponse?.ok, `start response was not ok: ${JSON.stringify(startResponse)}`);
  await waitForPageCondition(page, "window.__bugtrailBridgeReady === true", "BugTrail page bridge did not become ready.");

  await clickSelector(debugPort, pageTarget.id, page, '[data-testid="edit-profile-button"]');
  await delay(150);
  await clickSelector(debugPort, pageTarget.id, page, "#email");
  await page.send("Runtime.evaluate", {
    expression: `
      document.querySelector('#email').value = 'qa@example.com';
      document.querySelector('#email').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#email').dispatchEvent(new Event('change', { bubbles: true }));
    `,
    awaitPromise: true,
  });
  await clickSelector(debugPort, pageTarget.id, page, '[data-testid="save-button"]');

  await waitForStoredSession(extension, (session) =>
    Boolean(
      session?.steps?.some((step) => step.label === "Edit Profile") &&
      session?.steps?.some((step) => step.element?.field === "email") &&
      session?.networkEvents?.some((event) => event.status === 500),
    ),
  );
  await triggerConsoleEvidence(page, extension);
  const stopResponse = await evalJson(extension, `chrome.runtime.sendMessage({ kind: "bugtrail:stop", actualResult: "Smoke save failed.", expectedResult: "Smoke save succeeds.", notes: "Runtime smoke" })`);
  assert(stopResponse?.ok, `stop response was not ok: ${JSON.stringify(stopResponse)}`);
  const stored = await evalJson(extension, `chrome.storage.local.get("bugtrail-state").then((value) => value["bugtrail-state"])`);
  const session = stored?.session;

  assert(session, "session was not stored");
  assert(session.endedAt, "session did not stop");
  const sessionSummary = () => JSON.stringify({
    steps: session.steps?.map((step) => ({ id: step.id, type: step.type, label: step.label, field: step.element?.field, route: step.route })),
    network: session.networkEvents?.map((event) => ({ method: event.method, path: event.path, status: event.status, relatedStepId: event.relatedStepId })),
    console: session.consoleEvents?.map((event) => ({ level: event.level, message: event.message, relatedStepId: event.relatedStepId })),
  }, null, 2);
  assert(session.steps?.some((step) => step.label === "Edit Profile"), `click step was not captured: ${sessionSummary()}`);
  assert(session.steps?.some((step) => step.element?.field === "email"), `input step was not captured: ${sessionSummary()}`);
  assert(session.networkEvents?.some((event) => event.status === 500), `failed API event was not captured: ${sessionSummary()}`);
  assert(session.consoleEvents?.some((event) => event.message.includes("[REDACTED_EMAIL]")), `redacted console event was not captured: ${sessionSummary()}`);

  await page.close();
  await extension.close();
  console.log("Runtime smoke validation passed.");
} finally {
  server.close();
  if (chrome && !chrome.killed) {
    chrome.kill();
    await waitForExit(chrome);
  }
  if (userDataDir) {
    await delay(300);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
  if (extensionTempDir) await rm(extensionTempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
}

function listen(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      if (!address || typeof address === "string") reject(new Error("Could not determine server port."));
      else resolve(address.port);
    });
  });
}

async function waitForDebugger(port) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      await delay(150);
    }
  }
  fail("Chrome remote debugger did not start.");
}

async function targets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) fail("Could not read Chrome debugging targets.");
  return response.json();
}

async function findExtensionIds(port, profileDir) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const allTargets = await targets(port);
    const target = allTargets.find((item) => item.type === "service_worker" && item.url?.startsWith("chrome-extension://"));
    if (target) return [new URL(target.url).hostname];
    const fromPreferences = await extensionIdFromPreferences(profileDir);
    if (fromPreferences) return [fromPreferences];
    await delay(150);
  }
  return extensionIdCandidates(extensionPath);
}

async function extensionIdFromPreferences(profileDir) {
  try {
    const preferences = JSON.parse(await readFile(join(profileDir, "Default", "Preferences"), "utf8"));
    const settings = preferences.extensions?.settings || {};
    const normalizedExtensionPath = extensionPath.toLowerCase();
    for (const [id, value] of Object.entries(settings)) {
      const path = value?.path || value?.manifest?.path;
      if (typeof path === "string" && path.toLowerCase() === normalizedExtensionPath) return id;
      if (value?.manifest?.name === "BugTrail") return id;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function openExtensionPage(port, extensionIds) {
  const attempts = [];
  for (const extensionId of extensionIds) {
    const url = `chrome-extension://${extensionId}/sidepanel.html`;
    const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
    if (!response.ok) {
      attempts.push(`${extensionId}: ${response.status}`);
      continue;
    }
    const target = await response.json();
    if (!target?.webSocketDebuggerUrl) {
      attempts.push(`${extensionId}: no websocket`);
      continue;
    }
    const probe = await CdpSession.connect(target.webSocketDebuggerUrl);
    await probe.send("Runtime.enable");
    const href = await evalJson(probe, "location.href");
    probe.close();
    if (href.startsWith(`chrome-extension://${extensionId}/`)) return { target, extensionId };
    attempts.push(`${extensionId}: ${href}`);
  }
  fail(`Could not resolve the BugTrail extension page from Chrome's loaded extension IDs. Attempts: ${attempts.join("; ")}`);
}

async function activateTarget(port, targetId) {
  const response = await fetch(`http://127.0.0.1:${port}/json/activate/${targetId}`);
  if (!response.ok) fail(`Could not activate Chrome target ${targetId}: ${response.status}`);
}

function extensionIdCandidates(path) {
  const variants = [
    path,
    path.toLowerCase(),
    path.replace(/\\/g, "/"),
    path.replace(/\\/g, "/").toLowerCase(),
    `${path}\\`,
    `${path.toLowerCase()}\\`,
    `${path.replace(/\\/g, "/")}/`,
    `${path.replace(/\\/g, "/").toLowerCase()}/`,
  ];
  return [...new Set(variants.map(extensionIdFromPath))];
}

function extensionIdFromPath(path) {
  const digest = createHash("sha256").update(path).digest();
  return [...digest.subarray(0, 16)].map((byte) => {
    const hi = (byte >> 4) & 0xf;
    const lo = byte & 0xf;
    return String.fromCharCode(97 + hi) + String.fromCharCode(97 + lo);
  }).join("");
}

async function findPageTarget(port, url) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const allTargets = await targets(port);
    const target = allTargets.find((item) => item.type === "page" && item.url?.startsWith(url));
    if (target?.webSocketDebuggerUrl) return target;
    await delay(150);
  }
  fail("Smoke fixture page target was not found.");
}

async function evalJson(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) fail(`Runtime evaluation failed: ${result.exceptionDetails.text}`);
  return result.result?.value;
}

async function clickSelector(port, targetId, session, selector) {
  await activateTarget(port, targetId);
  await session.send("Page.bringToFront");
  const clicked = await evalJson(session, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit) return false;
      if (element instanceof HTMLElement) {
        element.focus();
        element.click();
        return true;
      }
      return false;
    })()
  `);
  assert(clicked, `selector was not clickable: ${selector}`);
}

async function waitForStoredSession(extension, predicate, timeoutMs = 5000) {
  const started = Date.now();
  let latest;
  while (Date.now() - started < timeoutMs) {
    latest = await evalJson(extension, `chrome.storage.local.get("bugtrail-state").then((value) => value["bugtrail-state"]?.session)`);
    if (predicate(latest)) return latest;
    await delay(150);
  }
  fail(`Timed out waiting for runtime evidence: ${JSON.stringify({
    steps: latest?.steps?.map((step) => ({ type: step.type, label: step.label, field: step.element?.field, route: step.route })),
    network: latest?.networkEvents?.map((event) => ({ method: event.method, path: event.path, status: event.status })),
    console: latest?.consoleEvents?.map((event) => ({ level: event.level, message: event.message })),
  }, null, 2)}`);
}

async function waitForPageCondition(session, expression, message, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await evalJson(session, expression);
    if (ready) return;
    await delay(100);
  }
  fail(message);
}

async function triggerConsoleEvidence(page, extension, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await page.send("Runtime.evaluate", {
      expression: `console.error('Smoke failure for qa@example.com')`,
      awaitPromise: true,
    });
    const session = await evalJson(extension, `chrome.storage.local.get("bugtrail-state").then((value) => value["bugtrail-state"]?.session)`);
    if (session?.consoleEvents?.some((event) => event.message.includes("[REDACTED_EMAIL]"))) return;
    await delay(150);
  }
  fail("Timed out waiting for redacted console evidence after explicit console trigger.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child) {
  if (child.exitCode != null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  const interestingLog = chromeLog
    .split(/\r?\n/)
    .filter((line) => /extension|load|manifest|error/i.test(line))
    .slice(-80)
    .join("\n");
  const logSuffix = interestingLog ? `\nChrome log tail:\n${interestingLog}` : "";
  console.error(`Runtime smoke validation failed: ${message}${logSuffix}`);
  process.exit(1);
}
