// .inkpot bundle (v1) pack + unpack.
//
// Pack: { frames, jsxBodies, assets } → Uint8Array (a ZIP).
// Unpack: Uint8Array → { artboards, assets }.
//
// Pure. Deterministic: fixed ordering + zip-epoch timestamps produce
// byte-identical archives for byte-identical inputs.

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { emitHeader, splitHeader, HASH_LEN } from './format.js';

// ZIP format's minimum representable date. Any older value gets clamped.
const EPOCH = new Date('1980-01-01T00:00:00Z');

const JSX_RE = /^(\d+)\.jsx$/;
const ASSET_RE = new RegExp(`^assets\\/([0-9a-f]{${HASH_LEN}})\\.(png|jpg|jpeg|webp|svg|gif)$`, 'i');

export function pack({ frames, jsxBodies, assets }) {
  if (frames.length !== jsxBodies.length) {
    throw new Error(`pack: frames (${frames.length}) and jsxBodies (${jsxBodies.length}) length mismatch`);
  }

  const entries = {};

  // JSX files, sorted by frame.number ascending. Header on line 1.
  const indexed = frames.map((f, i) => ({ f, body: jsxBodies[i] }));
  indexed.sort((a, b) => a.f.number - b.f.number);

  for (const { f, body } of indexed) {
    const header = emitHeader({ w: f.width, h: f.height });
    const text = `${header}\n${body}`;
    entries[`${f.number}.jsx`] = [strToU8(text), { mtime: EPOCH }];
  }

  // Assets, sorted by hash ascending.
  const sortedAssets = [...assets].sort((a, b) => a.hash.localeCompare(b.hash));
  for (const asset of sortedAssets) {
    const bytes = asset.bytes instanceof Uint8Array ? asset.bytes : new Uint8Array(asset.bytes);
    entries[`assets/${asset.hash}.${asset.ext}`] = [bytes, { mtime: EPOCH }];
  }

  return zipSync(entries, { mtime: EPOCH });
}

export function unpack(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let files;
  try {
    files = unzipSync(bytes);
  } catch (err) {
    throw new Error(`Invalid .inkpot: cannot read as ZIP (${err.message})`);
  }

  const artboards = [];
  const assets = [];

  for (const [path, data] of Object.entries(files)) {
    const jsxM = path.match(JSX_RE);
    if (jsxM) {
      const n = Number(jsxM[1]);
      const text = strFromU8(data);
      const split = splitHeader(text);
      if (!split) throw new Error(`Invalid .inkpot: "${path}" missing or malformed header`);
      artboards.push({ n, w: split.header.w, h: split.header.h, jsx: split.body });
      continue;
    }
    const assetM = path.match(ASSET_RE);
    if (assetM) {
      const ext = assetM[2].toLowerCase();
      assets.push({
        hash: assetM[1].toLowerCase(),
        ext: ext === 'jpeg' ? 'jpg' : ext,
        bytes: data,
        path,
      });
      continue;
    }
    throw new Error(`Invalid .inkpot: unexpected entry "${path}"`);
  }

  if (artboards.length === 0) {
    throw new Error('Invalid .inkpot: contains no artboards');
  }

  artboards.sort((a, b) => a.n - b.n);
  assets.sort((a, b) => a.hash.localeCompare(b.hash));

  for (let i = 0; i < artboards.length; i++) {
    if (artboards[i].n !== i + 1) {
      const got = artboards.map(a => a.n).join(', ');
      throw new Error(`Invalid .inkpot: non-contiguous artboards (got ${got}, expected 1..${artboards.length})`);
    }
  }

  return { artboards, assets };
}
