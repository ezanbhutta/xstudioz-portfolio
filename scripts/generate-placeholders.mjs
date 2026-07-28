/**
 * Generates placeholder portfolio artwork + project metadata.
 *
 * Every image is a deterministic, seeded SVG composition rendered to PNG with
 * sharp. Real client imagery can replace any file in place — same filename,
 * same folder — without touching code.
 *
 * Usage: node scripts/generate-placeholders.mjs [--force]
 *
 * Existing project folders are SKIPPED unless --force is passed, so a stray
 * run can never overwrite real client work that replaced the placeholders.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const FORCE = process.argv.includes('--force');

const OUT_ROOT = path.resolve('src/content/projects');
const W = 1600;
const H = 1200;

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                   */
/* ------------------------------------------------------------------ */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = (key) => mulberry32(hashString(key));

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */
/** palette: [field, paper, ink, accent] — muted, print-inspired combinations */
const PROJECTS = [
  {
    slug: 'aurel',
    colors: 'cream on near-black with muted gold',
    title: 'Aurel',
    category: 'logo-design',
    year: 2026,
    order: 1,
    summary:
      'A refined monogram for a contemporary jewelry house — drawn from a single continuous curve and set in warm metallics.',
    palette: ['#191713', '#ece5d8', '#191713', '#c2a267'],
  },
  {
    slug: 'meridian',
    colors: 'ice grey and steel blue on deep navy',
    title: 'Meridian',
    category: 'brand-identity',
    year: 2026,
    order: 2,
    summary:
      'A full identity system for a fintech startup — a precise geometric mark, confident type and a disciplined two-color world.',
    palette: ['#101d2c', '#e9edf0', '#101d2c', '#3e7cb1'],
  },
  {
    slug: 'solace',
    colors: 'sage and off-white on forest green',
    title: 'Solace',
    category: 'brand-guidelines',
    year: 2025,
    order: 3,
    summary:
      'A 48-page brand book for a wellness brand — rules for logo, color, type and imagery that any future designer can follow.',
    palette: ['#3f4a3c', '#eef0e9', '#2c332a', '#a8b5a0'],
  },
  {
    slug: 'northwind',
    colors: 'mist white and sage on deep pine',
    title: 'Northwind',
    category: 'logo-design',
    year: 2025,
    order: 4,
    summary:
      'A sturdy compass-inspired monogram for an outdoor supply company, built to hold up from favicon to storefront.',
    palette: ['#1b2a26', '#e7ebe4', '#1b2a26', '#7fa98e'],
  },
  {
    slug: 'nova-fitness',
    colors: 'ember orange and bone on charcoal',
    title: 'Nova Fitness',
    category: 'social-media',
    year: 2025,
    order: 5,
    summary:
      'A high-energy feed system for a boutique gym — bold templates that stay unmistakable at scroll speed.',
    palette: ['#16151a', '#f0eee9', '#16151a', '#e2593b'],
  },
  {
    slug: 'pulse',
    colors: 'magenta and bone on near-black',
    title: 'Pulse',
    category: 'animation',
    year: 2025,
    order: 6,
    summary:
      'A rhythmic logo reveal for a music-tech brand — the mark assembles beat by beat over 2.4 seconds.',
    palette: ['#131316', '#ebe9e4', '#131316', '#c25e9a'],
  },
  {
    slug: 'bloom-and-bough',
    colors: 'blush clay and cream on warm umber',
    title: 'Bloom & Bough',
    category: 'brand-identity',
    year: 2025,
    order: 7,
    summary:
      'A soft botanical identity for a florist — organic mark, seasonal palette and packaging that feels hand-tended.',
    palette: ['#54443f', '#f2ece3', '#453733', '#c98a6d'],
  },
  {
    slug: 'verity-legal',
    colors: 'bone and slate blue on dark navy',
    title: 'Verity Legal',
    category: 'stationery',
    year: 2025,
    order: 8,
    summary:
      'A restrained stationery suite for a boutique law firm — engraved-feeling cards and letterhead that signal quiet authority.',
    palette: ['#22303e', '#edeae4', '#22303e', '#9aa8b5'],
  },
  {
    slug: 'terra-forma',
    colors: 'olive gold and parchment on earth brown',
    title: 'Terra Forma',
    category: 'logo-design',
    year: 2025,
    order: 9,
    summary:
      'A layered landform mark for a landscape architecture practice — contour lines reduced to a single memorable symbol.',
    palette: ['#4a3f2f', '#ece7db', '#3b3226', '#b0a161'],
  },
  {
    slug: 'kilnworks',
    colors: 'terracotta and cream on kiln brown',
    title: 'Kilnworks',
    category: 'brand-guidelines',
    year: 2024,
    order: 10,
    summary:
      'Compact, practical guidelines for a ceramics studio — warm earth tones and rules that keep the craft feeling handmade.',
    palette: ['#6b4a38', '#f1eae1', '#513a2d', '#c99a72'],
  },
  {
    slug: 'saffron-table',
    colors: 'saffron and cream on dark cocoa',
    title: 'Saffron Table',
    category: 'social-media',
    year: 2024,
    order: 11,
    summary:
      'A campaign system for a modern Indian restaurant — spice-toned tiles and templates for menus, openings and seasonal dishes.',
    palette: ['#301d17', '#f3ece1', '#301d17', '#d78a3d'],
  },
  {
    slug: 'atlas-roasters',
    colors: 'caramel and cream on espresso',
    title: 'Atlas Roasters',
    category: 'brand-identity',
    year: 2024,
    order: 12,
    summary:
      'An identity for a specialty coffee roaster — a globe-and-bean mark with packaging built for the shelf and the feed.',
    palette: ['#2c2018', '#efe9df', '#2c2018', '#ad7c50'],
  },
  {
    slug: 'paper-and-pine',
    colors: 'moss green and cream on deep pine',
    title: 'Paper & Pine',
    category: 'stationery',
    year: 2024,
    order: 13,
    summary:
      'A tactile stationery suite for a boutique letterpress shop — cards, notecards and wraps in forest and cream.',
    palette: ['#2f3d33', '#efece3', '#2f3d33', '#88a08c'],
  },
  {
    slug: 'orbita',
    colors: 'cornflower blue and ice on midnight navy',
    title: 'Orbita',
    category: 'animation',
    year: 2024,
    order: 14,
    summary:
      'A motion identity for a space-data company — orbital paths trace the mark before settling into the static lockup.',
    palette: ['#0f1626', '#e8eaef', '#0f1626', '#5f7fce'],
  },
];

/* ------------------------------------------------------------------ */
/* SVG helpers                                                         */
/* ------------------------------------------------------------------ */
const svgDoc = (body, w = W, h = H) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const rect = (x, y, w, h, fill, rx = 0, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="${rx}" ${extra}/>`;

const circle = (cx, cy, r, fill, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

const line = (x1, y1, x2, y2, stroke, sw, extra = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;

/** Rows of rounded bars that read as greeked text. */
function greekLines(r, x, y, width, rows, lineH, gap, color, opacity = 1) {
  let out = '';
  for (let i = 0; i < rows; i++) {
    const w = width * (i === rows - 1 ? 0.45 + r() * 0.25 : 0.82 + r() * 0.18);
    out += rect(x, y + i * (lineH + gap), w, lineH, color, lineH / 2, `opacity="${opacity}"`);
  }
  return out;
}

/** Offset "print" shadow — crisp, riso-style, renderer-safe. */
const printShadow = (x, y, w, h, rx = 0) => rect(x + 14, y + 18, w, h, 'rgba(0,0,0,0.18)', rx);

/**
 * Seeded geometric mark, drawn inside a ±100 coordinate box.
 * Six archetypes so each brand's mark feels distinct but related in craft.
 */
function mark(seed, color, variant = 0) {
  const r = rng(`${seed}-mark`);
  const type = (Math.floor(r() * 6) + variant) % 6;
  const sw = 26;
  const s = `stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round"`;
  switch (type) {
    case 0: // open ring facing an orbit dot — eclipse mark
      return `<path d="M 62 -37 A 72 72 0 1 0 62 37" ${s}/><circle cx="86" cy="0" r="19" fill="${color}"/>`;
    case 1: // two stacked arcs — an abstract 'S'
      return `<path d="M -60 -20 A 46 46 0 0 1 32 -20" ${s}/><path d="M 60 20 A 46 46 0 0 1 -32 20" ${s}/>`;
    case 2: // triangle interlocked with circle
      return `<path d="M 0 -78 L 72 62 L -72 62 Z" ${s} stroke-linejoin="round"/><circle cx="0" cy="14" r="40" ${s}/>`;
    case 3: // three bars ascending
      return [
        rect(-78, -10, sw, 88, color, sw / 2),
        rect(-13, -44, sw, 122, color, sw / 2),
        rect(52, -78, sw, 156, color, sw / 2),
      ].join('');
    case 4: // crescent + orbit dot
      return `<path d="M 24 -66 A 72 72 0 1 0 24 66 A 52 52 0 1 1 24 -66 Z" fill="${color}"/><circle cx="56" cy="-48" r="17" fill="${color}"/>`;
    default: // chevron stack
      return `<path d="M -64 -8 L 0 -60 L 64 -8" ${s} stroke-linejoin="round"/><path d="M -64 48 L 0 -4 L 64 48" ${s} stroke-linejoin="round"/>`;
  }
}

const placeMark = (seed, color, cx, cy, scale, variant = 0) =>
  `<g transform="translate(${cx} ${cy}) scale(${scale})">${mark(seed, color, variant)}</g>`;

/** Fine registration crosses in the corners — quiet print-craft detail. */
function cropMarks(color, inset = 70, size = 22, sw = 2.5) {
  const c = (x, y) =>
    line(x - size, y, x + size, y, color, sw, 'opacity="0.5"') +
    line(x, y - size, x, y + size, color, sw, 'opacity="0.5"');
  return c(inset, inset) + c(W - inset, inset) + c(inset, H - inset) + c(W - inset, H - inset);
}

function swatchRow(x, y, w, h, colors, gap = 18, rx = 8) {
  const each = (w - gap * (colors.length - 1)) / colors.length;
  return colors.map((c, i) => rect(x + i * (each + gap), y, each, h, c, rx)).join('');
}

/** Repeating mark tile pattern. */
function markPattern(seed, color, cols, rows, cell, ox, oy, scale, opacity = 1) {
  let out = `<g opacity="${opacity}">`;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      out += placeMark(seed, color, ox + i * cell + cell / 2, oy + j * cell + cell / 2, scale);
    }
  }
  return out + '</g>';
}

/* ------------------------------------------------------------------ */
/* Category composers — return [cover, img1..img4] SVG strings         */
/* ------------------------------------------------------------------ */
function composeLogo(p) {
  const [field, paper, ink, accent] = p.palette;
  const r = rng(p.slug);
  const cover = svgDoc(
    rect(0, 0, W, H, field) +
      cropMarks(paper) +
      placeMark(p.slug, paper, W / 2, H / 2 - 30, 2.6) +
      rect(W / 2 - 60, H / 2 + 290, 120, 8, accent, 4),
  );
  const inverted = svgDoc(
    rect(0, 0, W, H, paper) + cropMarks(ink) + placeMark(p.slug, ink, W / 2, H / 2, 2.9),
  );
  const guides = `stroke="${paper}" stroke-width="2" opacity="0.28"`;
  const construction = svgDoc(
    rect(0, 0, W, H, field) +
      `<circle cx="${W / 2}" cy="${H / 2}" r="330" fill="none" ${guides}/>` +
      `<circle cx="${W / 2}" cy="${H / 2}" r="210" fill="none" ${guides}/>` +
      line(W / 2, 90, W / 2, H - 90, paper, 2, 'opacity="0.28"') +
      line(200, H / 2, W - 200, H / 2, paper, 2, 'opacity="0.28"') +
      line(W / 2 - 330, H / 2 - 330, W / 2 + 330, H / 2 + 330, paper, 2, 'opacity="0.18"') +
      placeMark(p.slug, accent, W / 2, H / 2, 2.9),
  );
  const pattern = svgDoc(
    rect(0, 0, W, H, accent) + markPattern(p.slug, field, 5, 4, 340, -50, -70, 0.62, 0.9),
  );
  const lockup = svgDoc(
    rect(0, 0, W, H, paper) +
      placeMark(p.slug, ink, 430, H / 2, 1.9) +
      line(660, H / 2 - 150, 660, H / 2 + 150, ink, 3, 'opacity="0.25"') +
      greekLines(r, 740, H / 2 - 96, 560, 2, 52, 34, ink) +
      rect(740, H / 2 + 76, 260, 20, accent, 10),
  );
  return [cover, inverted, construction, pattern, lockup];
}

function composeIdentity(p) {
  const [field, paper, ink, accent] = p.palette;
  const r = rng(p.slug);
  const g = 24; // mosaic gutter
  const hw = (W - g * 3) / 2;
  const hh = (H - g * 3) / 2;
  const cover = svgDoc(
    rect(0, 0, W, H, paper) +
      rect(0, 0, W, H, ink, 0, 'opacity="0.05"') +
      rect(g, g, hw, hh, field, 4) +
      placeMark(p.slug, paper, g + hw / 2, g + hh / 2, 1.35) +
      rect(g * 2 + hw, g, hw, hh, accent, 4) +
      markPattern(p.slug, field, 3, 2, 250, g * 2 + hw + 20, 30, 0.42, 0.85) +
      rect(g, g * 2 + hh, hw, hh, ink, 4) +
      greekLines(r, g + 70, g * 2 + hh + 90, hw - 220, 5, 30, 36, paper) +
      rect(g * 2 + hw, g * 2 + hh, hw, hh, paper, 4) +
      swatchRow(
        g * 2 + hw + 70,
        g * 2 + hh + hh / 2 - 55,
        hw - 140,
        110,
        [field, accent, ink],
        20,
        8,
      ),
  );
  const markImg = svgDoc(
    rect(0, 0, W, H, field) + placeMark(p.slug, paper, W / 2, H / 2, 2.7) + cropMarks(paper),
  );
  const palette = svgDoc(
    rect(0, 0, W, H, paper) +
      swatchRow(140, 200, W - 280, 300, [field, accent, ink], 26, 10) +
      greekLines(r, 140, 580, 300, 2, 22, 24, ink, 0.85) +
      greekLines(r, 140 + (W - 280 + 26) / 3, 580, 300, 2, 22, 24, ink, 0.85) +
      greekLines(r, 140 + (2 * (W - 280 + 26)) / 3, 580, 300, 2, 22, 24, ink, 0.85) +
      rect(140, 760, W - 280, 4, ink, 2, 'opacity="0.15"') +
      swatchRow(140, 830, W - 280, 150, [accent, field, ink], 26, 10),
  );
  const application = svgDoc(
    rect(0, 0, W, H, field) +
      printShadow(320, 240, 960, 720, 14) +
      rect(320, 240, 960, 720, paper, 14) +
      placeMark(p.slug, ink, 800, 520, 1.5) +
      greekLines(r, 560, 730, 480, 3, 26, 30, ink) +
      rect(560, 850, 200, 16, accent, 8),
  );
  const patternImg = svgDoc(
    rect(0, 0, W, H, ink) + markPattern(p.slug, accent, 5, 4, 340, -50, -70, 0.62),
  );
  return [cover, markImg, palette, application, patternImg];
}

function composeGuidelines(p) {
  const [field, paper, ink, accent] = p.palette;
  const r = rng(p.slug);
  const pw = 620;
  const ph = 850;
  const py = (H - ph) / 2;
  const spread =
    printShadow(W / 2 - pw - 12, py, pw, ph, 6) +
    rect(W / 2 - pw - 12, py, pw, ph, paper, 6) +
    printShadow(W / 2 + 12, py, pw, ph, 6) +
    rect(W / 2 + 12, py, pw, ph, paper, 6) +
    line(W / 2, py + 10, W / 2, py + ph - 10, ink, 2, 'opacity="0.15"');
  const cover = svgDoc(
    rect(0, 0, W, H, field) +
      spread +
      placeMark(p.slug, ink, W / 2 - pw / 2 - 12, py + 300, 1.15) +
      greekLines(r, W / 2 - pw - 12 + 90, py + 520, pw - 180, 4, 22, 26, ink, 0.8) +
      swatchRow(W / 2 + 12 + 90, py + 110, pw - 180, 110, [field, accent, ink], 16, 8) +
      greekLines(r, W / 2 + 12 + 90, py + 300, pw - 180, 7, 22, 26, ink, 0.8) +
      rect(W / 2 + 12 + 90, py + ph - 130, 180, 14, accent, 7),
  );
  const bookCover = svgDoc(
    rect(0, 0, W, H, field) +
      printShadow(W / 2 - 330, py, 660, ph, 6) +
      rect(W / 2 - 330, py, 660, ph, accent, 6) +
      placeMark(p.slug, field, W / 2, py + 330, 1.35) +
      rect(W / 2 - 190, py + 590, 380, 22, field, 11) +
      rect(W / 2 - 120, py + 650, 240, 14, field, 7, 'opacity="0.7"'),
  );
  const typePage = svgDoc(
    rect(0, 0, W, H, paper) +
      rect(140, 160, 60, 8, accent, 4) +
      rect(140, 230, 620, 130, ink, 12) +
      rect(140, 400, 430, 72, ink, 10, 'opacity="0.75"') +
      rect(140, 508, 300, 40, ink, 8, 'opacity="0.55"') +
      greekLines(r, 140, 640, 640, 6, 24, 28, ink, 0.8) +
      line(880, 160, 880, H - 160, ink, 2, 'opacity="0.15"') +
      greekLines(r, 960, 230, 480, 9, 22, 30, ink, 0.7) +
      rect(960, 720, 200, 14, accent, 7),
  );
  const colorPage = svgDoc(
    rect(0, 0, W, H, paper) +
      rect(140, 160, 60, 8, accent, 4) +
      swatchRow(140, 240, W - 280, 340, [field, accent, ink], 30, 12) +
      greekLines(r, 140, 660, 340, 2, 20, 22, ink, 0.75) +
      greekLines(r, 588, 660, 340, 2, 20, 22, ink, 0.75) +
      greekLines(r, 1036, 660, 340, 2, 20, 22, ink, 0.75) +
      rect(140, 800, W - 280, 4, ink, 2, 'opacity="0.12"') +
      greekLines(r, 140, 860, 700, 3, 22, 26, ink, 0.7),
  );
  const usagePage = svgDoc(
    rect(0, 0, W, H, field) +
      rect(120, 170, (W - 300) / 2, 380, paper, 10) +
      placeMark(p.slug, ink, 120 + (W - 300) / 4, 360, 0.85) +
      rect(180 + (W - 300) / 2, 170, (W - 300) / 2, 380, ink, 10) +
      placeMark(p.slug, paper, 180 + (3 * (W - 300)) / 4, 360, 0.85) +
      rect(120, 620, (W - 300) / 2, 380, accent, 10) +
      placeMark(p.slug, field, 120 + (W - 300) / 4, 810, 0.85) +
      rect(180 + (W - 300) / 2, 620, (W - 300) / 2, 380, paper, 10) +
      markPattern(p.slug, accent, 3, 2, 180, 220 + (W - 300) / 2, 660, 0.32, 0.9),
  );
  return [cover, bookCover, typePage, colorPage, usagePage];
}

function composeStationery(p) {
  const [field, paper, ink, accent] = p.palette;
  const r = rng(p.slug);
  const card = (x, y, rot, front = true) => {
    const cw = 500;
    const ch = 290;
    const inner = front
      ? placeMark(p.slug, ink, cw / 2, ch / 2 - 18, 0.62) +
        rect(cw / 2 - 70, ch - 74, 140, 12, accent, 6)
      : rect(0, 0, cw, ch, ink, 12) + placeMark(p.slug, paper, cw / 2, ch / 2, 0.62);
    return `<g transform="translate(${x} ${y}) rotate(${rot})">${printShadow(0, 0, cw, ch, 12)}${rect(0, 0, cw, ch, paper, 12)}${inner}</g>`;
  };
  const letterhead = (x, y, rot, scale = 1) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">` +
    printShadow(0, 0, 640, 880, 6) +
    rect(0, 0, 640, 880, paper, 6) +
    placeMark(p.slug, ink, 110, 110, 0.42) +
    rect(430, 96, 140, 10, ink, 5, 'opacity="0.5"') +
    greekLines(r, 90, 250, 460, 9, 18, 24, ink, 0.65) +
    rect(90, 760, 180, 10, accent, 5) +
    '</g>';
  const cover = svgDoc(
    rect(0, 0, W, H, field) +
      letterhead(190, 140, -3) +
      card(830, 330, 4) +
      card(950, 640, -5, false),
  );
  const cards = svgDoc(rect(0, 0, W, H, field) + card(240, 320, -4) + card(840, 560, 3, false));
  const letterheadImg = svgDoc(rect(0, 0, W, H, field) + letterhead(480, 120, 2, 1.1));
  const envelope = svgDoc(
    rect(0, 0, W, H, field) +
      printShadow(330, 370, 940, 500, 10) +
      rect(330, 370, 940, 500, paper, 10) +
      `<path d="M 330 390 L 800 640 L 1270 390" fill="none" stroke="${ink}" stroke-width="3" opacity="0.25"/>` +
      placeMark(p.slug, ink, 470, 760, 0.42) +
      rect(950, 730, 220, 12, ink, 6, 'opacity="0.5"'),
  );
  const suite = svgDoc(
    rect(0, 0, W, H, accent) +
      letterhead(140, 150, -2, 0.92) +
      card(760, 250, 3) +
      card(880, 540, -4, false) +
      printShadow(760, 830, 560, 220, 10) +
      rect(760, 830, 560, 220, paper, 10) +
      placeMark(p.slug, ink, 860, 940, 0.4) +
      greekLines(r, 980, 900, 260, 3, 14, 18, ink, 0.6),
  );
  return [cover, cards, letterheadImg, envelope, suite];
}

function composeSocial(p) {
  const [field, paper, ink, accent] = p.palette;
  const r = rng(p.slug);
  const tile = (x, y, s, variant) => {
    const tw = 420;
    const th = 525; // 4:5
    let inner;
    if (variant === 0)
      inner =
        rect(0, 0, tw, th, accent, 10) +
        placeMark(p.slug, field, tw / 2, th / 2 - 30, 0.95) +
        rect(tw / 2 - 90, th - 120, 180, 16, field, 8);
    else if (variant === 1)
      inner =
        rect(0, 0, tw, th, paper, 10) +
        greekLines(r, 50, 70, tw - 100, 3, 34, 26, ink) +
        rect(50, 300, 130, 40, accent, 20) +
        placeMark(p.slug, ink, tw - 90, th - 90, 0.32);
    else
      inner =
        rect(0, 0, tw, th, ink, 10) +
        markPattern(p.slug, accent, 2, 3, 190, 20, -10, 0.36, 0.9) +
        rect(50, th - 88, 200, 14, paper, 7);
    return `<g transform="translate(${x} ${y}) scale(${s})">${printShadow(0, 0, tw, th, 10)}${inner}</g>`;
  };
  const cover = svgDoc(
    rect(0, 0, W, H, field) +
      tile(55, 340, 1.15, 0) +
      tile(560, 240, 1.15, 1) +
      tile(1065, 340, 1.15, 2),
  );
  const grid = svgDoc(
    rect(0, 0, W, H, field) +
      [0, 1, 2].map((i) => tile(150 + i * 460, 90, 1, (i + 1) % 3)).join('') +
      [0, 1, 2].map((i) => tile(150 + i * 460, 660, 0.98, i % 3)).join(''),
  );
  const single = svgDoc(rect(0, 0, W, H, field) + tile(W / 2 - 380, 40, 1.8, 0));
  const story = svgDoc(
    rect(0, 0, W, H, field) +
      printShadow(W / 2 - 290, 60, 580, 1080, 18) +
      rect(W / 2 - 290, 60, 580, 1080, paper, 18) +
      rect(W / 2 - 290, 60, 580, 460, accent, 18) +
      rect(W / 2 - 290, 380, 580, 140, accent) +
      placeMark(p.slug, field, W / 2, 300, 0.85) +
      greekLines(r, W / 2 - 190, 600, 380, 3, 28, 24, ink) +
      rect(W / 2 - 190, 960, 240, 48, ink, 24),
  );
  const carousel = svgDoc(
    rect(0, 0, W, H, field) +
      tile(-160, 300, 1.1, 2) +
      tile(360, 300, 1.1, 0) +
      tile(880, 300, 1.1, 1) +
      tile(1400, 300, 1.1, 2) +
      [0, 1, 2, 3]
        .map((i) =>
          circle(
            W / 2 - 60 + i * 40,
            H - 60,
            i === 1 ? 10 : 7,
            paper,
            i === 1 ? '' : 'opacity="0.45"',
          ),
        )
        .join(''),
  );
  return [cover, grid, single, story, carousel];
}

function composeAnimation(p) {
  const [field, paper, ink, accent] = p.palette;
  const arcs = (cx, cy, color) =>
    [300, 400, 500]
      .map(
        (rad, i) =>
          `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="4 26" opacity="${0.5 - i * 0.13}"/>`,
      )
      .join('');
  const cover = svgDoc(
    rect(0, 0, W, H, field) +
      arcs(W / 2, H / 2, paper) +
      placeMark(p.slug, accent, W / 2, H / 2, 2.2) +
      [0, 1, 2, 3, 4]
        .map((i) =>
          circle(
            W / 2 - 160 + i * 80,
            H - 110,
            i === 4 ? 12 : 8,
            paper,
            i === 4 ? '' : 'opacity="0.4"',
          ),
        )
        .join(''),
  );
  const frame = (x, i, total) => {
    const fw = 330;
    const fh = 414;
    const progress = (i + 1) / total;
    return (
      rect(x, H / 2 - fh / 2, fw, fh, paper, 10) +
      `<g transform="translate(${x + fw / 2} ${H / 2}) scale(${0.55 + progress * 0.5})" opacity="${0.3 + progress * 0.7}">${mark(p.slug, ink)}</g>` +
      rect(x, H / 2 + fh / 2 + 36, fw * progress, 8, accent, 4)
    );
  };
  const frames = svgDoc(
    rect(0, 0, W, H, field) + [0, 1, 2, 3].map((i) => frame(80 + i * 370, i, 4)).join(''),
  );
  const easing = svgDoc(
    rect(0, 0, W, H, field) +
      Array.from({ length: 11 }, (_, i) =>
        line(200 + i * 120, 160, 200 + i * 120, H - 160, paper, 1.5, 'opacity="0.14"'),
      ).join('') +
      Array.from({ length: 8 }, (_, i) =>
        line(200, 160 + i * 126, W - 200, 160 + i * 126, paper, 1.5, 'opacity="0.14"'),
      ).join('') +
      `<path d="M 200 ${H - 160} C 560 ${H - 160}, 680 160, ${W - 200} 160" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>` +
      circle(200, H - 160, 16, paper) +
      circle(W - 200, 160, 16, paper),
  );
  const motionBlur = svgDoc(
    rect(0, 0, W, H, field) +
      [0.12, 0.24, 0.45]
        .map(
          (o, i) =>
            `<g opacity="${o}">${placeMark(p.slug, paper, W / 2 - 340 + i * 130, H / 2, 2)}</g>`,
        )
        .join('') +
      placeMark(p.slug, accent, W / 2 + 100, H / 2, 2),
  );
  const storyboard = svgDoc(
    rect(0, 0, W, H, paper) +
      [0, 1, 2]
        .map(
          (i) =>
            rect(120 + i * 460, 180, 420, 315, field, 10) +
            `<g transform="translate(${330 + i * 460} ${337}) scale(${0.6 + i * 0.25})" opacity="${0.45 + i * 0.27}">${mark(p.slug, i === 2 ? accent : paper)}</g>`,
        )
        .join('') +
      [0, 1, 2]
        .map((i) => rect(120 + i * 460, 540, 300 - i * 60, 14, ink, 7, 'opacity="0.6"'))
        .join('') +
      rect(120, 700, W - 240, 4, ink, 2, 'opacity="0.12"') +
      [0, 1, 2, 3, 4, 5, 6, 7]
        .map((i) =>
          rect(120 + i * 170, 760, 120, 200, i % 2 ? field : ink, 8, `opacity="${0.9 - i * 0.09}"`),
        )
        .join(''),
  );
  return [cover, frames, easing, motionBlur, storyboard];
}

const COMPOSERS = {
  'logo-design': composeLogo,
  'brand-identity': composeIdentity,
  'brand-guidelines': composeGuidelines,
  stationery: composeStationery,
  'social-media': composeSocial,
  animation: composeAnimation,
};

/** Plain-language description of the seeded mark archetype for alt text. */
const MARK_DESCRIPTIONS = [
  'an open ring facing an orbit dot',
  'two interlocking arcs',
  'a triangle interlocked with a circle',
  'three ascending bars',
  'a crescent with an orbit dot',
  'a stacked double chevron',
];

function markDescription(slug) {
  const r = rng(`${slug}-mark`);
  return MARK_DESCRIPTIONS[Math.floor(r() * 6) % 6];
}

/**
 * Human alt text per category, per image position (cover first).
 * `mark` describes the actual mark geometry; `colors` the actual palette.
 */
const ALTS = {
  'logo-design': (t, mark, colors) => [
    `${t} logo mark — ${mark} — in ${colors}, centered between fine registration marks`,
    `${t} logo mark, ${mark}, in dark ink on a light field`,
    `Construction grid showing the circular geometry behind the ${t} mark`,
    `Repeating brand pattern tiled from the ${t} mark`,
    `${t} horizontal lockup: the mark beside abstract wordmark bars`,
  ],
  'brand-identity': (t, mark, colors) => [
    `${t} brand identity overview in ${colors} — mark, pattern, type block and palette in a four-tile grid`,
    `${t} primary mark, ${mark}, on the core brand color`,
    `${t} color palette: primary and secondary swatch rows with labels`,
    `${t} brand card application with the mark and supporting text lines`,
    `${t} brand pattern of repeated marks in accent color on a dark field`,
  ],
  'brand-guidelines': (t, _mark, colors) => [
    `Open spread of the ${t} brand guidelines book in ${colors}`,
    `Front cover of the ${t} brand guidelines with centered mark`,
    `Typography scale page from the ${t} guidelines`,
    `Color system page from the ${t} guidelines with three swatch panels`,
    `Logo usage grid from the ${t} guidelines: the mark on four background treatments`,
  ],
  stationery: (t, _mark, colors) => [
    `${t} stationery flat lay in ${colors} — letterhead with two business cards`,
    `${t} business cards, front and back, at a slight angle`,
    `${t} letterhead with the mark top-left and address line top-right`,
    `${t} envelope with the mark at the flap`,
    `Complete ${t} stationery suite arranged on the brand accent color`,
  ],
  'social-media': (t, _mark, colors) => [
    `Three ${t} social post designs in ${colors}, arranged as a staggered set`,
    `${t} feed grid of six coordinated post designs`,
    `${t} featured social post with the mark and headline block`,
    `${t} story template with hero panel and action button`,
    `${t} carousel sequence of four posts with position dots`,
  ],
  animation: (t, mark, colors) => [
    `${t} animated logo hero frame in ${colors} — the mark inside dotted orbital trails`,
    `Four key frames of the ${t} mark scaling up as its reveal progresses`,
    `Easing curve for the ${t} motion system plotted on a grid`,
    `${t} mark, ${mark}, with a motion trail of fading copies`,
    `${t} animation storyboard: three frames with timing bars beneath`,
  ],
};

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */
async function renderProject(p) {
  const dir = path.join(OUT_ROOT, p.slug);
  if (existsSync(dir) && !FORCE) return { slug: p.slug, skipped: true };
  const compose = COMPOSERS[p.category];
  if (!compose) {
    throw new Error(
      `No composer for category "${p.category}" (project "${p.slug}"). ` +
        `Add it to COMPOSERS and ALTS in this script.`,
    );
  }
  await mkdir(dir, { recursive: true });
  const svgs = compose(p);
  const names = ['cover', '01', '02', '03', '04'];
  if (svgs.length !== names.length) {
    throw new Error(
      `Composer for "${p.category}" returned ${svgs.length} images; expected ${names.length}.`,
    );
  }
  await Promise.all(
    svgs.map((svg, i) =>
      sharp(Buffer.from(svg))
        .png({ compressionLevel: 9, palette: true, quality: 92 })
        .toFile(path.join(dir, `${names[i]}.png`)),
    ),
  );
  const alts = ALTS[p.category](p.title, markDescription(p.slug), p.colors);
  const meta = {
    title: p.title,
    category: p.category,
    year: p.year,
    order: p.order,
    summary: p.summary,
    cover: './cover.png',
    coverAlt: alts[0],
    // The cover composition opens the gallery — the detail page renders
    // `images` only, while `cover` stays the grid thumbnail.
    images: names.map((n, i) => ({ src: `./${n}.png`, alt: alts[i] })),
  };
  await writeFile(path.join(dir, 'index.json'), JSON.stringify(meta, null, 2) + '\n');
  return { slug: p.slug, skipped: false };
}

let generated = 0;
for (const p of PROJECTS) {
  const { slug, skipped } = await renderProject(p);
  console.log(skipped ? `- ${slug} (exists, skipped — use --force to overwrite)` : `✓ ${slug}`);
  if (!skipped) generated += 1;
}
console.log(`\nGenerated ${generated}/${PROJECTS.length} projects → ${OUT_ROOT}`);
