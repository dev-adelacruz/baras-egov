# Shared: Browser Driver

QA-specific. Browser-driven evidence is produced by the canonical driver script at **`.claude/skills/qa-agent/scripts/playwright-driver.cjs`**. Every mode that drives the browser MUST call this script (with a config JSON) rather than writing ad-hoc Playwright scripts. There is no other browser API available to this skill — if a mode file seems to describe one (`goto()`, `login_as()`, `assert_text()`), that mode file is wrong; use the driver.

The script enforces hard assertions (HTTP status, console errors, page errors, bad responses, missing map polygons, failed interaction steps) and filters known-benign third-party noise, so verdicts are produced from data — not eyeballed JSON.

## Pre-flight (Phase 0 for verify, bug, smoke)

- `npx playwright --version` should succeed. If not: warn `⚠️  Playwright not installed locally. Browser-driven evidence will be skipped — verdicts will rely on test output and DB queries only.`
- Chromium binary should be present at `~/Library/Caches/ms-playwright/chromium_headless_shell-*` (macOS) / `~/.cache/ms-playwright/...` (Linux). If missing, run `~/.npm/_npx/*/node_modules/.bin/playwright install chromium` (~150 MB, 1–2 min). The driver itself handles the Playwright module resolution (repo install → npx cache fallback).

## Calling the driver

Build a config JSON (write to `/tmp/qa-agent-driver-{TICKET}.json` for traceability), then invoke:

```bash
node .claude/skills/qa-agent/scripts/playwright-driver.cjs \
  --config /tmp/qa-agent-driver-{TICKET}.json
```

Exit code: `0` = all URLs PASS, `1` = at least one FAIL, `2` = driver setup failure (bad config, Playwright missing, **or login failure**). Output is a single JSON object on stdout with per-URL verdicts; capture and attach to the verdict report.

Map exit codes to verdicts: `0` → 🟢, `1` → 🔴, `2` → ⏸ BLOCKED (never PASS — a driver that could not start has verified nothing).

## Config schema

```json
{
  "baseUrl": "http://localhost:3000",
  "ticket": "DEV-XXXX",
  "evidenceDir": ".claude/skills/qa-agent/state/evidence/DEV-XXXX",
  "modalDismiss": "escape",
  "skipWarmup": false,
  "settleMs": 0,
  "cookies": [],
  "login": null,
  "loginPath": "/login",
  "reducedMotion": "reduce",
  "colorScheme": "dark",
  "hasTouch": false,
  "locale": "en-PH",
  "ignoreRequestFailures": [],
  "ignoreBadResponses": [],
  "ignoreConsoleErrors": [],
  "urls": [
    { "name": "index-page", "path": "/services/permits", "expectMap": true },
    { "name": "lookup", "path": "/regions/lookup.json?slug=barangay-1", "expectJson": true, "requireKeyPath": "region.geojson.type" },
    { "name": "review", "path": "/requests/abc123/edit", "expectText": "Edit your request" }
  ]
}
```

Top-level fields:
- `baseUrl` — environment base URL (from `ENV_BASE_URL`)
- `skipWarmup` — set `true` for staging/production to skip the discarded first run (no Rails autoload warmup needed)
- `settleMs` — global post-load pause for client-rendered pages (per-URL `settleMs` overrides)
- `cookies` — array of Playwright cookie objects (`{name, value, domain, path}`) injected before navigation; use for staging auth
- `login` — form-login block, run once before any URL is scored (see **Login** below)
- `loginPath` — **set this whenever any URL is auth-gated.** Any scored URL whose final path lands here FAILS instead of passing (see **The redirect guard**). Defaults to `login.path` when a login block is present.
- `reducedMotion` / `colorScheme` / `hasTouch` / `locale` — Playwright context options, passed straight through. `reducedMotion: "reduce"` is what makes a `prefers-reduced-motion` acceptance criterion verifiable in-gate; `hasTouch: true` (which also sets `isMobile`) is what lets a tap-only interaction be exercised at all.
- `ignoreConsoleErrors` — regex strings matched against the console **message text**, not a URL. No defaults. Needed whenever a run deliberately provokes an error path: Chrome logs every non-2xx fetch as a console error, so without this **no rejection path can be verified through the browser** — the driver fails the URL for the very behaviour under test. Keep the pattern narrow (`"status of 422"`, not `"status"`).

### The redirect guard

A URL that redirects to the sign-in page returns **200, with no console errors and no failed requests**. Every other assertion passes, and the URL scores PASS having verified a login form.

The driver exits 2 when a login *fails*. This guard covers the worse case — a login that **succeeded and then did not persist**, which produces the identical empty result with no signal at all. That was the normal outcome for any app storing its token in `sessionStorage`, which is per-page.

Set `loginPath` and a scored URL landing there fails with `auth: redirected to "…"`. A URL whose own `path` starts with `loginPath` is exempt, so you can still test the sign-in page itself.

Per-URL fields:
- `name` — short label used in the screenshot filename and result row (defaults to `path`)
- `path` — appended to `baseUrl`
- `expectMap` (bool) — wait for `window.google.maps.Map`, then assert `.gm-style canvas / svg path` count > 0. Set this on every URL that should render a Google Maps polygon.
- `expectJson` (bool) — parse response body as JSON
- `requireKeyPath` (string) — dotted key path, e.g. `region.geojson.type` — fails if missing or null
- `expectText` (string) — polls (default 10s, `textTimeoutMs` to override) for the literal string in the page body
- `expectNoText` (string) — asserts the string is NOT present; pair with `settleMs` and an `expectText` on a stable sibling so it does not pass merely because the page is blank
- `settleMs` (int) — post-load pause for this URL
- `steps` (array) — interactive actions (see **Interactive steps** below)

## Login

Auth-gated routes were previously unverifiable — every logged-in surface returned ⏸ BLOCKED. The driver now performs a real form login once, before the URL loop, on the shared browser context, so every subsequent URL is authenticated.

```json
"login": {
  "path": "/users/sign_in",
  "fields": { "#user_email": "qa-test@example.com", "#user_password": "secret" },
  "submit": "button[type=submit]",
  "expectText": "Dashboard",
  "expectUrlNot": "sign_in",
  "timeoutMs": 15000
}
```

- `fields` is a selector → value map, filled in order.
- `steps` is any sequence of the step actions below, run after `fields`. Use it for a sign-in that `fields` + `submit` cannot express.
- `expectUrlNot` fails the login if the URL still contains that substring after submit — the usual signature of rejected credentials.
- `expectText` fails the login if the string never appears post-submit.

**A failed login exits 2, not 1.** This is deliberate: if the driver continued unauthenticated, every auth-gated URL would be scored against a redirect to the sign-in page, which returns 200 with no console errors and would read as a clean PASS. Exit 2 forces ⏸ BLOCKED instead. When a whole verify run comes back BLOCKED with `login failed:` in the driver output, the QA account's password has usually expired — that is a config problem, not a product failure, and the report must say so.

### When the token lives in `sessionStorage`

`sessionStorage` is **per-page**, not per-context. A login performed on its own page dies with that page, and every scored URL then runs unauthenticated — scoring a redirect to the sign-in form as a clean PASS. `storageState` does not help either; it covers cookies and `localStorage` only.

The fix is to make the app put the token somewhere shared. Most sign-in forms already have the control: **tick "Remember me"**, which routes the token to `localStorage`. Express it with `steps`:

```json
"login": {
  "path": "/login",
  "steps": [
    { "action": "fill",  "selector": "#email",    "value": "admin@barangay.gov.local" },
    { "action": "fill",  "selector": "#password", "value": "password123" },
    { "action": "check", "selector": "input[type=checkbox]" },
    { "action": "click", "selector": "button[type=submit]" }
  ],
  "expectText": "Dashboard",
  "expectUrlNot": "login"
}
```

**Always pair this with `loginPath`.** The Remember-me pattern is a workaround, and a workaround that silently stops working is worse than no workaround — the redirect guard is what turns that back into a visible failure.

Prefer `browser_login` in config so it is set once per project. Use a dedicated QA account. For staging, `cookies` remains available as an alternative when the login flow is a magic link rather than a form.

## Interactive steps

A navigation-only driver can only catch bugs visible on page load. It cannot catch anything that fires on submit — and that is where a large share of real regressions live. `steps` closes that gap.

```json
{
  "name": "request-edit-save",
  "path": "/admin/requests",
  "settleMs": 500,
  "steps": [
    { "action": "click",        "selector": "button:has-text('Edit')" },
    { "action": "fill",         "selector": "#request_title", "value": "QA" },
    { "action": "select",       "selector": "#request_status", "value": "active" },
    { "action": "check",        "selector": "#request_urgent" },
    { "action": "click",        "selector": "button:has-text('Save')" },
    { "action": "waitForText",  "text": "Saved", "timeoutMs": 8000 },
    { "action": "expectNoText", "text": "Something went wrong" },
    { "action": "screenshot",   "name": "after-save" }
  ]
}
```

| Action | Fields | Effect |
|---|---|---|
| `fill` | `selector`, `value` | Type into an input (clears first) |
| `click` | `selector` | Click an element |
| `select` | `selector`, `value` | Choose an `<option>` by value |
| `check` / `uncheck` | `selector` | Tick / untick a checkbox or radio |
| `press` | `key`, `selector?` | Keyboard press on the selector, or the focused element |
| `waitFor` | `selector`, `state?` | Wait for a selector (`visible` / `hidden` / `attached`) |
| `waitForText` | `text` | Wait until body text contains a string |
| `waitMs` | `ms` | Fixed pause — use sparingly, prefer `waitFor` |
| `expectText` / `expectNoText` | `text` | Assert body text contains / does not contain, now |
| `expectUrl` | `contains` | Assert the current URL contains a substring |
| `screenshot` | `name` | Capture an extra evidence screenshot |

Every step takes an optional `timeoutMs` (default 10000). Selectors accept any Playwright syntax, including `button:has-text('Save')` and `text=`. Prefer role/text selectors over brittle CSS.

**Text assertions match the *rendered* string, not the source.** `waitForText`, `expectText` and `expectNoText` all read `document.body.innerText`, which is CSS-transformed — a heading styled `uppercase` reports `OFFICE` for markup that reads `Office`, and `expectText: "Office"` fails against a column that is plainly on screen. The obvious next conclusion, that the element is missing, is wrong.

The driver now says so in the failure rather than leaving you to work it out:

```
step[0] expectText: expected text "Office" not present — but it IS present as
"office", "OFFICE". innerText is CSS-transformed; assert the rendered casing.
```

It reports every distinct rendering it found, because the first case-insensitive hit is often the wrong one (`Office` matches inside `All offices` before it reaches the `OFFICE` header). It also detects the whitespace case — text split across elements, or wrapped.

The same applies to `expectNoText`, in the more dangerous direction: asserting a *title-case* string is absent can pass simply because the page renders it uppercase.

**Steps run on the scored pass only.** The warmup pass loads the page but executes no steps, so a mutation never fires twice — no duplicate records, no duplicate emails. The trade-off is that interactive assertions get one attempt rather than two, so a genuinely flaky interaction reads as a FAIL. That is the correct bias for a QA gate.

**A failing step stops that URL's remaining steps**, records `step[i] <action> (selector): <reason>` in `failures`, and captures a `-step-failure` screenshot. Universal assertions still run afterwards, so the report shows both the step failure *and* the bad HTTP response that caused it. `stepsRun` in the result reads `"4/5"` — how far the flow got before breaking.

### Why this matters (worked example)

A Vue `fetch` used `method: "patch"` in lowercase. The Fetch spec only normalizes `GET/HEAD/POST/PUT/DELETE/OPTIONS` to uppercase — not `PATCH` — so Rails' router rejected it with a 400. Create and delete worked; only edit-save silently broke. Request specs stayed green because they route through Rack internally, where case is not an issue.

Navigation-only verification returned PASS: the page loaded fine, and the PATCH was never fired. With a `steps` block that clicks Save, the driver's existing assertions catch it four separate ways — `waitForText: "Saved"` times out, a console error appears, a response ≥400 is recorded, and a `requestfailed` fires. Nothing new had to be asserted; the request just had to actually happen.

**Rule: if a PR changes a create/update/delete path, the driver config must include a `steps` block that exercises it.** A verify run that touches mutation code with no interactive step is capped at 🟡 PARTIAL, with "mutation path not exercised" recorded in Blocking Findings. Same discipline as the map guardrail below.

## Visual probes (`visual`)

Implemented in `scripts/visual-probe.cjs`, run after a URL's steps on the scored pass only, so a component that exists only once a dialog is open is probed in the state a person sees it in.

```json
"visual": {
  "scope": "[role=dialog]",   // optional — limit to a subtree
  "corners": true,            // default true
  "invariant": true,          // default true
  "contrastSheet": false,     // default false — writes evidence, never gates
  "tolerance": 24,            // corner probe colour distance
  "maxTargets": 12,           // largest N radius-bearing elements
  "minSize": 60               // ignore anything smaller
}
```

**`corners`** samples two rendered pixels per declared arc: one at `0.25r` in from both edges (geometrically *outside* the arc, so a rounded corner shows the backdrop) and one at `1.2r` along the diagonal (always inside, so it shows the fill). Rounded → the two differ. Square → they match, because the same opaque thing paints both. A corner that declares a radius and renders square **fails the URL**.

Judging each corner against itself matters. An earlier cut compared the four corners to each other and required agreement — which fails a *correct* build, because the scrim behind a modal sits over a page that is not a flat colour (the four corners legitimately read 113, 127 and 147). Local comparison removes the assumption: gradients, shadows and busy backdrops all move both samples together.

**Sample rendered pixels, never `document.elementFromPoint`.** It hit-tests rectangular border boxes, so it reports an element at a corner that element does not visually occupy — it produced a confident false positive on the first cut of this probe.

**`invariant`** is a lint rule with no pixels involved: an element with a radius and `overflow: visible` cannot clip its children, so an opaque, square-cornered descendant reaching that corner will paint over the arc. It names the ancestor/descendant pair and the fix. Its colour test is deliberately colour-space agnostic — matching only `rgb()` silently ignores every Tailwind v4 background, which are `oklch()`, and a colour-parsing miss that reads as "no finding" is worse than no probe.

**`contrastSheet`** writes the four corners side by side at 6× nearest-neighbour into the evidence dir. Evidence only, never a gate. Review it *before* opening the AC list — a checklist in hand frames what you see, and shown one image the default read is "nothing is wrong here".

## Built-in assertions (hard fail per URL)

The driver's `verdict` is `FAIL` for any URL where:
- HTTP status is not 2xx/3xx
- Any `console.error` was emitted during page load or interaction
- Any uncaught `pageerror` fired (an SPA mount failure that never logs to console)
- Any HTTP response had status ≥ 400 (excluding `ignoreBadResponses` regex matches)
- Any Playwright `requestfailed` fired (excluding `ignoreRequestFailures` regex matches)
- Any interactive step failed
- `expectMap: true` and `window.google.maps.Map` never resolved within 12s
- `expectMap: true` and `.gm-style canvas / svg path` count is 0
- `expectJson: true` and the body did not parse as JSON
- `requireKeyPath` set and the dotted path is missing or null
- `expectText` never appeared / `expectNoText` was present

## Default ignore lists

The driver ships with an allowlist for third-party noise that fires on every page load and is never a product regression: `maps.gstatic.com/mapfiles/transparent.png` (Google Maps telemetry ping), Google Analytics `/collect`, DoubleClick, Facebook Pixel `/tr`. Caller can extend via `ignoreRequestFailures` / `ignoreBadResponses` (regex strings, merged with defaults).

Keep additions narrow. Every pattern added here is a class of failure the gate can no longer see — an ignore entry broad enough to swallow first-party 500s turns the driver back into a page loader.

## Two-pass run policy

Every URL is fetched **twice**: a warmup pass that absorbs Rails autoload, then a scored pass whose result is reported. Screenshots are captured only on the scored pass; steps execute only on the scored pass. Set `skipWarmup: true` for staging/production.

## Modal dismissal

`modalDismiss: "escape"` (default) presses `Escape` once per page after navigation. This dismisses signup dialogs (Headless UI `Dialog` closes on ESC unless `disableClose` is set). Set `"none"` to skip.

## Map-bearing URL guardrail

If a verdict run touches code that should affect map rendering (PR diff includes `**/*geojson*`, `**/regions/**`, `**/*map*`, OR any of the URLs in the run match `/map/*` or `/map-data/*`), the driver MUST be called with `expectMap: true` on those URLs. Omitting `expectMap` on a map-bearing URL silently downgrades the verdict to 🟡 PARTIAL and the report must explicitly note "browser map check skipped". This stops modes from quietly missing the visual surface by forgetting to assert on it.

## Evidence Directory

All Playwright artifacts go under `.claude/skills/qa-agent/state/evidence/{TICKET_KEY}/`:
- Screenshots: `{timestamp}-{name}.png`
- Step screenshots: `{timestamp}-{step-name}.png`, `{timestamp}-{url-name}-step-failure.png`
- Console/network dumps: `{timestamp}-console.json`, `{timestamp}-network.json`

Evidence is gitignored by `.claude/skills/qa-agent/.gitignore` (which ignores `state/`).

**Pruning is a required step, not an aspiration.** At the end of any mode that wrote evidence, run:
```bash
find .claude/skills/qa-agent/state/evidence -type f -mtime +30 -delete 2>/dev/null
find .claude/skills/qa-agent/state/evidence -type d -empty -delete 2>/dev/null
```
Report the reclaimed count in one line if anything was removed. Skipping this is how the directory reaches tens of megabytes of screenshots for tickets closed months ago.
