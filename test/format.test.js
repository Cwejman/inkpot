import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAPER_URL_RE,
  assetHash, HASH_LEN,
  emitHeader, parseHeader, splitHeader,
  extFromContentType, extFromUrl, mimeFromExt,
} from '../src/core/format.js';

test('assetHash is deterministic and 16 hex chars', () => {
  const h1 = assetHash(Buffer.from('hello'));
  const h2 = assetHash(Buffer.from('hello'));
  assert.equal(h1, h2);
  assert.equal(h1.length, HASH_LEN);
  assert.match(h1, /^[0-9a-f]+$/);
  assert.notEqual(h1, assetHash(Buffer.from('world')));
});

test('emit/parse header round-trips', () => {
  const emitted = emitHeader({ w: 832, h: 1178 });
  assert.equal(emitted, '<!-- inkpot w:832 h:1178 -->');
  assert.deepEqual(parseHeader(emitted), { w: 832, h: 1178 });
});

test('parseHeader rejects malformed lines', () => {
  assert.equal(parseHeader('<!-- inkpot w:832 -->'), null);
  assert.equal(parseHeader('garbage'), null);
  assert.equal(parseHeader(''), null);
});

test('splitHeader returns header + body', () => {
  const text = '<!-- inkpot w:10 h:20 -->\n<div>hi</div>';
  const split = splitHeader(text);
  assert.deepEqual(split.header, { w: 10, h: 20 });
  assert.equal(split.body, '<div>hi</div>');
});

test('splitHeader returns null when header missing', () => {
  assert.equal(splitHeader('<div>hi</div>'), null);
});

test('PAPER_URL_RE matches Paper CDN URLs', () => {
  const sample = 'foo https://app.paper.design/file-assets/abc/one.png bar https://app.paper.design/file-assets/xyz/two.jpg baz';
  const matches = [...sample.matchAll(PAPER_URL_RE)].map(m => m[0]);
  assert.equal(matches.length, 2);
  assert.ok(matches[0].endsWith('one.png'));
  assert.ok(matches[1].endsWith('two.jpg'));
});

test('PAPER_URL_RE ignores non-Paper hosts', () => {
  const sample = 'https://example.com/foo.png';
  assert.equal([...sample.matchAll(PAPER_URL_RE)].length, 0);
});

test('extFromContentType maps MIME to canonical extension', () => {
  assert.equal(extFromContentType('image/png'), 'png');
  assert.equal(extFromContentType('image/jpeg'), 'jpg');
  assert.equal(extFromContentType('image/jpeg; charset=binary'), 'jpg');
  assert.equal(extFromContentType('image/svg+xml'), 'svg');
  assert.equal(extFromContentType('image/webp'), 'webp');
  assert.equal(extFromContentType('application/octet-stream'), null);
  assert.equal(extFromContentType(null), null);
});

test('extFromUrl falls back to URL extension', () => {
  assert.equal(extFromUrl('https://x.com/path/foo.PNG'), 'png');
  assert.equal(extFromUrl('https://x.com/foo.jpeg?v=2'), 'jpg');
  assert.equal(extFromUrl('https://x.com/foo'), null);
});

test('mimeFromExt is the inverse', () => {
  assert.equal(mimeFromExt('png'), 'image/png');
  assert.equal(mimeFromExt('jpg'), 'image/jpeg');
  assert.equal(mimeFromExt('svg'), 'image/svg+xml');
});
