// HTML → HTML image optimization passes.
//
//   blooms: radial-gradient + filter:blur → shared PNG XObjects (Skia dedups)
//   photos: data: URI images classified by entropy → JPEG/palette-PNG
//
// Pure given sharp. Same input → byte-identical output (no timestamps/rng).

import sharp from 'sharp';
import { DATA_URL_RE } from './format.js';

// ───────── BLOOMS ─────────

const BLOOM_SIZE = 512;
const BLOOM_BLUR_SIGMA = 14;

function findRadialGradients(html) {
  const results = [];
  const re = /radial-gradient\(/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const start = m.index;
    let depth = 1;
    let i = start + 'radial-gradient('.length;
    while (i < html.length && depth > 0) {
      const c = html[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    if (depth === 0) results.push({ full: html.slice(start, i), start, end: i });
  }
  return results;
}

function parseAlpha(s) {
  s = s.trim();
  if (s.endsWith('%')) return parseFloat(s) / 100;
  return parseFloat(s);
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function encodeSRGB(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

function oklabToSRGB(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const rLin =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [encodeSRGB(rLin), encodeSRGB(gLin), encodeSRGB(bLin)];
}

function parseColor(str) {
  str = str.trim();
  let m = str.match(/^oklab\(\s*([-\d.]+)%?\s+([-\d.]+)\s+([-\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const L = parseFloat(m[1]) / 100, a = parseFloat(m[2]), b = parseFloat(m[3]);
    const alpha = m[4] ? parseAlpha(m[4]) : 1;
    const [r, g, bb] = oklabToSRGB(L, a, b);
    return { r: Math.round(clamp01(r) * 255), g: Math.round(clamp01(g) * 255), b: Math.round(clamp01(bb) * 255), a: alpha };
  }
  m = str.match(/^rgba?\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) return { r: Math.round(parseFloat(m[1])), g: Math.round(parseFloat(m[2])), b: Math.round(parseFloat(m[3])), a: m[4] ? parseAlpha(m[4]) : 1 };
  m = str.match(/^rgba?\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)(?:\s*,\s*([\d.]+%?))?\s*\)$/);
  if (m) return { r: Math.round(parseFloat(m[1])), g: Math.round(parseFloat(m[2])), b: Math.round(parseFloat(m[3])), a: m[4] ? parseAlpha(m[4]) : 1 };
  m = str.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    const hex = m[1];
    if (hex.length === 3) return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), a: 1 };
    if (hex.length === 6) return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
  }
  return null;
}

function parseColorStop(str) {
  str = str.trim();
  const stopMatch = str.match(/\s+(-?\d+(?:\.\d+)?)%\s*$/);
  const offset = stopMatch ? parseFloat(stopMatch[1]) / 100 : null;
  const colorPart = stopMatch ? str.slice(0, -stopMatch[0].length).trim() : str;
  const rgba = parseColor(colorPart);
  if (!rgba) return null;
  return { ...rgba, offset };
}

function splitTopLevel(inside) {
  const parts = [];
  let depth = 0, current = '';
  for (const c of inside) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(current.trim()); current = ''; }
    else current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

async function renderBloomPng(stops, sizePx) {
  const stopTags = stops
    .map((s, i) =>
      `<stop offset="${(s.offset != null ? s.offset : i / (stops.length - 1)).toFixed(4)}" stop-color="rgb(${s.r},${s.g},${s.b})" stop-opacity="${s.a.toFixed(4)}"/>`
    )
    .join('');
  const cx = sizePx / 2;
  const r = (sizePx / 2) * Math.SQRT2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}"><defs><radialGradient id="b" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cx}" r="${r.toFixed(3)}">${stopTags}</radialGradient></defs><rect width="100%" height="100%" fill="url(#b)"/></svg>`;
  return sharp(Buffer.from(svg)).blur(BLOOM_BLUR_SIGMA).png({ compressionLevel: 9 }).toBuffer();
}

function findEnclosingStyle(html, pos) {
  const openSearch = html.lastIndexOf('style="', pos);
  if (openSearch < 0) return null;
  const contentStart = openSearch + 'style="'.length;
  if (contentStart > pos) return null;
  const contentEnd = html.indexOf('"', contentStart);
  if (contentEnd < pos) return null;
  return { styleStart: openSearch, contentStart, contentEnd, styleEnd: contentEnd + 1 };
}

function stripDeclarations(style, predicate) {
  return style.split(';').map(s => s.trim()).filter(Boolean).filter(decl => !predicate(decl)).join(';');
}

export async function blooms(html) {
  const gradients = findRadialGradients(html);
  if (gradients.length === 0) return { html, summary: { replaced: 0, unique: 0, before: 0, after: 0 } };

  const cache = new Map();
  const toProcess = [];
  for (const g of gradients) {
    const inside = g.full.slice('radial-gradient('.length, -1).trim();
    const parts = splitTopLevel(inside);
    if (parts.length < 2) continue;
    const stops = parts.slice(1).map(parseColorStop).filter(Boolean);
    if (stops.length < 2) continue;
    if (!stops.some(s => s.a < 1)) continue;
    toProcess.push({ ...g, stops });
  }

  for (const g of toProcess) {
    if (cache.has(g.full)) continue;
    const png = await renderBloomPng(g.stops, BLOOM_SIZE);
    cache.set(g.full, `data:image/png;base64,${png.toString('base64')}`);
  }

  const styleEdits = new Map();
  let before = 0, after = 0;

  for (const g of toProcess) {
    const dataUrl = cache.get(g.full);
    if (!dataUrl) continue;
    const enclosing = findEnclosingStyle(html, g.start);
    if (!enclosing) continue;
    const key = enclosing.contentStart;
    if (!styleEdits.has(key)) {
      styleEdits.set(key, {
        contentStart: enclosing.contentStart,
        contentEnd: enclosing.contentEnd,
        original: html.slice(enclosing.contentStart, enclosing.contentEnd),
      });
    }
    const edit = styleEdits.get(key);
    const currentStyle = edit.rewritten ?? edit.original;
    let afterReplace = currentStyle.replace(g.full, `url(${dataUrl})`);
    if (!/background-size\s*:/i.test(afterReplace)) afterReplace += ';background-size:100% 100%';
    edit.rewritten = afterReplace;
    before += g.full.length;
    after += `url(${dataUrl})`.length;
  }

  for (const edit of styleEdits.values()) {
    if (!edit.rewritten) continue;
    edit.rewritten = stripDeclarations(edit.rewritten, decl => {
      if (/^filter\s*:/i.test(decl) && /blur\s*\(/i.test(decl)) return true;
      if (/^border-radius\s*:\s*50%\s*$/i.test(decl)) return true;
      return false;
    });
  }

  const edits = [...styleEdits.values()].sort((a, b) => b.contentStart - a.contentStart);
  let out = html;
  for (const edit of edits) {
    if (!edit.rewritten) continue;
    out = out.slice(0, edit.contentStart) + edit.rewritten + out.slice(edit.contentEnd);
  }

  return { html: out, summary: { replaced: toProcess.length, unique: cache.size, before, after } };
}

// ───────── PHOTOS ─────────

const PAGE_WIDTH_PX = 832;
const BLOOM_MAX_WIDTH = PAGE_WIDTH_PX;
const PHOTO_MAX_WIDTH = PAGE_WIDTH_PX * 2;
const BLOOM_ENTROPY_THRESHOLD = 4.5;
const BLOOM_JPEG_QUALITY = 55;
const BLOOM_PNG_COLORS = 64;
const PHOTO_JPEG_QUALITY = 88;
const SKIP_UNDER_BYTES = 4096;

async function optimizeOne(base64) {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length < SKIP_UNDER_BYTES) return null;

  const img = sharp(buffer);
  let meta, stats;
  try {
    meta = await img.metadata();
    stats = await img.stats();
  } catch { return null; }

  const hasAlpha = meta.hasAlpha;
  const colorChannels = hasAlpha ? stats.channels.slice(0, -1) : stats.channels;
  const entropy = colorChannels.reduce((s, c) => s + c.entropy, 0) / colorChannels.length;
  const isBloom = entropy < BLOOM_ENTROPY_THRESHOLD;

  const targetWidth = isBloom ? BLOOM_MAX_WIDTH : PHOTO_MAX_WIDTH;
  const shouldResize = meta.width > targetWidth;

  let pipeline = sharp(buffer);
  if (shouldResize) pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: true });

  let output, kind;
  if (isBloom && hasAlpha) {
    output = await pipeline.png({ palette: true, colors: BLOOM_PNG_COLORS, compressionLevel: 9 }).toBuffer();
    kind = 'bloom-png';
  } else if (isBloom) {
    output = await pipeline.jpeg({ quality: BLOOM_JPEG_QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();
    kind = 'bloom-jpg';
  } else if (hasAlpha) {
    output = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    kind = 'photo-png';
  } else {
    output = await pipeline.jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();
    kind = 'photo-jpg';
  }

  const originalB64Len = Math.ceil((buffer.length * 4) / 3);
  const newB64Len = Math.ceil((output.length * 4) / 3);
  if (newB64Len >= originalB64Len) return null;

  const mime = kind.endsWith('png') ? 'png' : 'jpeg';
  return { kind, dataUrl: `data:image/${mime};base64,${output.toString('base64')}` };
}

export async function photos(html) {
  const tasks = new Map();
  for (const match of html.matchAll(DATA_URL_RE)) {
    const full = match[0];
    if (tasks.has(full)) continue;
    tasks.set(full, optimizeOne(match[2]));
  }
  if (tasks.size === 0) return { html, summary: { count: 0, before: 0, after: 0 } };

  const results = await Promise.all(tasks.values());
  const entries = [...tasks.keys()].map((original, i) => [original, results[i]]);

  let out = html;
  let before = 0, after = 0;
  const classCounts = {};

  for (const [original, replacement] of entries) {
    before += original.length;
    if (!replacement) { after += original.length; classCounts.skipped = (classCounts.skipped || 0) + 1; continue; }
    after += replacement.dataUrl.length;
    classCounts[replacement.kind] = (classCounts[replacement.kind] || 0) + 1;
    out = out.split(original).join(replacement.dataUrl);
  }

  return { html: out, summary: { count: entries.length, before, after, classCounts } };
}

export function formatBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
