/**
 * Captures Chrome Web Store listing screenshots from the real built extension.
 *
 * Every pixel of UI in the output comes from the actual side panel and a local
 * demo app - nothing is mocked up in a design tool. The script drives a real
 * recording, screenshots the side panel and the demo app, then composes them
 * onto the 1280x800 canvas the Web Store requires.
 *
 * Output: docs/store/screenshots/*.png
 */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

const STORE_WIDTH = 1280;
const STORE_HEIGHT = 800;
const PANEL_WIDTH = 440;
const PANEL_HEIGHT = 1180;

const outputDir = join(process.cwd(), "docs", "store", "screenshots");
const builtExtensionPath = resolveBuiltExtension();

// A deliberately generic demo admin screen. All data is obviously fake so the
// published listing never shows real customer records.
const demoAppHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Demo Rewards Admin</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #16334e;
        background: #eef2f6;
      }
      .app { display: grid; grid-template-columns: 216px 1fr; min-height: 100vh; }
      .side { background: #16334e; color: #cfe3ea; padding: 22px 16px; }
      .side h1 { font-size: 15px; margin: 0 0 24px; color: #fff; letter-spacing: .2px; }
      .side a {
        display: block; padding: 9px 12px; border-radius: 8px;
        color: #cfe3ea; text-decoration: none; margin-bottom: 4px; font-size: 13px;
      }
      .side a.on { background: #1b6d76; color: #fff; font-weight: 600; }
      .main { padding: 26px 30px; }
      .crumb { color: #5b7891; font-size: 12px; margin-bottom: 6px; }
      h2 { margin: 0 0 20px; font-size: 22px; }
      .card {
        background: #fff; border: 1px solid #dbe4ec; border-radius: 12px;
        padding: 22px; box-shadow: 0 1px 2px rgba(22,51,78,.05);
      }
      .columns { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 20px; max-width: 980px; }
      .activity li {
        list-style: none; padding: 11px 0; border-bottom: 1px solid #eef2f6;
        font-size: 13px; display: flex; justify-content: space-between; gap: 12px;
      }
      .activity li:last-child { border-bottom: 0; }
      .activity ul { margin: 0; padding: 0; }
      .activity time { color: #8aa2b5; font-size: 11px; white-space: nowrap; }
      .pill {
        display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .5px;
        text-transform: uppercase; padding: 3px 8px; border-radius: 999px; margin-bottom: 14px;
        background: #e6f3f2; color: #1b6d76;
      }
      .card h3 { margin: 0 0 18px; font-size: 15px; }
      label { display: block; margin-bottom: 15px; font-size: 12px; color: #5b7891; font-weight: 600; }
      input {
        display: block; width: 100%; margin-top: 6px; padding: 9px 11px; font-size: 14px;
        border: 1px solid #c6d4e0; border-radius: 8px; color: #16334e; background: #fff;
      }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .actions { display: flex; gap: 10px; margin-top: 6px; }
      button {
        font: inherit; font-weight: 600; padding: 9px 18px; border-radius: 8px; cursor: pointer;
        border: 1px solid transparent;
      }
      .primary { background: #1b6d76; color: #fff; }
      .ghost { background: #fff; color: #16334e; border-color: #c6d4e0; }
      .stats { display: flex; gap: 14px; margin-bottom: 22px; }
      .stat { background: #fff; border: 1px solid #dbe4ec; border-radius: 12px; padding: 14px 18px; min-width: 132px; }
      .stat b { display: block; font-size: 20px; }
      .stat span { font-size: 11px; color: #5b7891; text-transform: uppercase; letter-spacing: .6px; }
      .err { display: none; margin-top: 16px; padding: 11px 13px; border-radius: 8px;
             background: #fdecec; color: #a32323; border: 1px solid #f3c9c9; font-size: 13px; }
      .err.show { display: block; }
    </style>
  </head>
  <body>
    <div class="app">
      <nav class="side">
        <h1>Demo Rewards Admin</h1>
        <a href="#/dashboard">Dashboard</a>
        <a class="on" href="#/members">Members</a>
        <a href="#/rewards">Rewards</a>
        <a href="#/orders">Orders</a>
        <a href="#/reports">Reports</a>
        <a href="#/settings">Settings</a>
      </nav>
      <main class="main">
        <p class="crumb">Members / Member 4821</p>
        <h2>Edit member</h2>
        <div class="stats">
          <div class="stat"><b>12,480</b><span>Points</span></div>
          <div class="stat"><b>Gold</b><span>Tier</span></div>
          <div class="stat"><b>38</b><span>Orders</span></div>
        </div>
        <div class="columns">
        <div class="card">
          <h3>Member details</h3>
          <div class="row">
            <label>First name<input id="first" name="firstName" value="Demo" /></label>
            <label>Last name<input id="last" name="lastName" value="Member" /></label>
          </div>
          <label>Points balance<input id="points" name="points" value="12480" /></label>
          <div class="actions">
            <button class="primary" data-testid="save-button" data-bughunter-component="Members.SaveButton">Save changes</button>
            <button class="ghost" data-testid="cancel-button" data-bughunter-component="Members.CancelButton">Cancel</button>
          </div>
          <p class="err" id="err">Save failed: the server rejected the points adjustment.</p>
        </div>
        <div class="card activity">
          <span class="pill">Stage</span>
          <h3>Recent activity</h3>
          <ul>
            <li><span>Points adjusted &minus;250</span><time>2h ago</time></li>
            <li><span>Reward redeemed</span><time>Yesterday</time></li>
            <li><span>Tier upgraded to Gold</span><time>3 days ago</time></li>
            <li><span>Order #10428 placed</span><time>6 days ago</time></li>
            <li><span>Member created</span><time>12 Jan</time></li>
          </ul>
        </div>
        </div>
      </main>
    </div>
    <script>
      document.querySelector('[data-testid="save-button"]').addEventListener('click', async () => {
        try {
          await fetch('/api/members/4821/points', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ points: 12480 }),
          });
        } catch {}
        document.getElementById('err').classList.add('show');
        console.error('PointsAdjustmentError: server rejected adjustment for member 4821');
      });
    </script>
  </body>
</html>`;

const server = createServer((request, response) => {
  if (request.url?.startsWith("/api/")) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Points adjustment rejected" }));
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(demoAppHtml);
});

/** Frame template: real screenshots composed onto the exact Web Store canvas. */
function framePage({ caption, subcaption, appPng, panelPng, panelScale, panelOffset = 0 }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; }
      html, body { width: ${STORE_WIDTH}px; height: ${STORE_HEIGHT}px; overflow: hidden; }
      body {
        font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        background: linear-gradient(145deg, #103b48 0%, #16334e 55%, #0e2a3c 100%);
        position: relative;
      }
      .copy { position: absolute; top: 46px; left: 64px; right: 64px; z-index: 3; }
      .copy h1 {
        font-size: 34px; line-height: 1.15; color: #fff; font-weight: 700; letter-spacing: -.4px;
      }
      .copy p { margin-top: 10px; font-size: 16px; color: #9fc6d2; max-width: 720px; }
      .stage {
        position: absolute; top: 168px; left: 64px; right: 64px; bottom: 44px;
      }
      .app-shot {
        position: absolute; inset: 0 ${Math.round(PANEL_WIDTH * panelScale) - 40}px 0 0;
        border-radius: 12px 0 0 12px; overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,.42);
        background: #eef2f6;
      }
      .app-shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; }
      .panel-shot {
        position: absolute; top: -26px; right: 0; bottom: -10px;
        width: ${Math.round(PANEL_WIDTH * panelScale)}px;
        border-radius: 12px; overflow: hidden;
        box-shadow: 0 26px 70px rgba(0,0,0,.52);
        border: 1px solid rgba(255,255,255,.14);
        background: #0f2733;
      }
      .panel-shot img { display: block; width: 100%; margin-top: -${Math.round(panelOffset * panelScale)}px; }
    </style>
  </head>
  <body>
    <div class="copy">
      <h1>${caption}</h1>
      <p>${subcaption}</p>
    </div>
    <div class="stage">
      <div class="app-shot"><img src="data:image/png;base64,${appPng}" alt="" /></div>
      <div class="panel-shot"><img src="data:image/png;base64,${panelPng}" alt="" /></div>
    </div>
  </body>
</html>`;
}

function promoPage({ width, height, logo, title, tagline, gap, logoDataUri }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
      body {
        display: flex; align-items: center; justify-content: center; gap: ${gap}px;
        font: 400 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        background: linear-gradient(145deg, #103b48 0%, #16334e 55%, #0e2a3c 100%);
      }
      img { width: ${logo}px; height: ${logo}px; display: block; }
      h1 { font-size: ${title}px; color: #fff; font-weight: 700; letter-spacing: -.5px; line-height: 1.05; }
      p { margin-top: ${Math.round(tagline * 0.45)}px; font-size: ${tagline}px; color: #9fc6d2; }
    </style>
  </head>
  <body>
    <img src="${logoDataUri}" alt="" />
    <div>
      <h1>BugHunter</h1>
      <p>Turn QA clicks into developer-ready bug reports.</p>
    </div>
  </body>
</html>`;
}

let browser;

try {
  await mkdir(outputDir, { recursive: true });
  const port = await listen(server);
  const appUrl = `http://localhost:${port}/`;
  browser = await launchChrome({
    builtExtensionPath,
    startUrl: appUrl,
    windowSize: `${STORE_WIDTH},${STORE_HEIGHT + 120}`,
  });
  const { debugPort, userDataDir, extensionPath } = browser;

  await waitForDebugger(debugPort);
  const extensionIds = await findExtensionIds(debugPort, userDataDir, extensionPath);
  const appTarget = await findPageTarget(debugPort, appUrl);
  const { target: panelTarget } = await openExtensionPage(debugPort, extensionIds);

  const app = await CdpSession.connect(appTarget.webSocketDebuggerUrl);
  const panel = await CdpSession.connect(panelTarget.webSocketDebuggerUrl);
  await app.send("Runtime.enable");
  await app.send("Page.enable");
  await panel.send("Runtime.enable");
  await panel.send("Page.enable");

  // Drive a genuine recording so the panel renders real captured evidence.
  const appTab = await evalJson(
    panel,
    `
    chrome.tabs.query({}).then((tabs) => tabs
      .map((tab) => ({ id: tab.id, url: tab.url, pendingUrl: tab.pendingUrl, title: tab.title }))
      .find((tab) => (tab.url || tab.pendingUrl || "").startsWith("${appUrl}") || tab.title === "Demo Rewards Admin"))
  `,
  );
  if (!appTab?.id) throw new Error("Demo app tab was not found.");

  const started = await evalJson(
    panel,
    `chrome.runtime.sendMessage({ kind: "bughunter:start", tabId: ${appTab.id}, app: "Demo Rewards Admin", environment: "Stage" })`,
  );
  if (!started?.ok) throw new Error(`Could not start the demo trail: ${JSON.stringify(started)}`);
  await waitForPageCondition(app, "window.__bughunterBridgeReady === true", "Page bridge did not become ready.");

  await activateTarget(debugPort, appTarget.id);
  await app.send("Page.bringToFront");
  await clickSelector(debugPort, appTarget.id, app, "#points");
  await app.send("Runtime.evaluate", {
    expression: `
      const points = document.querySelector('#points');
      points.value = '12480';
      points.dispatchEvent(new Event('input', { bubbles: true }));
      points.dispatchEvent(new Event('change', { bubbles: true }));
    `,
    awaitPromise: true,
  });
  await clickSelector(debugPort, appTarget.id, app, '[data-testid="save-button"]');
  await waitForStoredEvidence(panel, app);

  // The demo app at exactly the listing canvas size.
  await app.send("Emulation.setDeviceMetricsOverride", {
    width: STORE_WIDTH,
    height: STORE_HEIGHT,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await delay(400);
  const appPng = await capture(app);

  // Side panel mid-recording, at a realistic panel width.
  const panelShots = {};
  await panel.send("Emulation.setDeviceMetricsOverride", {
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await delay(600);
  panelShots.recording = await capture(panel);

  // Stop the trail to produce the finished, developer-ready report.
  const stopped = await evalJson(
    panel,
    `chrome.runtime.sendMessage({ kind: "bughunter:stop", actualResult: "Saving a points adjustment fails with a 500 and the balance is unchanged.", expectedResult: "The points balance saves and the member record shows 12,480 points.", notes: "Reproduced on Stage, three times in a row." })`,
  );
  if (!stopped?.ok) throw new Error(`Could not stop the demo trail: ${JSON.stringify(stopped)}`);
  await delay(700);
  panelShots.report = await capture(panel);

  // Page.captureScreenshot with captureBeyondViewport always starts at the top of
  // the document, so scrolling cannot frame a lower section. Measure the document
  // offsets instead and crop the full-page capture when composing each frame.
  const timelineOffset = await evalJson(
    panel,
    `(() => {
      const node = document.querySelector('.timeline');
      return node ? Math.round(node.getBoundingClientRect().top + window.scrollY) : 0;
    })()`,
  );

  // The report preview is capped at 280px with its own scrollbar in normal use.
  // Lift the cap for this capture so the listing shows the real generated Markdown
  // rather than a scrollbar stub. This changes only the screenshot, not the product.
  const previewOffset = await evalJson(
    panel,
    `(() => {
      const pre = document.querySelector('.preview pre');
      if (!pre) return 0;
      pre.style.maxHeight = 'none';
      pre.style.overflow = 'visible';
      const section = document.querySelector('.preview');
      return Math.round(section.getBoundingClientRect().top + window.scrollY);
    })()`,
  );
  if (!previewOffset) throw new Error("Report preview section was not rendered in the side panel.");
  await delay(400);
  panelShots.markdown = await capture(panel);

  const frames = [
    {
      file: "01-record-the-trail.png",
      caption: "Record the bug while you reproduce it",
      subcaption:
        "BugHunter rides along in the side panel, capturing every click, input, and route change as you walk through the steps.",
      panelPng: panelShots.recording,
      panelScale: 0.62,
    },
    {
      file: "02-evidence-attached.png",
      caption: "Failed API calls and console errors, attached to the step",
      subcaption:
        "Each request and console error is correlated with the action that triggered it - so the cause is next to the symptom.",
      panelPng: panelShots.markdown,
      panelScale: 0.62,
      panelOffset: Math.max(0, timelineOffset - 16),
    },
    {
      file: "03-developer-ready-report.png",
      caption: "Hand over a developer-ready report",
      subcaption:
        "Copy or save a Markdown report with steps, environment, API evidence, and console output. Sensitive values are redacted.",
      panelPng: panelShots.markdown,
      panelScale: 0.62,
      panelOffset: Math.max(0, previewOffset - 16),
    },
  ];

  // Compose each frame in a real page, then screenshot at exactly 1280x800.
  const { target: frameTarget } = await openBlankPage(debugPort);
  const frame = await CdpSession.connect(frameTarget.webSocketDebuggerUrl);
  await frame.send("Page.enable");
  await frame.send("Runtime.enable");
  await frame.send("Emulation.setDeviceMetricsOverride", {
    width: STORE_WIDTH,
    height: STORE_HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const spec of frames) {
    const html = framePage({ ...spec, appPng });
    await frame.send("Page.navigate", {
      url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    });
    await waitForPageCondition(
      frame,
      "document.readyState === 'complete' && [...document.images].every((image) => image.complete && image.naturalWidth > 0)",
      `Frame assets did not load for ${spec.file}`,
      10000,
    );
    await delay(300);
    const png = await capture(frame, { width: STORE_WIDTH, height: STORE_HEIGHT });
    await writeFile(join(outputDir, spec.file), Buffer.from(png, "base64"));
    console.log(`Captured ${spec.file} (${STORE_WIDTH}x${STORE_HEIGHT})`);
  }

  // Promotional tiles, built from the real brand mark.
  const logoSvg = await readFile(join(process.cwd(), "assets", "bughunter-logo.svg"), "utf8");
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg, "utf8").toString("base64")}`;

  for (const tile of [
    { file: "promo-small-440x280.png", width: 440, height: 280, logo: 92, title: 30, tagline: 13, gap: 16 },
    { file: "promo-marquee-1400x560.png", width: 1400, height: 560, logo: 208, title: 76, tagline: 27, gap: 40 },
  ]) {
    await frame.send("Emulation.setDeviceMetricsOverride", {
      width: tile.width,
      height: tile.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const html = promoPage({ ...tile, logoDataUri });
    await frame.send("Page.navigate", { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
    await waitForPageCondition(
      frame,
      "document.readyState === 'complete' && [...document.images].every((image) => image.complete && image.naturalWidth > 0)",
      `Promo assets did not load for ${tile.file}`,
      10000,
    );
    await delay(250);
    const png = await capture(frame, { width: tile.width, height: tile.height });
    await writeFile(join(outputDir, tile.file), Buffer.from(png, "base64"));
    console.log(`Captured ${tile.file} (${tile.width}x${tile.height})`);
  }

  await app.close();
  await panel.close();
  await frame.close();
  console.log(`Store assets written to docs/store/screenshots`);
} catch (error) {
  const logTail = interestingChromeLog(browser?.log || "");
  await teardown();
  const suffix = logTail ? `\nChrome log tail:\n${logTail}` : "";
  console.error(`Store asset capture failed: ${error instanceof Error ? error.message : String(error)}${suffix}`);
  process.exit(1);
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

async function capture(session, clip) {
  const params = { format: "png", captureBeyondViewport: true };
  if (clip) params.clip = { x: 0, y: 0, ...clip, scale: 1 };
  const result = await session.send("Page.captureScreenshot", params);
  if (!result?.data) throw new Error("Screenshot capture returned no data.");
  return result.data;
}

async function openBlankPage(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not open a composition tab: ${response.status}`);
  const target = await response.json();
  if (!target?.webSocketDebuggerUrl) throw new Error("Composition tab has no websocket.");
  return { target };
}

/**
 * The webRequest listener can attach a beat after the trail starts, so a single
 * save click is racy. Re-fire the save until the failed call is recorded.
 */
async function waitForStoredEvidence(panel, app, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastRetry = Date.now();
  let session;
  while (Date.now() - startedAt < timeoutMs) {
    session = await evalJson(
      panel,
      `chrome.storage.local.get("bughunter-state").then((value) => value["bughunter-state"]?.session)`,
    );
    if (session?.networkEvents?.some((event) => event.status === 500) && session?.steps?.length >= 2) return;
    if (Date.now() - lastRetry > 2500) {
      lastRetry = Date.now();
      await app.send("Runtime.evaluate", {
        expression: `document.querySelector('[data-testid="save-button"]').click()`,
        awaitPromise: true,
      });
    }
    await delay(200);
  }
  throw new Error(
    `Demo recording did not capture the expected evidence. Captured: ${JSON.stringify({
      steps: session?.steps?.map((step) => step.label),
      network: session?.networkEvents?.map((event) => `${event.method} ${event.path} -> ${event.status}`),
    })}`,
  );
}
