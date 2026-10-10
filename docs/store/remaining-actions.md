# BugHunter 1.0.0 Remaining Actions

Everything that is still needed before BugHunter goes live on the Chrome Web Store.
The code, package, listing copy, and graphics are done. These items need a person,
an account, or a decision. The full runbook is `docs/store/launch-checklist.md`.

Status as of 10 October 2026. Nothing has been submitted to the store.

## Blocking submission

| # | Action | Owner | Notes |
|---|---|---|---|
| 1 | Register a Chrome Web Store developer account | Account owner | $5 one-time, non-refundable |
| 2 | Complete identity verification and verified contact email | Account owner | Not instant; start first |
| 3 | Choose the publisher: personal account or group publisher | Team | Group publisher avoids tying the listing to one person |
| 4 | Add a real contact email or support URL to `docs/store/privacy-policy.md` | Team | Placeholder comment at the bottom of the file |
| 5 | Host the privacy policy at a public URL | Team | The dashboard needs a URL, not a repo file |
| 6 | Choose visibility: Private, Unlisted, or Public | Team | Recommended: Private if all testers are on the Workspace domain, else Unlisted |

## Blocking go-live confidence

| # | Action | Owner | Notes |
|---|---|---|---|
| 7 | Run the authenticated Spur admin pilot and fill in `docs/live-pilot-checklist.md` | QA | Needs real credentials; not automated and not done |
| 8 | Walk the manual verification items in `docs/store/launch-checklist.md`, Phase 2 | QA | Includes light and dark theme |

## Should decide before launch

| # | Action | Notes |
|---|---|---|
| 9 | Commission or approve new logo art | The mascot icon is a walking bug on a trail, which still suits the old name. The old brand PNG with the "BugTrail" wordmark was replaced with a generated tile, not repainted |
| 10 | Decide whether to rename the GitHub repository | It is still `mfsass/bugtrail-extension`. Renaming redirects old links, but check any CI or docs that hardcode the URL |
| 11 | Review the manifest permissions with whoever owns store review | The optional `http://*/*` and `https://*/*` host permissions are the likeliest review question. The checklist has the response and a fallback |

## Known limits, not blockers

- Screenshots copied by the user are not redacted. This is documented in the policy and listing.
- Response summaries depend on the page bridge, because `webRequest` cannot read bodies.
- Pilot installs lose any unfinished BugTrail trail on upgrade, because the storage key changed.

## After approval

Follow Phase 5 of `docs/store/launch-checklist.md`: install from the store on a clean
profile, re-run the smoke items, send QA the install link, have them remove the old
unpacked BugTrail install, and tag the release commit.
