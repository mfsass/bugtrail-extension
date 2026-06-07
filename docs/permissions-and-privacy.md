# BugTrail Permissions And Privacy Review

BugTrail is a local-first QA handoff extension. It records a user-started reproduction trail and stores that trail in `chrome.storage.local` until QA copies, saves, or clears it.

## Data Storage

- Stored locally in the browser profile: active trail state, reproduced steps, API summaries, console summaries, report notes, and user-granted site origins.
- Not sent by BugTrail: BugTrail has no backend endpoint and does not transmit reports outside the browser.
- Cleared by user action: `Clear` removes the stored trail state.
- Bounded storage: old evidence rolls off after 300 steps, 200 network events, and 100 console events.
- Stale recordings: active trails older than 8 hours are auto-stopped when restored.

## Redaction

BugTrail redacts sensitive values before rendering or storing report-ready evidence where practical:

- Email addresses
- Phone numbers
- Bearer tokens and token query values
- Password, session, cookie, secret, OTP, and CVV-like query values
- Card-like numbers
- Sensitive payload keys such as password, token, authorization, cookie, session, secret, OTP, CVV, PAN, ID number, email, phone, and card
- QA-entered report text in actual result, expected result, and notes

## Screenshots

BugTrail can copy a screenshot of the visible app tab to the clipboard via the `Copy screenshot` button (using `chrome.tabs.captureVisibleTab`):

- The capture is user-initiated, copied directly to the OS clipboard, and never stored by BugTrail or written to `chrome.storage.local`.
- The BugTrail side panel is browser UI, not page content, so it does not appear in the capture.
- Screenshots are pixel images and are **not** redacted. QA should avoid capturing screens that show sensitive personal or customer data, or crop/redact before sharing.

## Permission Rationale

### `storage`

Used to persist the active trail and completed report locally so the side panel can update across browser events and recover after reload.

### `sidePanel`

Used to provide the QA recording interface without injecting visible UI into the tested application.

### `scripting`

Used to inject the content script into the active recording tab and into user-approved optional sites.

### `activeTab`

Used to work with the currently selected QA app tab when the user starts a trail or grants site access.

### `tabs`

Used to identify the active tab URL, title, and tab ID so recording is attached to the correct browser tab.

### `webRequest`

Used to capture API request summaries and request bodies for the active recording tab. This is scoped at runtime to the active recording tab and stopped when the trail stops.

## Host Access

### Built-In Host Permissions

Built-in host access is limited to approved Spur rewards admin environments and local development:

- `https://rewards-admin.spurcorpgifting.com/*`
- `https://rewards-admin-stage.spurcorpgifting.com/*`
- `https://rewards-admin-dev.spurcorpgifting.com/*`
- `http://localhost/*`
- `http://127.0.0.1/*`

### Optional Host Permissions

Optional broad host permissions are declared so QA can add other internal apps without a developer release:

- `http://*/*`
- `https://*/*`

These are not used as static content-script matches. A user must click `Add this site` and approve the browser permission prompt before BugTrail registers a content script for that origin.

## Known Boundaries

- `webRequest` cannot read response bodies, so response summaries depend on the page-level fetch/XHR bridge.
- BugTrail should not be used on personal, customer-facing, or unrelated sites unless site access is intentionally granted for QA work.
- Private Chrome Web Store or Chrome Enterprise distribution should include this permission rationale for reviewer and IT context.
