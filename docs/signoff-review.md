# BugTrail Signoff Review

## Implemented Product Requirements

- Records manual QA reproduction flows from a Chrome/Brave side panel.
- Captures page opens, route changes, clicks, inputs, selects, submits, and bug markers.
- Captures console errors, warnings, uncaught errors, and unhandled promise rejections.
- Captures API summaries from `webRequest` and richer fetch/XHR response summaries from the page bridge.
- Deduplicates overlapping page-level and extension-level network captures.
- Correlates network and console events to the closest meaningful user action within the MVP time-window rule, avoiding route-change noise where possible.
- Redacts sensitive payload, field, URL query, and console/report values before display/copy.
- Produces one Markdown-style report with environment, steps, network summary, console output, actual result, expected result, and notes.
- Allows completed reports to be copied or saved as a Markdown file.
- Keeps failed API/error steps visible in the primary reproduced steps even when low-value interactions exceed the report limit.
- Supports built-in trusted sites plus user-added sites through Chrome optional host permissions.
- Infers app/environment context from known Spur admin URLs, localhost, and common environment hostnames while keeping fields overrideable.
- Shows visible side-panel errors and disables action buttons while start/stop/copy/site-access actions are running.
- Packages as an unpacked Chrome MV3 extension and a shareable zip.

## Current Verification Evidence

- `npm test`: validates redaction, report formatting, allowed origins, network dedupe, step grouping, and event correlation.
- `npm run compile`: validates TypeScript strictness.
- `npm run build`: validates WXT production build.
- `npm run validate:package`: validates generated manifest, required output files, icon files, permissions, and static content-script scope.
- `npm run validate:docs`: validates required handoff docs, internal doc links, release-note version alignment, and release artifact references.
- `npm run audit:prod`: validates production dependency audit with dev tooling omitted.
- `npm run zip`: validates shareable package generation.
- `npm run release:metadata`: writes SHA-256 and release metadata for the generated zip.
- `npm run validate:release-metadata`: validates the SHA-256 sidecar and release manifest against the generated zip.
- `npm run smoke:runtime`: validates the built extension in a real Chrome/Brave profile against a local fixture flow with click, input, failed API, console capture, and redaction.
- `npm run verify:release`: runs the complete automated release gate before a pilot zip is shared.

## Manual Spur Runtime Signoff Still Required

Use Chrome or Brave with `.output/chrome-mv3` loaded unpacked.
Record pass/fail evidence in `docs/live-pilot-checklist.md`.
Use `docs/permissions-and-privacy.md` for internal IT or Chrome Web Store permission review.
Use `docs/release-notes-0.1.0.md` for pilot distribution context and rollback notes.

1. Start a trail on `https://rewards-admin-stage.spurcorpgifting.com/`.
2. Add a non-built-in internal app with `Add this site` and confirm the prompt appears once.
3. Confirm the same added site can start recording after extension reload.
4. Record a flow with route changes, click, input value, select or checkbox, successful API call, failed API call, console error, and bug marker.
5. Stop the trail and confirm the report preview is readable.
6. Copy the report and paste it into Teams or a ticket, then save the Markdown file as a fallback artifact.
7. Confirm sensitive values are redacted in step values, payloads, console output, and URL query strings.
8. Remove the user-added site and confirm recording is blocked there afterward.
9. Confirm denied site access and copy/start failures surface as visible side-panel errors.

## Release Recommendation

BugTrail is ready for a controlled QA pilot after the manual runtime signoff above passes and `docs/live-pilot-checklist.md` is filled in. For broader team distribution, move from unpacked install to private Chrome Web Store or Chrome Enterprise policy.
