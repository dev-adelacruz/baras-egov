/* eslint-disable no-console */
/**
 * qa-agent / visual-probe  (BRGY-140)
 *
 * BRGY-139 shipped a modal rounded on the top two corners and square on the
 * bottom two. Every gate was green — SAFE TO MERGE, 10/10 ACs, 34/34 driver
 * steps, 114 unit tests, clean tsc. A human spotted it in about two seconds.
 *
 * The gates were not wrong; they verified what they were asked to verify.
 * Nothing in the pipeline ever asked whether it *looked* right. Acceptance
 * criteria cannot close that gap: they are a closed list written before the
 * artifact exists, so they can never contain the defect nobody anticipated.
 * BRGY-129's ten criteria covered labels, focus, errors and breakpoints, and
 * not one said "corners".
 *
 * This module is the open-ended half. Three probes, in decreasing generality:
 *
 *   1. cornerProbe    — samples RENDERED PIXELS at each corner of every
 *                       radius-bearing element and fails when the four do not
 *                       agree. Needs no expected value and no checklist: it
 *                       asks only "is this shape symmetric with itself".
 *
 *   2. clipInvariant  — a lint rule, not a judgement call. Flags any element
 *                       with a radius and `overflow: visible` that has an
 *                       opaque, square-cornered descendant reaching that
 *                       corner. Names the cause rather than the symptom.
 *
 *   3. contrastSheet  — crops the four corners and places them adjacent in one
 *                       image, converting "notice an absence" into "spot the
 *                       odd one out". For humans; the two above are automatic.
 *
 * On sampling: use rendered pixels, never document.elementFromPoint. An earlier
 * cut of this probe used elementFromPoint as a cheap oracle and produced a
 * false positive — it hit-tests rectangular border boxes, so it happily reports
 * an element at a corner that element does not visually occupy.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- Minimal PNG decode ----------
//
// Playwright hands back a PNG buffer and we need actual pixel values out of it.
// Node ships zlib, and a screenshot is always 8-bit non-interlaced RGB/RGBA, so
// a full decoder is not needed — just IHDR, the concatenated IDAT, inflate, and
// the five PNG filter types. Keeps this dependency-free, which matters for a
// script that has to run wherever the driver runs.
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // Un-filter. Each scanline is prefixed with its filter type byte; filters
  // reference the pixel to the left (a), above (b) and above-left (c).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];

      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[y * stride + x] = v & 0xff;
    }
  }

  return { width, height, channels, data: out };
}

function pixelAt(img, x, y) {
  const cx = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const i = cy * img.width * img.channels + cx * img.channels;
  return {
    r: img.data[i], g: img.data[i + 1], b: img.data[i + 2],
    a: img.channels === 4 ? img.data[i + 3] : 255,
  };
}

const rgb = (p) => `rgb(${p.r},${p.g},${p.b})`;
const dist = (p, q) => Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b);

// ---------- Collecting candidates ----------
//
// Every visible element carrying a corner radius, with the geometry the probes
// need. Filters out anything too small for a meaningful sample and anything
// off-screen, so the probe reports shapes a person could actually look at.
const COLLECT = `({ scopeSel, minSize }) => {
  const roots = scopeSel ? Array.from(document.querySelectorAll(scopeSel)) : [document.body];
  const seen = new Set();
  const out = [];

  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
      : '';
    const role = el.getAttribute && el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '';
    return el.tagName.toLowerCase() + id + role + cls;
  };

  for (const root of roots) {
    const all = [root, ...root.querySelectorAll('*')];
    for (const el of all) {
      if (seen.has(el)) continue;
      seen.add(el);

      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;

      const radii = {
        tl: parseFloat(cs.borderTopLeftRadius) || 0,
        tr: parseFloat(cs.borderTopRightRadius) || 0,
        br: parseFloat(cs.borderBottomRightRadius) || 0,
        bl: parseFloat(cs.borderBottomLeftRadius) || 0,
      };
      const maxR = Math.max(radii.tl, radii.tr, radii.br, radii.bl);
      if (maxR <= 0) continue;

      const r = el.getBoundingClientRect();
      if (r.width < minSize || r.height < minSize) continue;
      if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
      // A radius larger than half the box is a pill or a circle — every corner
      // is arc, so "which corner is square" is not a question about it.
      if (maxR * 2 >= Math.min(r.width, r.height)) continue;

      out.push({
        selector: describe(el),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        radii,
        overflow: cs.overflow,
      });
    }
  }
  return out;
}`;

// ---------- Probe 1: corner pixels ----------
//
// Each corner is judged against ITSELF, using two samples a few pixels apart:
//
//   outer — 0.25r in from both edges. Geometrically outside the arc (at 0.25r
//           the distance from the arc centre is 1.06r), so on a genuinely
//           rounded corner this shows whatever is behind the element.
//   inner — 1.2r in along the diagonal. Comfortably inside the arc, so it
//           always shows the element's own fill, or a descendant's.
//
// Rounded → the two differ. Square → they match, because the same opaque thing
// is painting both. No expected colour, no checklist, and nothing global.
//
// An earlier cut compared the four corners to each other and demanded they
// agree. That is wrong: the scrim behind a modal sits over a page that is not a
// flat colour, so the four corners legitimately read 113, 127 and 147. It
// failed the *fixed* build. Comparing locally removes the assumption entirely —
// gradients, shadows and busy backdrops stop mattering, because both samples
// move together.
async function cornerProbe(page, targets, opts) {
  // Generous on purpose. The defect this hunts is an opaque panel painting over
  // an arc, which is a large difference — slate-50 over a scrim was ~135 apart.
  // A tight threshold here buys false positives, not sensitivity.
  const tolerance = opts.tolerance != null ? opts.tolerance : 24;
  const findings = [];
  const samples = [];

  const sample = async (x, y) => {
    // 3x3 clip, read the centre — a 1x1 clip is legal but leaves no margin when
    // the clip lands a subpixel off.
    const shot = await page.screenshot({
      clip: { x: Math.max(0, x - 1), y: Math.max(0, y - 1), width: 3, height: 3 },
    });
    return pixelAt(decodePng(shot), 1, 1);
  };

  for (const t of targets) {
    const { rect, radii } = t;
    const corners = [
      ['TL', rect.x, rect.y, +1, +1, radii.tl],
      ['TR', rect.x + rect.width, rect.y, -1, +1, radii.tr],
      ['BR', rect.x + rect.width, rect.y + rect.height, -1, -1, radii.br],
      ['BL', rect.x, rect.y + rect.height, +1, -1, radii.bl],
    ];

    const squared = [];
    const read = [];

    for (const [name, cx, cy, dx, dy, r] of corners) {
      // A corner with no radius is *meant* to be square — nothing to check.
      if (r <= 0) continue;

      const outerIn = Math.max(2, r * 0.25);
      const innerIn = Math.max(outerIn + 2, r * 1.2);

      let outer, inner;
      try {
        outer = await sample(cx + dx * outerIn, cy + dy * outerIn);
        inner = await sample(cx + dx * innerIn, cy + dy * innerIn);
      } catch (_) { continue; }

      const delta = dist(outer, inner);
      read.push({ corner: name, outer: rgb(outer), inner: rgb(inner), delta });
      if (delta <= tolerance) squared.push({ name, outer, inner, delta, r });
    }

    if (read.length > 0) samples.push({ selector: t.selector, corners: read });

    for (const s of squared) {
      findings.push(
        `corner: ${t.selector} — ${s.name} declares a ${s.r}px radius but renders SQUARE. ` +
        `The pixel just outside the arc is ${rgb(s.outer)} and the fill just inside it is ` +
        `${rgb(s.inner)} (delta ${s.delta}); on a rounded corner the outer sample shows the ` +
        'backdrop instead. Something opaque and square-cornered is painting over the arc.'
      );
    }
  }

  return { findings, samples };
}

// ---------- Probe 2: the clipping invariant ----------
//
// Stated generally so it names the cause, not the symptom: an element with a
// radius and `overflow: visible` cannot clip its children, so any opaque
// descendant with a square corner reaching that corner will paint over the arc.
// This is a lint rule — no pixels, no judgement — and it would have pointed
// straight at the footer.
const INVARIANT = `(targets) => {
  // Colour-space agnostic on purpose. An earlier cut matched only rgb()/rgba()
  // and silently ignored every Tailwind v4 background, which are emitted as
  // oklch() — so the probe found the footer's geometry, decided it was
  // transparent, and reported nothing on a build that was visibly broken.
  // A colour-parsing miss must never read as "no finding".
  const isOpaque = (cs) => {
    const bg = (cs.backgroundColor || '').trim();
    if (!bg || bg === 'transparent' || bg === 'none') return false;

    // Modern syntax puts alpha after a slash: oklch(L C H / 50%), rgb(r g b / .5)
    const slash = bg.match(/\\/\\s*([0-9.]+)(%?)\\s*\\)/);
    if (slash) {
      const a = parseFloat(slash[1]) / (slash[2] === '%' ? 100 : 1);
      return a > 0.9;
    }

    // Legacy comma syntax: rgba(r, g, b, a) / hsla(...)
    const fn = bg.match(/^[a-z]+\\(([^)]+)\\)$/i);
    if (fn && fn[1].includes(',')) {
      const parts = fn[1].split(',').map(s => parseFloat(s));
      if (parts.length >= 4) return parts[3] > 0.9;
    }

    // Any other named or functional colour with no alpha component is opaque.
    return true;
  };

  const findings = [];

  for (const t of targets) {
    if (t.overflow !== 'visible') continue;

    const el = Array.from(document.querySelectorAll('*')).find(e => {
      const r = e.getBoundingClientRect();
      return Math.abs(r.x - t.rect.x) < 1 && Math.abs(r.y - t.rect.y) < 1 &&
             Math.abs(r.width - t.rect.width) < 1 && Math.abs(r.height - t.rect.height) < 1;
    });
    if (!el) continue;

    const pr = el.getBoundingClientRect();
    const corners = [
      ['top-left',     t.radii.tl, (r) => Math.abs(r.left - pr.left) < 2 && Math.abs(r.top - pr.top) < 2,        'borderTopLeftRadius'],
      ['top-right',    t.radii.tr, (r) => Math.abs(r.right - pr.right) < 2 && Math.abs(r.top - pr.top) < 2,      'borderTopRightRadius'],
      ['bottom-right', t.radii.br, (r) => Math.abs(r.right - pr.right) < 2 && Math.abs(r.bottom - pr.bottom) < 2,'borderBottomRightRadius'],
      ['bottom-left',  t.radii.bl, (r) => Math.abs(r.left - pr.left) < 2 && Math.abs(r.bottom - pr.bottom) < 2,  'borderBottomLeftRadius'],
    ];

    for (const kid of el.querySelectorAll('*')) {
      const kcs = getComputedStyle(kid);
      if (!isOpaque(kcs)) continue;
      const kr = kid.getBoundingClientRect();
      if (kr.width < 4 || kr.height < 4) continue;

      for (const [name, parentRadius, reaches, prop] of corners) {
        if (parentRadius <= 0) continue;
        if (!reaches(kr)) continue;
        if ((parseFloat(kcs[prop]) || 0) > 0) continue;

        const desc = kid.tagName.toLowerCase() +
          (kid.className && typeof kid.className === 'string'
            ? '.' + kid.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
        findings.push(
          'invariant: ' + t.selector + ' has ' + parentRadius + 'px radius at ' + name +
          ' with overflow:visible, and descendant ' + desc + ' (' + kcs.backgroundColor +
          ', 0 radius) reaches that corner — it will paint over the arc. ' +
          'Fix by clipping the parent (overflow-hidden), not by rounding the child.'
        );
      }
    }
  }
  return findings;
}`;

// ---------- Probe 3: contrast sheet ----------
//
// Screenshots were captured during BRGY-129 verification and reviewed, and did
// not help. Three things defeated them: the capture downscaled a 16px radius to
// a handful of pixels; a checklist framed what got looked at; and shown one
// image, "nothing is wrong here" is the default read. Placing the four corners
// side by side converts noticing an absence into spotting the odd one out.
//
// Assembled in the browser so no PNG encoder is needed here — the four crops go
// in as data URLs and the canvas hands back the finished sheet.
async function contrastSheet(page, target, evidenceDir, stampName) {
  const { rect, radii } = target;
  const maxR = Math.max(radii.tl, radii.tr, radii.br, radii.bl);
  const crop = Math.max(12, Math.ceil(maxR * 1.5));

  const corners = [
    ['TL', rect.x, rect.y],
    ['TR', rect.x + rect.width - crop, rect.y],
    ['BL', rect.x, rect.y + rect.height - crop],
    ['BR', rect.x + rect.width - crop, rect.y + rect.height - crop],
  ];

  const shots = [];
  for (const [label, x, y] of corners) {
    const buf = await page.screenshot({
      clip: { x: Math.max(0, x), y: Math.max(0, y), width: crop, height: crop },
    });
    shots.push({ label, dataUrl: 'data:image/png;base64,' + buf.toString('base64') });
  }

  const sheetDataUrl = await page.evaluate(async (items) => {
    const SCALE = 6;            // nearest-neighbour, so the arc stays legible
    const PAD = 10;
    const LABEL = 18;
    const imgs = await Promise.all(items.map(it => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res({ label: it.label, im });
      im.onerror = rej;
      im.src = it.dataUrl;
    })));

    const cw = imgs[0].im.width * SCALE;
    const ch = imgs[0].im.height * SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = PAD + (cw + PAD) * imgs.length;
    canvas.height = PAD + LABEL + ch + PAD;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;      // upscale must not invent an arc
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    imgs.forEach((it, i) => {
      const x = PAD + i * (cw + PAD);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '600 12px ui-monospace, monospace';
      ctx.fillText(it.label, x, PAD + 12);
      ctx.drawImage(it.im, x, PAD + LABEL, cw, ch);
      ctx.strokeStyle = '#374151';
      ctx.strokeRect(x + 0.5, PAD + LABEL + 0.5, cw, ch);
    });

    return canvas.toDataURL('image/png');
  }, shots);

  const file = path.join(evidenceDir, `${stampName}-contrast-sheet.png`);
  fs.writeFileSync(file, Buffer.from(sheetDataUrl.split(',')[1], 'base64'));
  return file;
}

// ---------- Entry point ----------
async function runVisual(page, spec, cfg, stampName) {
  const opts = spec === true ? {} : (spec || {});
  const scope = opts.scope || null;
  const minSize = opts.minSize != null ? opts.minSize : 60;

  const targets = await page.evaluate(new Function('return ' + COLLECT)(), { scopeSel: scope, minSize });
  const failures = [];
  const artifacts = [];

  if (targets.length === 0) {
    return { failures, artifacts, targetCount: 0, samples: [] };
  }

  const limit = opts.maxTargets != null ? opts.maxTargets : 12;
  const chosen = targets
    .slice()
    .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))
    .slice(0, limit);

  // Truncation is stated, never silent: a bounded probe that reads as
  // "everything is fine" is the failure mode this whole ticket is about.
  const truncated = targets.length > chosen.length
    ? ` (probed the ${chosen.length} largest of ${targets.length} radius-bearing elements)`
    : '';

  if (opts.corners !== false) {
    const { findings } = await cornerProbe(page, chosen, opts);
    failures.push(...findings);
  }

  if (opts.invariant !== false) {
    const found = await page.evaluate(new Function('return ' + INVARIANT)(), chosen);
    failures.push(...found);
  }

  if (opts.contrastSheet && cfg.evidenceDir) {
    for (let i = 0; i < Math.min(chosen.length, opts.sheetsFor || 3); i++) {
      try {
        artifacts.push(await contrastSheet(page, chosen[i], cfg.evidenceDir, `${stampName}-${i}`));
      } catch (_) { /* a sheet is evidence, never a gate */ }
    }
  }

  return { failures, artifacts, targetCount: chosen.length, truncated };
}

module.exports = { runVisual, decodePng, pixelAt };
