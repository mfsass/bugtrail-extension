# BugHunter Chrome Web Store Listing Copy

Paste-ready content for the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Every field below maps to a field in the dashboard. Character limits are Google's.

---

## Store Listing tab

### Item name (max 75)

```
BugHunter
```

### Summary (max 132)

```
Turn QA clicks into developer-ready bug reports with steps, API calls, and console errors.
```

> This string must stay identical to `description` in `wxt.config.ts`.
> `npm run validate:package` fails the build if the two drift apart.

### Category

`Developer Tools`

### Language

`English (United States)`

### Detailed description (max 16,000)

```
BugHunter is a QA handoff tool. It rides along in the browser side panel while you
reproduce a bug, then hands your developers a report they can actually act on.

No more "it doesn't work on my machine." No more screenshots with no context.

WHAT IT CAPTURES

While you reproduce the issue, BugHunter records:

• Every click, input, selection, and form submit, in order
• Route changes as you move through the app
• API calls, including method, path, status, duration, and request payload
• Failed API calls, kept visible even in a long, noisy session
• Console errors, warnings, uncaught exceptions, and unhandled promise rejections
• Element details for each step: selector, test id, component, label, and text

Each API call and console error is correlated with the step that triggered it, so a
developer reading the report sees the cause next to the symptom.

WHAT YOU HAND OVER

Press stop, add what you expected and what actually happened, and BugHunter builds a
Markdown report containing the environment, numbered reproduction steps, element
selectors, API evidence, and console output. Copy it to the clipboard or save it as a
.md file, then paste it straight into a ticket or a pull request.

You can also copy a screenshot of the app tab to your clipboard to attach alongside it.

LOCAL-FIRST, BY DESIGN

BugHunter has no backend. There is no account, no sign-in, and no telemetry.

• Everything is stored in chrome.storage.local, in your own browser profile
• Nothing is transmitted off your machine by this extension
• "Clear" removes the stored trail
• Evidence is capped so long QA sessions cannot fill local storage
• A trail left recording for 8 hours is stopped automatically

REDACTION

Before evidence is rendered or stored, BugHunter masks common sensitive values:
email addresses, phone numbers, bearer tokens, password, session, cookie, secret,
OTP and CVV-like values, card-like numbers, and sensitive payload keys.

Screenshots are pixel images and are NOT redacted. Avoid capturing screens showing
real customer data, or crop before sharing.

SITE ACCESS YOU CONTROL

BugHunter only runs where you tell it to. It ships with access to its configured
internal environments and localhost. For any other app, click "Add this site" once and
approve the browser's own permission prompt. Sites you have added are listed in the
panel and can be removed at any time.

BugHunter cannot record on browser pages such as chrome://extensions.

BUILT FOR

QA engineers, support engineers, product managers, and anyone who files bugs that
developers have to reproduce.
```

---

## Privacy tab

### Single purpose description

```
BugHunter records a user-initiated QA reproduction trail in the active browser tab and
formats it as a developer-ready bug report. The side panel UI, the recording, and the
Markdown report export all serve that single purpose.
```

### Permission justifications

Paste each into its matching field.

**`storage`**

```
Stores the active trail and the completed report locally in chrome.storage.local so the
side panel survives reloads, service worker restarts, and tab switches during a QA
session. No data is sent anywhere; "Clear" deletes it.
```

**`sidePanel`**

```
Provides the recording and report UI in the browser side panel, so BugHunter does not
inject visible interface elements into the application being tested and does not alter
the page the tester is reproducing the bug on.
```

**`scripting`**

```
Injects the recording content script into the tab being recorded, and into sites the
user has explicitly added through the "Add this site" flow. Injection only happens for
origins the user has granted.
```

**`activeTab`**

```
Lets the user start a trail on the tab they currently have open, and backs the
"Copy screenshot" action, which captures the visible app tab to the clipboard on
explicit user click.
```

**`tabs`**

```
Reads the active tab's id, URL, and title so a recording is bound to the correct tab,
so the report records which environment was tested, and so recording stops when that
tab goes away.
```

**`webRequest`**

```
Observes API requests for the single tab being recorded, to capture method, path,
status, duration, and request body as bug evidence. This is observation only; BugHunter
does not use blocking webRequest and does not modify, redirect, or cancel any request.
The listener is scoped to the recording tab at runtime and is torn down when the trail
stops or is cleared.
```

**Host permissions**

```
The built-in host permissions are the internal web applications this extension is
operated on, plus localhost and 127.0.0.1 for local development. The content script is
statically registered only for those origins.
```

**Optional host permissions (`http://*/*`, `https://*/*`)**

```
Declared as OPTIONAL so a tester can record on another internal application without
waiting for a new extension release. They are not static content-script matches and
grant nothing on install. The user must click "Add this site" and approve Chrome's own
permission prompt before a content script is registered for that origin; granted sites
are listed in the panel and can be revoked there.
```

**Remote code**

```
No. All code is bundled in the package. The extension loads no remote scripts and uses
no eval.
```

### Data usage disclosures

Check these boxes to match actual behavior:

| Data type | Collected? |
|---|---|
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | No |

> BugHunter reads page activity to build the report, but the report never leaves the
> user's machine. Google's disclosures cover *collection* — transmission to the
> developer or a third party. BugHunter transmits nothing, so every box is "No".
> If a reviewer questions this, point them at the privacy policy and
> `docs/permissions-and-privacy.md`.

### Certifications

Tick all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

Host `docs/store/privacy-policy.md` at a public URL and paste it here.
See the hosting step in `docs/store/launch-checklist.md`.

---

## Graphic assets

Generated from the real extension UI by `npm run capture:store`.

| Asset | Size | File |
|---|---|---|
| Screenshot 1 | 1280x800 | `docs/store/screenshots/01-record-the-trail.png` |
| Screenshot 2 | 1280x800 | `docs/store/screenshots/02-evidence-attached.png` |
| Screenshot 3 | 1280x800 | `docs/store/screenshots/03-developer-ready-report.png` |
| Small promo tile | 440x280 | `docs/store/screenshots/promo-small-440x280.png` |
| Marquee promo tile | 1400x560 | `docs/store/screenshots/promo-marquee-1400x560.png` |
| Store icon | 128x128 | `assets/icon-128.png` |

The screenshots show a local demo app with obviously fake member data. No real customer
record, internal hostname, or production screen appears in any published asset.

---

## Distribution tab

| Field | Value |
|---|---|
| Visibility | **Unlisted** (or **Private** if everyone installing is in the Workspace domain) |
| Distribution | All regions |
| Pricing | Free |

See `docs/store/launch-checklist.md` for how to choose between Private, Unlisted, and
Public, and what each one costs you in review scrutiny.
