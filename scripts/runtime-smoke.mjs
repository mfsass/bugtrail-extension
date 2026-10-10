import { createServer } from "node:http";
import {
  CdpSession,
  activateTarget,
  clickSelector,
  delay,
  evalJson,
  findExtensionIds,
  findPageTarget,
  interestingChromeLog,
  launchChrome,
  listen,
  openExtensionPage,
  resolveBuiltExtension,
  waitForDebugger,
  waitForPageCondition,
} from "./lib/chrome-harness.mjs";

const builtExtensionPath = resolveBuiltExtension();

const pageHtml = `<!doctype html>
<html>
  <head><title>BugHunter Smoke Fixture</title></head>
  <body>
    <button data-testid="edit-profile-button" data-bughunter-component="Smoke.EditButton">Edit Profile</button>
    <label>Email <input id="email" name="email" value="qa@example.com" /></label>
    <button data-testid="save-button" data-bughunter-component="Smoke.SaveButton">Save</button>
    <script>
      document.querySelector('[data-testid="save-button"]').addEventListener('click', async () => {
        await fetch('/api/customers/1?email=qa@example.com', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'qa@example.com', password: 'hunter2' }),
        }).catch(() => undefined);
      });
    </script>
  </body>
</html>`;

const server = createServer((request, response) => {
  if (request.url?.startsWith("/api/")) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Smoke failure" }));
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(pageHtml);
});

let browser;

try {
  const port = await listen(server);
  const smokeUrl = `http://localhost:${port}/`;
  browser = await launchChrome({ builtExtensionPath, startUrl: smokeUrl });
  const { debugPort, userDataDir, extensionPath } = browser;

  await waitForDebugger(debugPort);
  const extensionIds = await findExtensionIds(debugPort, userDataDir, extensionPath);
  const pageTarget = await findPageTarget(debugPort, smokeUrl);
  const { target: extensionTarget } = await openExtensionPage(debugPort, extensionIds);
  const page = await CdpSession.connect(pageTarget.webSocketDebuggerUrl);
  const extension = await CdpSession.connect(extensionTarget.webSocketDebuggerUrl);

  await page.send("Runtime.enable");
  await extension.send("Runtime.enable");
  await page.send("Page.enable");
  await activateTarget(debugPort, pageTarget.id);
  await page.send("Page.bringToFront");
  await page.send("Runtime.evaluate", { expression: "document.readyState === 'complete'", awaitPromise: true });

  const fixtureTab = await evalJson(
    extension,
    `
    chrome.tabs.query({}).then((tabs) => tabs
      .map((tab) => ({ id: tab.id, url: tab.url, pendingUrl: tab.pendingUrl, title: tab.title }))
      .find((tab) => (tab.url || tab.pendingUrl || "").startsWith("${smokeUrl}") || tab.title === "BugHunter Smoke Fixture"))
  `,
  );
  assert(fixtureTab?.id, `smoke fixture tab was not found. Tabs: ${JSON.stringify(fixtureTab)}`);
  const tabId = fixtureTab.id;
  const startResponse = await evalJson(
    extension,
    `chrome.runtime.sendMessage({ kind: "bughunter:start", tabId: ${tabId}, app: "Smoke App", environment: "Local" })`,
  );
  assert(startResponse?.ok, `start response was not ok: ${JSON.stringify(startResponse)}`);
  await waitForPageCondition(
    page,
    "window.__bughunterBridgeReady === true",
    "BugHunter page bridge did not become ready.",
  );

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
  const stopResponse = await evalJson(
    extension,
    `chrome.runtime.sendMessage({ kind: "bughunter:stop", actualResult: "Smoke save failed.", expectedResult: "Smoke save succeeds.", notes: "Runtime smoke" })`,
  );
  assert(stopResponse?.ok, `stop response was not ok: ${JSON.stringify(stopResponse)}`);
  const stored = await evalJson(
    extension,
    `chrome.storage.local.get("bughunter-state").then((value) => value["bughunter-state"])`,
  );
  const session = stored?.session;

  assert(session, "session was not stored");
  assert(session.endedAt, "session did not stop");
  const sessionSummary = () =>
    JSON.stringify(
      {
        steps: session.steps?.map((step) => ({
          id: step.id,
          type: step.type,
          label: step.label,
          field: step.element?.field,
          route: step.route,
        })),
        network: session.networkEvents?.map((event) => ({
          method: event.method,
          path: event.path,
          status: event.status,
          relatedStepId: event.relatedStepId,
        })),
        console: session.consoleEvents?.map((event) => ({
          level: event.level,
          message: event.message,
          relatedStepId: event.relatedStepId,
        })),
      },
      null,
      2,
    );
  assert(
    session.steps?.some((step) => step.label === "Edit Profile"),
    `click step was not captured: ${sessionSummary()}`,
  );
  assert(
    session.steps?.some((step) => step.element?.field === "email"),
    `input step was not captured: ${sessionSummary()}`,
  );
  assert(
    session.networkEvents?.some((event) => event.status === 500),
    `failed API event was not captured: ${sessionSummary()}`,
  );
  assert(
    session.consoleEvents?.some((event) => event.message.includes("[REDACTED_EMAIL]")),
    `redacted console event was not captured: ${sessionSummary()}`,
  );

  await page.close();
  await extension.close();
  console.log("Runtime smoke validation passed.");
} catch (error) {
  const logTail = interestingChromeLog(browser?.log || "");
  await teardown();
  fail(error instanceof Error ? error.message : String(error), logTail);
} finally {
  await teardown();
}

async function teardown() {
  server.close();
  if (browser) {
    await browser.cleanup();
    browser = undefined;
  }
}

async function waitForStoredSession(extension, predicate, timeoutMs = 5000) {
  const started = Date.now();
  let latest;
  while (Date.now() - started < timeoutMs) {
    latest = await evalJson(
      extension,
      `chrome.storage.local.get("bughunter-state").then((value) => value["bughunter-state"]?.session)`,
    );
    if (predicate(latest)) return latest;
    await delay(150);
  }
  throw new Error(
    `Timed out waiting for runtime evidence: ${JSON.stringify(
      {
        steps: latest?.steps?.map((step) => ({
          type: step.type,
          label: step.label,
          field: step.element?.field,
          route: step.route,
        })),
        network: latest?.networkEvents?.map((event) => ({
          method: event.method,
          path: event.path,
          status: event.status,
        })),
        console: latest?.consoleEvents?.map((event) => ({ level: event.level, message: event.message })),
      },
      null,
      2,
    )}`,
  );
}

async function triggerConsoleEvidence(page, extension, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await page.send("Runtime.evaluate", {
      expression: `console.error('Smoke failure for qa@example.com')`,
      awaitPromise: true,
    });
    const session = await evalJson(
      extension,
      `chrome.storage.local.get("bughunter-state").then((value) => value["bughunter-state"]?.session)`,
    );
    if (session?.consoleEvents?.some((event) => event.message.includes("[REDACTED_EMAIL]"))) return;
    await delay(150);
  }
  throw new Error("Timed out waiting for redacted console evidence after explicit console trigger.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fail(message, logTail = "") {
  const logSuffix = logTail ? `\nChrome log tail:\n${logTail}` : "";
  console.error(`Runtime smoke validation failed: ${message}${logSuffix}`);
  process.exit(1);
}
