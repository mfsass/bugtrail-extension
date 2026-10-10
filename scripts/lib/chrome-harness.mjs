import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

export const EXTENSION_NAME = "BugHunter";

const chromeCandidates = () => [
  process.env.BUGHUNTER_BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
];

export function resolveChromePath() {
  const chromePath = chromeCandidates().find((candidate) => candidate && existsSync(candidate));
  if (!chromePath) throw new Error("Chrome or Brave executable was not found.");
  return chromePath;
}

export function resolveBuiltExtension(root = process.cwd()) {
  const builtExtensionPath = join(root, ".output", "chrome-mv3");
  if (!existsSync(join(builtExtensionPath, "manifest.json"))) {
    throw new Error("Built extension not found. Run npm run build first.");
  }
  return builtExtensionPath;
}

export class CdpSession {
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

/**
 * Launches a throwaway Chrome profile with the built extension side-loaded.
 * Returns the live handles plus a `cleanup` that always tears the profile down.
 */
export async function launchChrome({ builtExtensionPath, startUrl, windowSize = "1200,900", extraArgs = [] }) {
  const chromePath = resolveChromePath();
  const userDataDir = await mkdtemp(join(tmpdir(), "bughunter-profile-"));
  const extensionTempDir = await mkdtemp(join(tmpdir(), "bughunter-ext-"));
  const extensionPath = join(extensionTempDir, "chrome-mv3");
  await cp(builtExtensionPath, extensionPath, { recursive: true });

  const debugPort = 9223 + Math.floor(Math.random() * 1000);
  let log = "";

  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-popup-blocking",
      "--enable-logging=stderr",
      // VERBOSE1 floods the release-gate output; opt in when diagnosing a smoke failure.
      ...(process.env.BUGHUNTER_VERBOSE_BROWSER_LOG ? ["--v=1"] : []),
      "--window-position=40,40",
      `--window-size=${windowSize}`,
      ...extraArgs,
      ...(startUrl ? [startUrl] : []),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  chrome.stderr?.on("data", (chunk) => {
    log += chunk.toString();
    if (log.length > 20000) log = log.slice(-20000);
  });

  const cleanup = async () => {
    if (chrome && !chrome.killed) {
      chrome.kill();
      await waitForExit(chrome);
    }
    await delay(300);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
    await rm(extensionTempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  };

  return {
    chrome,
    debugPort,
    userDataDir,
    extensionPath,
    cleanup,
    get log() {
      return log;
    },
  };
}

export async function waitForDebugger(port, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      await delay(150);
    }
  }
  throw new Error("Chrome remote debugger did not start.");
}

export async function targets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) throw new Error("Could not read Chrome debugging targets.");
  return response.json();
}

export async function findExtensionIds(port, profileDir, extensionPath, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const allTargets = await targets(port);
    const target = allTargets.find(
      (item) => item.type === "service_worker" && item.url?.startsWith("chrome-extension://"),
    );
    if (target) return [new URL(target.url).hostname];
    const fromPreferences = await extensionIdFromPreferences(profileDir, extensionPath);
    if (fromPreferences) return [fromPreferences];
    await delay(150);
  }
  return extensionIdCandidates(extensionPath);
}

async function extensionIdFromPreferences(profileDir, extensionPath) {
  try {
    const preferences = JSON.parse(await readFile(join(profileDir, "Default", "Preferences"), "utf8"));
    const settings = preferences.extensions?.settings || {};
    const normalizedExtensionPath = extensionPath.toLowerCase();
    for (const [id, value] of Object.entries(settings)) {
      const path = value?.path || value?.manifest?.path;
      if (typeof path === "string" && path.toLowerCase() === normalizedExtensionPath) return id;
      if (value?.manifest?.name === EXTENSION_NAME) return id;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function openExtensionPage(port, extensionIds, pagePath = "sidepanel.html") {
  const attempts = [];
  for (const extensionId of extensionIds) {
    const url = `chrome-extension://${extensionId}/${pagePath}`;
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
  throw new Error(
    `Could not resolve the ${EXTENSION_NAME} extension page from Chrome's loaded extension IDs. Attempts: ${attempts.join("; ")}`,
  );
}

export async function activateTarget(port, targetId) {
  const response = await fetch(`http://127.0.0.1:${port}/json/activate/${targetId}`);
  if (!response.ok) throw new Error(`Could not activate Chrome target ${targetId}: ${response.status}`);
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
  return [...digest.subarray(0, 16)]
    .map((byte) => {
      const hi = (byte >> 4) & 0xf;
      const lo = byte & 0xf;
      return String.fromCharCode(97 + hi) + String.fromCharCode(97 + lo);
    })
    .join("");
}

export async function findPageTarget(port, url, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const allTargets = await targets(port);
    const target = allTargets.find((item) => item.type === "page" && item.url?.startsWith(url));
    if (target?.webSocketDebuggerUrl) return target;
    await delay(150);
  }
  throw new Error("Page target was not found.");
}

export async function evalJson(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(`Runtime evaluation failed: ${result.exceptionDetails.text}`);
  return result.result?.value;
}

export async function waitForPageCondition(session, expression, message, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await evalJson(session, expression);
    if (ready) return;
    await delay(100);
  }
  throw new Error(message);
}

export async function clickSelector(port, targetId, session, selector) {
  await activateTarget(port, targetId);
  await session.send("Page.bringToFront");
  const clicked = await evalJson(
    session,
    `
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
  `,
  );
  if (!clicked) throw new Error(`selector was not clickable: ${selector}`);
}

export function listen(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      if (!address || typeof address === "string") reject(new Error("Could not determine server port."));
      else resolve(address.port);
    });
  });
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function waitForExit(child) {
  if (child.exitCode != null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 3000);
  });
}

/** Pulls the extension-relevant lines out of a Chrome stderr log for error reports. */
export function interestingChromeLog(log) {
  return log
    .split(/\r?\n/)
    .filter((line) => /extension|load|manifest|error/i.test(line))
    .slice(-80)
    .join("\n");
}
