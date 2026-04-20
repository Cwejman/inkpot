import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack } from '../src/core/bundle.js';

function makeFrame(number, width = 832, height = 1178) {
  return { name: `p/${number}`, id: `id-${number}`, number, width, height };
}

test('pack+unpack round-trip preserves artboards and assets', () => {
  const frames = [makeFrame(1), makeFrame(2)];
  const jsxBodies = ['<div>one</div>', '<div>two</div>'];
  const assets = [
    { hash: 'aaaaaaaaaaaaaaaa', ext: 'png', bytes: new Uint8Array([1, 2, 3]) },
    { hash: 'bbbbbbbbbbbbbbbb', ext: 'jpg', bytes: new Uint8Array([4, 5, 6]) },
  ];
  const buf = pack({ frames, jsxBodies, assets });
  const out = unpack(buf);
  assert.equal(out.artboards.length, 2);
  assert.deepEqual(out.artboards[0], { n: 1, w: 832, h: 1178, jsx: '<div>one</div>' });
  assert.deepEqual(out.artboards[1], { n: 2, w: 832, h: 1178, jsx: '<div>two</div>' });
  assert.equal(out.assets.length, 2);
  assert.deepEqual(Array.from(out.assets[0].bytes), [1, 2, 3]);
});

test('pack is deterministic — same input, same bytes', () => {
  const frames = [makeFrame(1)];
  const jsxBodies = ['<div>x</div>'];
  const assets = [{ hash: 'deadbeefdeadbeef', ext: 'png', bytes: new Uint8Array([42]) }];
  const a = pack({ frames, jsxBodies, assets });
  const b = pack({ frames, jsxBodies, assets });
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
});

test('pack orders by frame.number even if frames given out of order', () => {
  const frames = [makeFrame(2), makeFrame(1)];
  const jsxBodies = ['<div>two</div>', '<div>one</div>'];
  const buf = pack({ frames, jsxBodies, assets: [] });
  const out = unpack(buf);
  assert.equal(out.artboards[0].jsx, '<div>one</div>');
  assert.equal(out.artboards[1].jsx, '<div>two</div>');
});

test('unpack rejects unknown top-level entries', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  const buf = zipSync({
    '1.jsx': strToU8('<!-- inkpot w:10 h:10 -->\n<div/>'),
    'README.md': strToU8('hello'),
  });
  assert.throws(() => unpack(buf), /unexpected entry/);
});

test('unpack rejects missing header', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  const buf = zipSync({ '1.jsx': strToU8('<div/>') });
  assert.throws(() => unpack(buf), /missing or malformed header/);
});

test('unpack rejects non-contiguous artboards', () => {
  const frames = [makeFrame(1), makeFrame(3)];
  const jsxBodies = ['<div>a</div>', '<div>c</div>'];
  const buf = pack({ frames, jsxBodies, assets: [] });
  assert.throws(() => unpack(buf), /non-contiguous/);
});

test('unpack rejects empty bundle', async () => {
  const { zipSync } = await import('fflate');
  const buf = zipSync({});
  assert.throws(() => unpack(buf), /no artboards/);
});

test('unpack rejects corrupt zip bytes', () => {
  assert.throws(() => unpack(new Uint8Array([1, 2, 3, 4])), /cannot read as ZIP/);
});
