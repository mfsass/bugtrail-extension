# BugHunter Chrome Web Store Launch Checklist

Everything needed to publish BugHunter 1.0.0. Work top to bottom on go-live day.
Items marked **BLOCKING** stop a submission; everything else can be fixed after.

---

## Phase 0 — Do these in advance (days, not minutes)

These have external lead times. Start them well before the launch day.

- [ ] **BLOCKING** Register a Chrome Web Store developer account — **$5 one-time fee**, non-refundable.
      <https://chrome.google.com/webstore/devconsole>
- [ ] **BLOCKING** Complete developer identity verification and add a verified contact email.
      New accounts cannot publish until this clears, and it is not instant.
- [ ] Decide the publishing account. For a team-owned extension, create a
      [group publisher](https://developer.chrome.com/docs/webstore/group-publishers)
      so the listing is not tied to one person's personal Google account.
      Migrating an item to a group publisher later is possible but annoying.
- [ ] **BLOCKING** Host the privacy policy at a public URL.
      Source: `docs/store/privacy-policy.md`. Options: a page on the company site, or
      GitHub Pages. The dashboard requires a URL, not a file.
- [ ] Fill in the contact line at the bottom of the privacy policy before hosting it.

### Choose a visibility mode

| Mode | Who can install | Review scrutiny | Use when |
|---|---|---|---|
| **Private** | Only members of your Google Workspace domain | Lightest | Everyone installing has a company Google account |
| **Unlisted** | Anyone with the direct link, not searchable | Full review | Testers are on mixed or personal accounts |
| **Public** | Anyone, searchable | Strictest | You actually want external users |

**Recommended: Private** if the Workspace domain covers all testers; otherwise
**Unlisted**. BugHunter's built-in host permissions point at specific internal
environments, so a public listing invites review questions with no upside.

> **Alternative worth considering:** Chrome Enterprise force-install skips Web Store
> review entirely — IT pushes the extension by ID from a self-hosted update URL. More
> IT coordination, zero review risk. See `docs/production-readiness.md`.

---

## Phase 1 — Pre-flight on the code

- [ ] Working tree is clean and on the release commit.
- [ ] Version in `package.json` and `wxt.config.ts` match and are **higher than any version ever uploaded**.
      Web Store versions are permanent — a number can never be reused, even after a rejection.
- [ ] **BLOCKING** Full release gate is green:

```bash
npm run verify:release
```

That single command runs tests, typecheck, production build, package validation, docs
validation, production dependency audit, zip, release metadata, metadata validation,
and a real-browser runtime smoke test.

- [ ] Confirm the artifacts exist:
  - `.output/bughunter-extension-1.0.0-chrome.zip`
  - `.output/bughunter-extension-1.0.0-chrome.zip.sha256`
  - `.output/release-manifest.json`
- [ ] Confirm the zip contains no source maps and no stray files:

```bash
unzip -l .output/bughunter-extension-1.0.0-chrome.zip
```

- [ ] Regenerate the listing graphics if any UI changed:

```bash
npm run capture:store
```

- [ ] Eyeball all five generated assets in `docs/store/screenshots/`. Check that no real
      hostname, customer name, or production screen leaked into them.

---

## Phase 2 — Manual verification in a real browser

Load `.output/chrome-mv3` unpacked and walk `docs/live-pilot-checklist.md`.
The automated smoke test covers the happy path; these are the things it cannot see.

- [ ] Icon opens the side panel.
- [ ] A built-in environment starts a trail with no extra prompt.
- [ ] App and environment are inferred correctly, and can still be overridden.
- [ ] On an unlisted site, **Add this site** shows Chrome's prompt and then enables **Start Trail**.
- [ ] A site added that way appears under **Trusted sites** and can be removed.
- [ ] Denying the permission prompt shows a visible, readable error in the panel.
- [ ] A recording captures a click, an input, a route change, a successful API call, a failed API call, and a console error.
- [ ] A failed API step stays visible after many low-value interactions.
- [ ] The copied report redacts email, phone, token, password, session, cookie, and card-like values.
- [ ] **Copy report** and **Save .md** both work.
- [ ] Recording cannot start on `chrome://extensions`.
- [ ] Both light and dark theme render correctly.

---

## Phase 3 — Create the listing

Open the dashboard and use `docs/store/listing.md` for every text field.

- [ ] Upload `.output/bughunter-extension-1.0.0-chrome.zip`.
- [ ] **Store listing** tab: name, summary, detailed description, category `Developer Tools`, language.
- [ ] Upload 3 screenshots (1280x800) and both promo tiles.
- [ ] **Privacy** tab: single purpose description.
- [ ] **Privacy** tab: a justification for every permission — `storage`, `sidePanel`,
      `scripting`, `activeTab`, `tabs`, `webRequest`, host permissions, and the optional
      all-URLs host permissions. **A missing justification is the single most common
      cause of rejection.**
- [ ] **Privacy** tab: declare "no remote code".
- [ ] **Privacy** tab: data usage — all "No" (see the table in the listing doc).
- [ ] **Privacy** tab: tick all three certification checkboxes.
- [ ] **Privacy** tab: paste the hosted privacy policy URL.
- [ ] **Distribution** tab: set visibility, regions, free.
- [ ] Save the draft and re-read every field once before submitting.

---

## Phase 4 — Submit

- [ ] Click **Submit for review**.
- [ ] Record the submission date and the item ID somewhere the team can find them.

**Expected timelines.** Private and unlisted items usually clear in a few days. Anything
declaring all-URLs host permissions can take one to three weeks and is more likely to
get a reviewer question. Do not plan a launch announcement around an unconfirmed date.

---

## If review pushes back

The most likely objection is the optional `http://*/*` and `https://*/*` host
permissions. Reviewers treat all-URLs access as high risk even when it is optional.

**First response:** restate what is actually true — they are declared `optional`, they
are not static content-script matches, they grant nothing at install time, and a content
script is registered for an origin only after the user clicks **Add this site** and
approves Chrome's own prompt. Point at the privacy policy and offer
`docs/permissions-and-privacy.md`.

**If they still refuse:** drop the optional wildcards and ship explicit host permissions
per environment, cutting a new release whenever QA needs another app. Slower for QA,
but uncontroversial. This is a one-line change in `utils/allowed-origins.ts`
(`OPTIONAL_HOST_MATCHES`), plus the matching expectations in
`scripts/validate-extension-package.mjs` and `tests/allowed-origins.test.ts`.

Second most likely objection is `webRequest`. Answer: observation only, scoped to the
recording tab, no blocking use, torn down when the trail stops.

---

## Phase 5 — After it goes live

- [ ] Save the public item URL and the extension ID.
- [ ] Install from the Web Store on a clean profile and re-run the Phase 2 smoke items.
      A store-installed build gets a different extension ID than an unpacked one — confirm
      nothing depended on the unpacked ID.
- [ ] Send the install link to QA with `docs/qa-install-guide.md`.
- [ ] Have testers remove the old unpacked install so they are not running two copies.
- [ ] Tag the release commit in git.
- [ ] File the submission date, item ID, and reviewer correspondence with the release notes.

---

## Updating later

1. Bump the version in **both** `package.json` and `wxt.config.ts`.
2. Add a matching release notes file under `docs/`, named for the new version — `npm run validate:docs` enforces that it exists.
3. Run `npm run verify:release`.
4. Upload the new zip to the same item and submit.

Permission changes trigger a fresh, slower review, and adding a permission can force
users to re-accept. Batch permission changes rather than drip-feeding them.
