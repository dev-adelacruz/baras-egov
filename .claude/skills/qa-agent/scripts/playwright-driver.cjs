#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * qa-agent / playwright-driver
 *
 * Reusable browser-driven verifier for verify / bug / smoke / sweep modes.
 * Replaces the ad-hoc per-run scripts that earlier verify runs wrote into
 * /tmp/. Hard-asserts on the failure modes that ad-hoc scripts kept missing:
 *
 *   - HTTP status not in 2xx/3xx
 *   - any console.error during page load
 *   - any HTTP response with status >= 400 (catches 5xx that
 *     `requestfailed` does not — `requestfailed` only fires on
 *     network-level failures, not bad HTTP responses)
 *   - any Playwright `requestfailed` (DNS / TLS / abort)
 *   - on `expectMap: true` URLs: zero `.gm-style canvas` after waiting
 *     for `window.google.maps.Map` to be defined
 *
 * Supports form login (config.login) and interactive steps (urlSpec.steps —
 * fill / click / select / check / press / waitFor / expect / screenshot) so
 * mutation paths are actually exercised. The assertion layer above then
 * catches the resulting 4xx/5xx and console errors for free: a navigation-only
 * run can never fail on a bug that only fires on submit.
 *
 * Each URL is fetched twice — the first run absorbs Rails autoload and is
 * discarded; the second run is the one we score. This catches flakes and
 * keeps timing meaningful. Steps are executed ONLY on the scored run, so a
 * mutation never fires twice.
 *
 * Usage:
 *
 *   NODE_PATH=$(ruby -e "puts Dir.glob(File.expand_path('~/.npm/_npx/*\/node_modules')).max_by{|p|File.mtime(p)}") \
 *     node .claude/skills/qa-agent/scripts/playwright-driver.cjs \
 *     --config /tmp/qa-agent-driver-config.json
 *
 * Or, if you have playwright in the repo's node_modules, just:
 *
 *   node .claude/skills/qa-agent/scripts/playwright-driver.cjs --config <path>
 *
 * Config schema (JSON):
 *
 *   {
 *     "baseUrl": "http://localhost:3000",
 *     "ticket": "BRGY-01",
 *     "evidenceDir": ".claude/skills/qa-agent/state/evidence/BRGY-01",
 *     "viewport": { "width": 1280, "height": 900 },          // optional
 *     "modalDismiss": "escape",                                // "escape" | "none"
 *     "skipWarmup": false,                                     // true skips the first discarded run — set to true for staging/prod
 *     "cookies": [                                             // optional — inject auth cookies before navigation (for staging)
 *       { "name": "_session_id", "value": "...", "domain": "staging.example.com", "path": "/" }
 *     ],
 *     "login": {                                               // optional — form login, run ONCE before the URL loop
 *       "path": "/users/sign_in",
 *       "fields": { "#user_email": "qa@example.com", "#user_password": "secret" },
 *       "submit": "button[type=submit]",
 *       "expectText": "Dashboard",                             // optional post-login assertion
 *       "expectUrlNot": "sign_in",                             // optional — fail if still on the login page
 *       "timeoutMs": 15000
 *     },
 *     "ignoreRequestFailures": [                               // optional regex strings; merged with built-in defaults
 *       "facebook\\.net",
 *       "doubleclick\\.net"
 *     ],
 *     "ignoreBadResponses": [                                  // optional regex strings; merged with built-in defaults
 *       "googletagmanager"
 *     ],
 *     "ignoreConsoleErrors": [                                 // optional regex strings; matched against MESSAGE TEXT, no defaults
 *       "401 \\(Unauthorized\\)"                               // use when the run deliberately provokes an error path
 *     ],
 *     "urls": [
 *       { "name": "index-page",  "path": "/services/permits",            "expectMap": true },
 *       { "name": "detail-page",   "path": "/services/permits/barangay-clearance",  "expectMap": true },
 *       { "name": "coverage-page", "path": "/map/coverage",       "expectMap": false },
 *       { "name": "request-edit", "path": "/requests/abc123/edit",     "expectText": "Edit your request" },
 *       {
 *         "name": "request-edit-save",
 *         "path": "/admin/requests",
 *         "settleMs": 500,
 *         "steps": [                                           // interactive — runs on the scored pass only
 *           { "action": "click",       "selector": "button:has-text('Edit')" },
 *           { "action": "fill",        "selector": "#request_title", "value": "QA" },
 *           { "action": "select",      "selector": "#request_status",     "value": "active" },
 *           { "action": "check",       "selector": "#request_urgent" },
 *           { "action": "click",       "selector": "button:has-text('Save')" },
 *           { "action": "waitForText", "text": "Saved", "timeoutMs": 8000 },
 *           { "action": "expectNoText","text": "Something went wrong" },
 *           { "action": "screenshot",  "name": "after-save" }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Supported step actions:
 *   fill        { selector, value }              type into an input (clears first)
 *   click       { selector }                     click an element
 *   select      { selector, value }              choose an <option> by value
 *   check       { selector }                     tick a checkbox / radio
 *   uncheck     { selector }                     untick a checkbox
 *   press       { key, selector? }               keyboard press (focused element or selector)
 *   waitFor     { selector, state? }             wait for selector (state: visible|hidden|attached)
 *   waitForText { text }                         wait until body text contains a string
 *   waitMs      { ms }                           fixed pause (use sparingly)
 *   expectText  { text }                         assert body text contains a string NOW
 *   expectNoText{ text }                         assert body text does NOT contain a string NOW
 *   expectUrl   { contains }                     assert current URL contains a substring
 *   screenshot  { name }                         capture an extra evidence screenshot
 *
 * Every step accepts an optional `timeoutMs` (default 10000). A failing step
 * records `step[i] <action>: ...` in that URL's failures, stops the remaining
 * steps for that URL, and captures a `-step-failure` screenshot. Universal
 * assertions (console errors, >=400 responses) still run afterwards, so a
 * failed interaction reports BOTH the step failure and the bad HTTP response
 * it triggered.
 *
 * Output: prints a single JSON object to stdout:
 *
 *   {
 *     "verdict": "PASS" | "FAIL",
 *     "ticket": "...",
 *     "loggedIn": true | false | null,
 *     "results": [ { name, url, verdict, status, timeMs, consoleErrors,
 *                    badResponses, requestFailures, mapPolygonCount,
 *                    mapReady, stepsRun, screenshot, screenshots,
 *                    failures: [reasons] }, ... ],
 *     "summary": "N PASS, M FAIL"
 *   }
 *
 * Exit codes:
 *   0 — every URL PASSed
 *   1 — at least one URL FAILed
 *   2 — driver setup failed (config invalid, Playwright missing, login failed)
 *
 * Note on exit 2 for login failure: this is deliberate. A driver that silently
 * continued unauthenticated would score auth-gated URLs against a redirect to
 * the sign-in page. Callers treat exit 2 as ⏸ BLOCKED, not PASS.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const os = require('os');

// ---------- Playwright resolution ----------
//
// Order:
//   1. require('playwright')                                — repo install or NODE_PATH set by caller
//   2. ./node_modules/playwright                            — explicit repo path
//   3. ~/.npm/_npx/<hash>/node_modules/playwright           — most recent npx cache
function loadPlaywright() {
  try { return require('playwright'); } catch (_) {}

  const repoLocal = path.join(process.cwd(), 'node_modules', 'playwright');
  if (fs.existsSync(repoLocal)) {
    try { return require(repoLocal); } catch (_) {}
  }

  const npxRoot = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npxRoot)) {
    const candidates = fs.readdirSync(npxRoot)
      .map(d => path.join(npxRoot, d, 'node_modules', 'playwright'))
      .filter(p => fs.existsSync(p))
      .map(p => ({ p, mtime: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (candidates.length > 0) {
      // Add to module search path so playwright's own internal requires resolve too.
      const nm = path.join(candidates[0].p, '..');
      Module.globalPaths.unshift(nm);
      try { return require(candidates[0].p); } catch (_) {}
    }
  }

  return null;
}

// ---------- Args ----------
function parseArgs(argv) {
  const out = { config: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--config' && argv[i + 1]) { out.config = argv[++i]; }
  }
  return out;
}

function die(code, msg) {
  console.error(`[playwright-driver] ${msg}`);
  process.exit(code);
}

// Built-in ignorelist for third-party noise that consistently fires on
// every page load and never indicates a first-party regression. Caller
// can extend via config.ignoreRequestFailures / config.ignoreBadResponses.
//
// Each entry is a string compiled to a RegExp matched against the URL.
const DEFAULT_IGNORE_REQUEST_FAILURES = [
  // Google Maps deliberately ABORTs a 1x1 telemetry ping on every load.
  'maps\\.gstatic\\.com/mapfiles/transparent\\.png',
  // Analytics beacons commonly abort on navigation.
  'google-analytics\\.com/(g/)?collect',
  'analytics\\.google\\.com',
  'doubleclick\\.net',
  'facebook\\.com/tr',
  'connect\\.facebook\\.net',
];

const DEFAULT_IGNORE_BAD_RESPONSES = [
  // Same families — sometimes they 4xx instead of aborting.
  'google-analytics\\.com',
  'doubleclick\\.net',
  'facebook\\.com/tr',
];

// Deliberately empty. Console errors are the broadest signal the driver has,
// so nothing is ignored by default — a caller must opt in per run via
// config.ignoreConsoleErrors, and each pattern is matched against the message
// text rather than a URL.
//
// The case this exists for: verifying an error path (a rejected login, a
// validation failure) requires provoking a real 4xx, and the browser logs
// "Failed to load resource: … 401 (Unauthorized)" as a console error. Without
// this, ignoreBadResponses silences the network entry but the console entry
// still fails the URL, so a correctly-behaving error path can never score PASS.
// Keep additions narrow — a pattern broad enough to swallow a first-party
// stack trace turns the console assertion off entirely.
const DEFAULT_IGNORE_CONSOLE_ERRORS = [];

function compilePatterns(list) {
  return (list || []).map(s => new RegExp(s));
}

function matchesAny(patterns, url) {
  return patterns.some(re => re.test(url));
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ---------- Steps ----------
//
// Executes one interactive step. Throws on failure with a message that names
// the action and selector, so the caller can attribute the failure precisely.
async function runStep(page, step, evidenceDir, shots) {
  const t = step.timeoutMs != null ? step.timeoutMs : 10000;
  const sel = step.selector;

  const need = (field) => {
    if (!step[field]) throw new Error(`missing required field "${field}"`);
    return step[field];
  };

  switch (step.action) {
    case 'fill':
      await page.locator(need('selector')).fill(String(step.value != null ? step.value : ''), { timeout: t });
      break;

    case 'click':
      await page.locator(need('selector')).click({ timeout: t });
      break;

    case 'select':
      await page.locator(need('selector')).selectOption(String(need('value')), { timeout: t });
      break;

    case 'check':
      await page.locator(need('selector')).check({ timeout: t });
      break;

    case 'uncheck':
      await page.locator(need('selector')).uncheck({ timeout: t });
      break;

    case 'press':
      if (sel) await page.locator(sel).press(String(need('key')), { timeout: t });
      else await page.keyboard.press(String(need('key')));
      break;

    case 'waitFor':
      await page.locator(need('selector')).waitFor({ state: step.state || 'visible', timeout: t });
      break;

    case 'waitForText':
      await page.waitForFunction(
        (txt) => document.body && document.body.innerText.includes(txt),
        String(need('text')),
        { timeout: t },
      );
      break;

    case 'waitMs':
      await page.waitForTimeout(Number(step.ms) || 0);
      break;

    case 'expectText': {
      const body = await page.evaluate(() => (document.body ? document.body.innerText : ''));
      if (!body.includes(String(need('text')))) {
        throw new Error(`expected text "${String(step.text).slice(0, 80)}" not present`);
      }
      break;
    }

    case 'expectNoText': {
      const body = await page.evaluate(() => (document.body ? document.body.innerText : ''));
      if (body.includes(String(need('text')))) {
        throw new Error(`unexpected text "${String(step.text).slice(0, 80)}" is present`);
      }
      break;
    }

    case 'expectUrl': {
      const current = page.url();
      if (!current.includes(String(need('contains')))) {
        throw new Error(`url "${current.slice(0, 120)}" does not contain "${step.contains}"`);
      }
      break;
    }

    case 'screenshot': {
      fs.mkdirSync(evidenceDir, { recursive: true });
      const p = path.join(evidenceDir, `${stamp()}-${step.name || 'step'}.png`);
      await page.screenshot({ path: p, fullPage: true });
      shots.push(p);
      break;
    }

    default:
      throw new Error(`unknown action "${step.action}"`);
  }
}

// Runs every step in order. Returns { ran, failure } — failure is null on
// success. Stops at the first failing step (later steps almost always depend
// on earlier ones, so cascading errors would be noise).
async function runSteps(page, steps, evidenceDir, shots) {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      await runStep(page, step, evidenceDir, shots);
    } catch (e) {
      const where = step.selector ? ` (${step.selector})` : '';
      return {
        ran: i,
        failure: `step[${i}] ${step.action}${where}: ${String(e.message).slice(0, 180)}`,
      };
    }
  }
  return { ran: steps.length, failure: null };
}

// ---------- Login ----------
//
// Form login, performed once against a dedicated page before the URL loop.
// The resulting session cookie lives on the shared browser context, so every
// subsequent URL is authenticated. Throws on failure — main() converts that
// into exit 2 (BLOCKED) rather than scoring auth-gated pages unauthenticated.
async function doLogin(ctx, cfg) {
  const login = cfg.login;
  const t = login.timeoutMs != null ? login.timeoutMs : 15000;
  const url = new URL(login.path || '/', cfg.baseUrl).toString();
  const page = await ctx.newPage();

  try {
    const nav = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: t });
    const status = nav?.status();
    if (status == null || status < 200 || status >= 400) {
      throw new Error(`login page returned status ${status}`);
    }

    if (cfg.modalDismiss !== 'none') {
      try { await page.keyboard.press('Escape'); } catch (_) {}
      await page.waitForTimeout(200);
    }

    for (const [selector, value] of Object.entries(login.fields || {})) {
      await page.locator(selector).fill(String(value), { timeout: t });
    }

    if (login.submit) {
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: t }).catch(() => {}),
        page.locator(login.submit).click({ timeout: t }),
      ]);
      // Give the post-submit navigation / XHR redirect a moment to land.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }

    if (login.expectUrlNot && page.url().includes(login.expectUrlNot)) {
      throw new Error(`still on "${login.expectUrlNot}" after submit — credentials rejected?`);
    }

    if (login.expectText) {
      await page.waitForFunction(
        (txt) => document.body && document.body.innerText.includes(txt),
        String(login.expectText),
        { timeout: t },
      ).catch(() => {
        throw new Error(`post-login text "${login.expectText}" never appeared`);
      });
    }
  } finally {
    await page.close().catch(() => {});
  }
}

// ---------- Single-URL run ----------
async function runOne(ctx, urlSpec, cfg, runIndex) {
  const url = new URL(urlSpec.path, cfg.baseUrl).toString();
  const page = await ctx.newPage();

  const consoleErrors = [];
  // Suppressed by config.ignoreConsoleErrors. Reported separately so a run
  // that hides something always says what it hid.
  const ignoredConsoleErrors = [];
  const badResponses = [];
  const requestFailures = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Matched against the message text, not a URL — see
    // DEFAULT_IGNORE_CONSOLE_ERRORS for why this is opt-in only.
    if (matchesAny(cfg._ignoreConsoleErrors, text)) {
      ignoredConsoleErrors.push(text.slice(0, 300));
      return;
    }
    consoleErrors.push(text.slice(0, 300));
  });
  // Uncaught exceptions (e.g. a Vue/SPA mount failure) don't always surface as
  // console.error — capture them separately so a blank render is diagnosable.
  page.on('pageerror', err => {
    pageErrors.push((err && (err.stack || err.message) || String(err)).slice(0, 300));
  });
  page.on('response', resp => {
    if (resp.status() >= 400 && !matchesAny(cfg._ignoreBadResponses, resp.url())) {
      badResponses.push({ url: resp.url(), status: resp.status() });
    }
  });
  page.on('requestfailed', req => {
    if (!matchesAny(cfg._ignoreRequestFailures, req.url())) {
      requestFailures.push({ url: req.url(), failure: req.failure()?.errorText });
    }
  });

  const t0 = Date.now();
  let nav, finalStatus = null, mapReady = false, mapPolygonCount = 0;
  const failures = [];
  const extraShots = [];
  let stepsRun = 0;

  try {
    nav = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    finalStatus = nav?.status();

    if (cfg.modalDismiss !== 'none') {
      // Headless UI Dialog (signup modal) closes on Escape unless
      // disableClose is true (only after 3+ shows — never in fresh QA session).
      try { await page.keyboard.press('Escape'); } catch (_) {}
      await page.waitForTimeout(200);
    }

    // Client-rendered (Vue/SPA) pages mount content only after an async fetch.
    // Wait for the DOM to settle so single-shot assertions/screenshots don't
    // race an empty page. `settleMs` is a fixed post-load pause (per-URL or
    // global); default 0 preserves the original fast behavior for SSR pages.
    const settleMs = urlSpec.settleMs != null ? urlSpec.settleMs : (cfg.settleMs || 0);
    if (settleMs > 0) {
      try { await page.waitForLoadState('networkidle', { timeout: Math.max(settleMs, 5000) }); } catch (_) {}
      await page.waitForTimeout(settleMs);
    }

    // Interactive steps — scored run ONLY. Running them on the warmup pass
    // would fire every mutation twice (two records created, two emails sent).
    // This is why a stepped URL gets one interaction attempt, not two.
    if (Array.isArray(urlSpec.steps) && urlSpec.steps.length > 0 && runIndex === 1) {
      const { ran, failure } = await runSteps(page, urlSpec.steps, cfg.evidenceDir, extraShots);
      stepsRun = ran;
      if (failure) {
        failures.push(failure);
        // Capture the DOM at the point of failure — without this a step
        // failure is just a selector string with no context.
        try {
          fs.mkdirSync(cfg.evidenceDir, { recursive: true });
          const p = path.join(cfg.evidenceDir, `${stamp()}-${urlSpec.name || 'page'}-step-failure.png`);
          await page.screenshot({ path: p, fullPage: true });
          extraShots.push(p);
        } catch (_) {}
      }
      // Let any request fired by the last step land, so the response/console
      // listeners below see it. This is the window in which a bad HTTP verb,
      // a 422, or a 500 on submit actually shows up.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }

    if (urlSpec.expectMap) {
      try {
        await page.waitForFunction(() => !!(window.google && window.google.maps && window.google.maps.Map), null, { timeout: 12000 });
        mapReady = true;
      } catch (_) {
        failures.push('map: google.maps.Map never became defined within 12s');
      }
      // Wait for the Google Maps canvas to mount, then count.
      try {
        await page.waitForSelector('.gm-style', { timeout: 5000 });
      } catch (_) { /* counted below as 0 */ }
      mapPolygonCount = await page.locator('.gm-style canvas, .gm-style svg path').count();
      if (mapPolygonCount === 0) {
        failures.push('map: expectMap=true but .gm-style canvas/path count is 0');
      }
    }

    if (urlSpec.expectJson) {
      const body = await page.evaluate(() => document.body.innerText);
      try {
        const parsed = JSON.parse(body);
        if (urlSpec.requireKeyPath) {
          // dotted key path, e.g. "region.geojson.type"
          const ok = urlSpec.requireKeyPath.split('.').reduce((acc, k) => acc && acc[k], parsed);
          if (ok === undefined || ok === null) {
            failures.push(`json: requireKeyPath="${urlSpec.requireKeyPath}" missing or null`);
          }
        }
      } catch (e) {
        failures.push(`json: response body did not parse as JSON (${e.message.slice(0, 80)})`);
      }
    }

    if (urlSpec.expectText) {
      // Poll for the text so client-rendered content that mounts after an
      // async fetch is not missed by a single-shot check. Timeout is
      // configurable per-URL (textTimeoutMs), default 10s.
      const textTimeout = urlSpec.textTimeoutMs != null ? urlSpec.textTimeoutMs : 10000;
      let found = false;
      try {
        await page.waitForFunction(
          (t) => document.body && document.body.innerText.includes(t),
          urlSpec.expectText,
          { timeout: textTimeout },
        );
        found = true;
      } catch (_) { /* handled below */ }
      if (!found) {
        failures.push(`text: expected to find "${urlSpec.expectText.slice(0, 80)}" in page body`);
      }
    }

    if (urlSpec.expectNoText) {
      // Negative assertion — the string must NOT be present after the page has
      // settled. Pair with a settleMs (and typically an expectText on a stable
      // sibling element) so this does not pass merely because the page is blank.
      const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : ''));
      if (bodyText.includes(urlSpec.expectNoText)) {
        failures.push(`text: expected NOT to find "${urlSpec.expectNoText.slice(0, 80)}" in page body`);
      }
    }

    // Universal assertions
    if (finalStatus < 200 || finalStatus >= 400) {
      failures.push(`http: status ${finalStatus} (expected 2xx/3xx)`);
    }
    if (consoleErrors.length > 0) {
      failures.push(`console: ${consoleErrors.length} error(s) — first: ${consoleErrors[0].slice(0, 120)}`);
    }
    if (pageErrors.length > 0) {
      failures.push(`pageerror: ${pageErrors.length} uncaught — first: ${pageErrors[0].slice(0, 160)}`);
    }
    if (badResponses.length > 0) {
      const firstBad = badResponses[0];
      failures.push(`network: ${badResponses.length} response(s) >= 400 — first: ${firstBad.status} ${firstBad.url.slice(0, 120)}`);
    }
    if (requestFailures.length > 0) {
      const firstFail = requestFailures[0];
      failures.push(`network: ${requestFailures.length} requestfailed — first: ${firstFail.url.slice(0, 120)} (${firstFail.failure})`);
    }
  } catch (e) {
    failures.push(`navigation: ${e.message.slice(0, 200)}`);
  }

  const timeMs = Date.now() - t0;

  // Only screenshot on the scored run (runIndex === 1), not the warmup.
  let screenshot = null;
  if (runIndex === 1) {
    fs.mkdirSync(cfg.evidenceDir, { recursive: true });
    screenshot = path.join(cfg.evidenceDir, `${stamp()}-${urlSpec.name || 'page'}.png`);
    try { await page.screenshot({ path: screenshot, fullPage: true }); } catch (_) {}
  }

  await page.close();

  return {
    name: urlSpec.name || urlSpec.path,
    url,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    status: finalStatus,
    timeMs,
    consoleErrors: consoleErrors.length,
    // Non-zero means this run suppressed something. Always reported so a PASS
    // that depended on an ignore pattern is visible rather than implicit.
    ignoredConsoleErrors: ignoredConsoleErrors.length,
    ignoredConsoleErrorSamples: ignoredConsoleErrors.slice(0, 3),
    pageErrors: pageErrors.length,
    pageErrorSample: pageErrors[0] || null,
    badResponses: badResponses.length,
    requestFailures: requestFailures.length,
    mapReady: urlSpec.expectMap ? mapReady : null,
    mapPolygonCount: urlSpec.expectMap ? mapPolygonCount : null,
    stepsRun: Array.isArray(urlSpec.steps) ? `${stepsRun}/${urlSpec.steps.length}` : null,
    screenshot,
    screenshots: extraShots,
    failures,
  };
}

// ---------- Main ----------
(async () => {
  const args = parseArgs(process.argv);
  if (!args.config) die(2, 'missing required --config <path-to-json>');
  if (!fs.existsSync(args.config)) die(2, `config not found: ${args.config}`);

  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(args.config, 'utf8')); }
  catch (e) { die(2, `config parse error: ${e.message}`); }

  if (!cfg.baseUrl || !Array.isArray(cfg.urls) || cfg.urls.length === 0) {
    die(2, 'config missing baseUrl or urls[]');
  }
  cfg.modalDismiss = cfg.modalDismiss || 'escape';
  cfg.viewport = cfg.viewport || { width: 1280, height: 900 };
  cfg.skipWarmup = cfg.skipWarmup || false;
  cfg.evidenceDir = cfg.evidenceDir || `.claude/skills/qa-agent/state/evidence/${cfg.ticket || 'unknown'}`;
  cfg._ignoreRequestFailures = compilePatterns(
    DEFAULT_IGNORE_REQUEST_FAILURES.concat(cfg.ignoreRequestFailures || [])
  );
  cfg._ignoreBadResponses = compilePatterns(
    DEFAULT_IGNORE_BAD_RESPONSES.concat(cfg.ignoreBadResponses || [])
  );
  cfg._ignoreConsoleErrors = compilePatterns(
    DEFAULT_IGNORE_CONSOLE_ERRORS.concat(cfg.ignoreConsoleErrors || [])
  );

  const playwright = loadPlaywright();
  if (!playwright) {
    die(2, 'could not resolve `playwright` — install in repo (`yarn add -D playwright && npx playwright install chromium`) or warm the npx cache (`npx playwright --version`)');
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: cfg.viewport });

  // Inject auth cookies when provided (e.g. staging session cookies).
  if (Array.isArray(cfg.cookies) && cfg.cookies.length > 0) {
    await ctx.addCookies(cfg.cookies);
  }

  // Form login, once, before anything is scored. A failure here exits 2
  // (BLOCKED) instead of letting auth-gated URLs be scored against a redirect
  // to the sign-in page — that would read as a PASS on an empty page.
  let loggedIn = null;
  if (cfg.login) {
    try {
      await doLogin(ctx, cfg);
      loggedIn = true;
    } catch (e) {
      await browser.close().catch(() => {});
      die(2, `login failed: ${String(e.message).slice(0, 300)}`);
    }
  }

  const results = [];
  for (const urlSpec of cfg.urls) {
    const hasSteps = Array.isArray(urlSpec.steps) && urlSpec.steps.length > 0;
    // Warmup run — discarded. Catches Rails autoload, primes browser cache.
    // Skipped for staging/production where autoload is not relevant. Steps are
    // suppressed on warmup (see runOne), so this stays side-effect free.
    if (!cfg.skipWarmup) {
      await runOne(ctx, urlSpec, cfg, 0);
    }
    // Scored run.
    const result = await runOne(ctx, urlSpec, cfg, 1);
    result.interactive = hasSteps;
    results.push(result);
  }

  await browser.close();

  const passes = results.filter(r => r.verdict === 'PASS').length;
  const fails = results.filter(r => r.verdict === 'FAIL').length;
  const verdict = fails === 0 ? 'PASS' : 'FAIL';

  console.log(JSON.stringify({
    verdict,
    ticket: cfg.ticket || null,
    loggedIn,
    summary: `${passes} PASS, ${fails} FAIL`,
    results,
  }, null, 2));

  process.exit(fails === 0 ? 0 : 1);
})().catch(e => {
  console.error(`[playwright-driver] uncaught: ${e.stack || e.message}`);
  process.exit(2);
});
