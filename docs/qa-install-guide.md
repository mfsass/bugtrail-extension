# BugTrail QA Install Guide

## What QA Receives

For a controlled pilot, QA receives the generated zip:

```text
.output/bugtrail-extension-0.1.0-chrome.zip
```

The release builder should also provide:

```text
.output/bugtrail-extension-0.1.0-chrome.zip.sha256
.output/release-manifest.json
docs/release-notes-0.1.0.md
```

Chrome and Brave do not install this like a normal `.exe`. The zip must be extracted first, then loaded as an unpacked extension.

## Verify The Package

On Windows PowerShell, QA or IT can confirm the shared zip matches the release metadata:

```powershell
Get-FileHash .\bugtrail-extension-0.1.0-chrome.zip -Algorithm SHA256
Get-Content .\bugtrail-extension-0.1.0-chrome.zip.sha256
```

The hash values should match.

## Install in Chrome

1. Extract `bugtrail-extension-0.1.0-chrome.zip`.
2. Open `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the extracted `chrome-mv3` folder.
6. Open a supported QA app.
7. Click the BugTrail extension icon to open the side panel.

## Install in Brave

Use the same steps at:

```text
brave://extensions
```

## Update an Existing Install

1. Extract the newest BugTrail zip.
2. Open `chrome://extensions` or `brave://extensions`.
3. On the BugTrail card, click `Remove` or click the reload button after replacing the extracted folder.
4. If removed, click `Load unpacked` and select the new `chrome-mv3` folder.

## Site Access

The Spur rewards admin environments and localhost are built in. For any other internal app:

1. Open the app in the browser.
2. Open the BugTrail side panel.
3. Click `Add this site`.
4. Approve the browser permission prompt.

BugTrail remembers that site. QA does not need to type domains into the extension.

## Release Builder Checklist

Before sharing a new zip, run:

```powershell
$env:BUGTRAIL_BROWSER='C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
npm run verify:release
```

`BUGTRAIL_BROWSER` can be omitted when Chrome is installed in a standard location. This command creates the zip, SHA-256 sidecar, and release manifest.

## Recommended Team Distribution

For a small pilot, share the zip internally and have QA load it unpacked.
Capture pilot evidence with `docs/live-pilot-checklist.md` before wider rollout.

For broader team rollout, use one of these:

- Private or unlisted Chrome Web Store listing.
- Chrome Enterprise ExtensionInstallForcelist policy.
- Brave users can install the Chrome Web Store version in most managed environments.

Avoid shipping an `.exe` installer unless your IT process specifically requires one. Browser extensions are normally distributed as extension packages through browser-managed install flows.
Use `docs/permissions-and-privacy.md` when IT or Chrome Web Store reviewers ask why BugTrail needs its declared permissions.
