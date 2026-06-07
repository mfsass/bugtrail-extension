# BugTrail Extension

BugTrail is a local-first Chrome/Brave extension for QA to developer handoff. It records a manual reproduction journey and outputs one Markdown-style report with steps, routes, console errors, API calls, payloads, and response summaries where available.

## Development

```powershell
npm install
npm test
npm run compile
npm run build
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome or Brave.

WXT 0.20 requires Node 20.19+. If your shell uses Node 18, use the bundled Codex Node runtime or install a current Node LTS.

Run all production checks with:

```powershell
npm run verify
```

Run the complete release gate before sharing a pilot build:

```powershell
npm run verify:release
```

Run the browser-level runtime smoke after a successful build:

```powershell
$env:BUGTRAIL_BROWSER='C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
npm run smoke:runtime
```

`BUGTRAIL_BROWSER` is optional when Chrome is installed in a standard location. The smoke test loads the built extension into a temporary browser profile, records a local fixture flow, and verifies captured clicks, input, failed API evidence, and redacted console output.

## Supported Sites

BugTrail includes built-in access for:

- `https://rewards-admin.spurcorpgifting.com/*`
- `https://rewards-admin-stage.spurcorpgifting.com/*`
- `https://rewards-admin-dev.spurcorpgifting.com/*`
- `http://localhost/*`
- `http://127.0.0.1/*`

For any other QA app, open the app and click `Add this site` in the side panel. Chrome asks once, then BugTrail remembers that site. User-added sites can be removed from the side panel.

BugTrail infers app and environment names from known Spur admin URLs, localhost, and common host patterns such as `stage`, `dev`, `qa`, `test`, and `uat`. QA can still override those fields before starting a trail.

## Install for QA Pilot

### Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select `.output/chrome-mv3`.
6. Open one of the supported sites.
7. Open the BugTrail side panel and click `Start Trail`.
8. For another internal app, open that app and click `Add this site` once.

### Brave

Use the same flow at `brave://extensions`.

## Update an Existing Unpacked Install

1. Pull or receive the latest project files.
2. Run `npm install` if dependencies changed.
3. Run `npm run build`.
4. Go to `chrome://extensions` or `brave://extensions`.
5. Click the reload button on the BugTrail extension card.

## Create a Shareable Zip

```powershell
npm run zip
```

Share the generated zip from `.output`. QA users should unzip it first, then load the unzipped `chrome-mv3` folder as an unpacked extension.

Chrome extensions are not normally distributed as `.exe` installers. For a wider rollout, publish privately/unlisted through the Chrome Web Store or use Chrome Enterprise extension policy.

See `docs/qa-install-guide.md` for the QA-facing install and update flow.

## Branding Assets

- Source logo is stored at `assets/bugtrail-logo.svg`.
- Extension icons are expected at:
  - `assets/icon-16.png`
  - `assets/icon-32.png`
  - `assets/icon-48.png`
  - `assets/icon-128.png`
- `npm run validate:package` checks these files in the built output and fails if they are missing.

## QA Workflow

1. Open a supported admin site, or open a new internal app and click `Add this site`.
2. Open the BugTrail side panel.
3. Confirm or override the inferred app/environment, then click `Start Trail`.
4. Reproduce the issue.
5. Click `Mark bug here` when the failure is visible, if useful.
6. Click `Stop Trail`.
7. Fill `Actual result`, `Expected result`, and optional `Notes`.
8. Review the report preview.
9. Click `Copy Report` or `Save .md`.

## Troubleshooting

- If `Start Trail` says the site is not enabled, click `Add this site` while on the app you want to test.
- If no API calls appear, confirm the request path includes `/api/`, `/graphql`, or `/rest/`.
- If response summaries are unavailable, the browser extension fallback captured the request but the page-level fetch/XHR bridge could not read the response body.
- If the side panel does not update after a rebuild, reload the extension from `chrome://extensions`.
