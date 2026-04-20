// JSX/HTML text transformations.
//
// Pure. Three small primitives that compose into save/load/pdf flows:
//   - replaceAll: general string multi-replace (split/join, regex-meta safe)
//   - extractAssetRefs: find "assets/<hash>.<ext>" in a bundle-embedded JSX
//   - toDataUri: build a data: URI for an in-memory asset

import { HASH_LEN, mimeFromExt } from './format.js';

// Replace every key with its value. Runs keys sequentially — order doesn't
// matter as long as mapping values never contain other mapping keys.
export function replaceAll(text, mapping) {
  let out = text;
  for (const [from, to] of Object.entries(mapping)) {
    if (from === to) continue;
    out = out.split(from).join(to);
  }
  return out;
}

const ASSET_REF_RE = new RegExp(`assets\\/[0-9a-f]{${HASH_LEN}}\\.(?:png|jpg|jpeg|webp|svg|gif)`, 'gi');

export function extractAssetRefs(text) {
  return [...new Set([...text.matchAll(ASSET_REF_RE)].map(m => m[0]))];
}

export function toDataUri({ ext, bytes }) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return `data:${mimeFromExt(ext)};base64,${buf.toString('base64')}`;
}

// Paper's write_html CSS parser silently drops CSS Logical Properties
// (padding-block, padding-inline, block-size, etc.). Rewrite them to
// their physical long-form equivalents before sending HTML to Paper.
// Paper's get_jsx output uses these, so round-trips break without this step.
function splitOneOrTwo(val) {
  const parts = val.trim().split(/\s+/);
  return { start: parts[0], end: parts[1] ?? parts[0] };
}

const LOGICAL_RULES = [
  { re: /padding-block:\s*([^;"]+)/g,  expand: v => { const { start, end } = splitOneOrTwo(v); return `padding-top: ${start};padding-bottom: ${end}`; } },
  { re: /padding-inline:\s*([^;"]+)/g, expand: v => { const { start, end } = splitOneOrTwo(v); return `padding-left: ${start};padding-right: ${end}`; } },
  { re: /margin-block:\s*([^;"]+)/g,   expand: v => { const { start, end } = splitOneOrTwo(v); return `margin-top: ${start};margin-bottom: ${end}`; } },
  { re: /margin-inline:\s*([^;"]+)/g,  expand: v => { const { start, end } = splitOneOrTwo(v); return `margin-left: ${start};margin-right: ${end}`; } },
  { re: /block-size:\s*([^;"]+)/g,     expand: v => `height: ${v.trim()}` },
  { re: /inline-size:\s*([^;"]+)/g,    expand: v => `width: ${v.trim()}` },
];

export function normalizeLogicalCss(html) {
  let out = html;
  for (const { re, expand } of LOGICAL_RULES) {
    out = out.replace(re, (_m, val) => expand(val));
  }
  return out;
}
