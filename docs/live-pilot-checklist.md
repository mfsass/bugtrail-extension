# BugHunter Live Pilot Checklist

Use this checklist for the authenticated Spur admin pilot before production signoff.

## Build Under Test

- Version: `1.0.0`
- Package: `.output/bughunter-extension-1.0.0-chrome.zip`
- Browser:
- Tester:
- Date:
- App URL:

## Preflight

- [ ] `npm run verify:release` passed before the package was shared.
- [ ] Extension installed from the current package.
- [ ] BugHunter icon opens the side panel.
- [ ] Built-in Spur admin site starts without `Add this site`.
- [ ] App and environment are inferred correctly.
- [ ] App and environment fields can be overridden before start.

## Core Recording Flow

- [ ] Start Trail works on `https://rewards-admin-stage.spurcorpgifting.com/`.
- [ ] Page open appears in the timeline.
- [ ] Route changes are captured.
- [ ] Button click is captured with a readable label.
- [ ] Text input is captured and sensitive values are redacted.
- [ ] Select, checkbox, or equivalent control interaction is captured.
- [ ] `Mark bug here` adds a visible bug marker.
- [ ] `Stop Trail` ends recording and shows report preview.

## API And Console Evidence

- [ ] Successful API call appears in Network Summary.
- [ ] Failed API call appears in Network Summary.
- [ ] Failed API remains visible in the reproduced steps.
- [ ] Request payload is redacted.
- [ ] Response summary appears when available.
- [ ] Console error or warning appears when triggered.
- [ ] Console output is redacted.
- [ ] API/console evidence correlates to the relevant user action.

## Report Handoff

- [ ] Actual Result field appears in copied/saved report.
- [ ] Expected Result field appears in copied/saved report.
- [ ] Notes field appears in copied/saved report.
- [ ] `Copy Report` pastes clean Markdown into Teams or ticketing.
- [ ] `Save .md` downloads a Markdown file with a safe filename.
- [ ] Report is readable without extension context.
- [ ] Report contains enough detail for a developer to reproduce.

## Site Access

- [ ] On a non-built-in internal app, `Add this site` prompts once.
- [ ] Added site can start recording after approval.
- [ ] Added site remains trusted after extension reload.
- [ ] Added site appears under Trusted sites.
- [ ] Removing added site blocks recording there again.
- [ ] Denying site access shows a visible error.
- [ ] Unsupported pages such as `chrome://extensions` cannot start recording.

## Privacy And Safety

- [ ] Email addresses are redacted.
- [ ] Phone numbers are redacted.
- [ ] Tokens are redacted.
- [ ] Password/session/cookie-like values are redacted.
- [ ] Card-like values are redacted.
- [ ] Live side-panel timeline does not expose sensitive labels/routes.
- [ ] Recording stops collecting after `Stop Trail`.
- [ ] `Clear` removes the stored trail from the side panel.
- [ ] Stale restored trails show as stopped instead of continuing silently.

## Pilot Result

Decision:

- [ ] Pass: ready for controlled QA rollout.
- [ ] Pass with notes: ready for limited rollout after documented caveats.
- [ ] Fail: fixes required before rollout.

Notes:

```text

```

Links to copied report, saved Markdown file, ticket, or Teams thread:

```text

```
