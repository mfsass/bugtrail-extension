# BugHunter Privacy Policy

**Last updated: 10 October 2026**
**Applies to: BugHunter Chrome extension, version 1.0.0 and later**

> This document is written to be published at a public URL and referenced from the
> Chrome Web Store listing. Keep the "Last updated" date current when you change it.

## Summary

BugHunter does not collect your data. It has no backend server, no account, no sign-in,
and no analytics. Everything it records stays in your own browser profile until you
delete it.

## What BugHunter records

When you explicitly start a trail, BugHunter records the following from the tab you are
recording, for the purpose of building a bug report:

- Clicks, text input, selections, and form submissions
- Route and URL changes within the application
- API request summaries: method, path, status code, duration, and request payload
- Console errors, warnings, uncaught exceptions, and unhandled promise rejections
- Element details for each step: tag, selector, test id, component annotation, ARIA label, and visible text
- The application name, environment, and page title you are testing
- The text you type into the actual result, expected result, and notes fields

Recording only happens between the moment you press **Start Trail** and the moment you
press **Stop**. BugHunter does not record in the background, and it does not record on
tabs other than the one bound to the active trail.

## Where that data goes

Nowhere.

All recorded data is written to `chrome.storage.local`, which is local storage inside
your own browser profile on your own machine. BugHunter has no server endpoint and
makes no outbound network requests of its own. The developer of BugHunter cannot see
your trails.

Data leaves your machine only when **you** choose to move it — by using **Copy report**,
**Save .md**, or **Copy screenshot**, and then pasting or uploading that content
somewhere yourself. At that point it is governed by wherever you put it.

## How long it is kept

- A trail stays in local storage until you press **Clear**, or until it is replaced by a newer trail.
- Evidence within a trail is capped at 300 steps, 200 network events, and 100 console events. Older entries roll off.
- A trail left recording for more than 8 hours is stopped automatically.
- Uninstalling the extension removes its local storage.

## Redaction

Before evidence is displayed or stored, BugHunter masks values that commonly carry
sensitive data:

- Email addresses and phone numbers
- Bearer tokens and token values in query strings
- Values for keys named like password, session, cookie, secret, OTP, or CVV
- Card-like number sequences
- Sensitive payload keys, including password, token, authorization, cookie, session, secret, OTP, CVV, PAN, ID number, email, phone, and card
- Text you type into the actual result, expected result, and notes fields

Redaction is a safety net based on pattern matching, not a guarantee. Do not rely on it
to sanitise a report containing highly sensitive data — review the report before you
share it.

**Screenshots are not redacted.** The **Copy screenshot** action copies the visible app
tab to your operating system clipboard as a pixel image. It is never stored by
BugHunter. Avoid capturing screens that show real personal or customer data, or crop
the image before sharing it.

## Site access

BugHunter runs only on sites it has been granted access to.

- It ships with access to its configured internal environments, plus `localhost` and `127.0.0.1`.
- For any other site, you must click **Add this site** and approve Chrome's own permission prompt. Nothing is granted silently.
- Sites you have added are listed in the side panel and can be removed there at any time.
- BugHunter cannot run on browser pages such as `chrome://extensions`.

## Permissions and why they exist

| Permission | Why |
|---|---|
| `storage` | Keep the active trail and report in local storage across reloads |
| `sidePanel` | Show the recording UI without injecting interface into the tested app |
| `scripting` | Inject the recording script into the recorded tab and user-approved sites |
| `activeTab` | Act on the tab you currently have open; back the screenshot action |
| `tabs` | Bind the recording to the correct tab and record which environment was tested |
| `webRequest` | Observe API calls in the recorded tab as bug evidence (observation only; nothing is blocked or modified) |
| Optional all-URLs host access | Let you add another internal app yourself, only after you approve the prompt |

## What BugHunter never does

- It does not sell or transfer your data to third parties.
- It does not use your data for advertising, credit, or lending decisions.
- It does not use your data for any purpose unrelated to producing your bug report.
- It does not load or execute remote code. All code ships inside the extension package.
- It does not track you across sites or build a profile of your browsing.

## Children

BugHunter is a developer and QA tool. It is not directed at children and does not
knowingly collect data from anyone.

## Changes

Material changes to this policy will be published here with an updated date, and the
extension version that introduces them will be noted in the release notes.

## Contact

Questions about this policy or about how BugHunter handles data should go to the
BugHunter maintainers.

<!-- Before publishing: replace this line with a real contact email or support URL.
     The Chrome Web Store requires reachable contact details for the listing. -->
