// Single source of truth for the .inkpot file format (v1).
//
// Everything the format cares about lives here as small pure functions:
// header, asset hashing, mime↔ext mapping, Paper CDN URL recognition.
//
// Pure. No I/O.

import { createHash } from 'node:crypto';

// Paper serves image fills from this CDN host. External URLs are not touched.
export const PAPER_URL_RE = /https:\/\/app\.paper\.design\/file-assets\/[^"'\s)]+/g;

// Data URI pattern used across the optimize pipeline and inline step.
export const DATA_URL_RE = /data:image\/(png|jpe?g|webp|svg\+xml|gif);base64,([A-Za-z0-9+/=]+)/g;

// MIME ↔ extension mapping for the extensions we accept in .inkpot/assets/.
const MIME_TO_EXT = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/jpg':     'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
  'image/gif':     'gif',
};

const EXT_TO_MIME = {
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg:  'image/svg+xml',
  gif:  'image/gif',
};

export function extFromContentType(ct) {
  if (!ct) return null;
  const key = ct.split(';')[0].trim().toLowerCase();
  return MIME_TO_EXT[key] ?? null;
}

export function extFromUrl(url) {
  const m = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  const ext = m?.[1].toLowerCase();
  return ext && EXT_TO_MIME[ext] ? (ext === 'jpeg' ? 'jpg' : ext) : null;
}

export function mimeFromExt(ext) {
  return EXT_TO_MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

// 16 hex chars of SHA-256 — 64 bits of entropy, collision-safe at design scale.
export const HASH_LEN = 16;

export function assetHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, HASH_LEN);
}

// Header emitted on line 1 of every <n>.jsx: "<!-- inkpot w:<W> h:<H> -->"
export function emitHeader({ w, h }) {
  return `<!-- inkpot w:${w} h:${h} -->`;
}

const HEADER_RE = /^<!--\s*inkpot\s+w:(\d+)\s+h:(\d+)\s*-->/;

export function parseHeader(firstLine) {
  const m = firstLine.match(HEADER_RE);
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

// Given a JSX body with a line-1 header, split into { header, body }.
export function splitHeader(text) {
  const nl = text.indexOf('\n');
  const first = nl === -1 ? text : text.slice(0, nl);
  const rest = nl === -1 ? '' : text.slice(nl + 1);
  const header = parseHeader(first);
  if (!header) return null;
  return { header, body: rest };
}
