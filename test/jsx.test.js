import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replaceAll, extractAssetRefs, toDataUri, normalizeLogicalCss } from '../src/core/jsx.js';

test('replaceAll replaces multiple keys, multi-occurrence each', () => {
  const out = replaceAll('a b a c a', { a: 'X', c: 'Z' });
  assert.equal(out, 'X b X Z X');
});

test('replaceAll is regex-meta safe', () => {
  const out = replaceAll('foo.bar+baz', { 'foo.bar+baz': 'ok' });
  assert.equal(out, 'ok');
});

test('replaceAll skips identity mappings', () => {
  assert.equal(replaceAll('hello', { hello: 'hello' }), 'hello');
});

test('extractAssetRefs finds refs and dedupes', () => {
  const text = `src="assets/abc123def4567890.png" x="assets/abc123def4567890.png" y="assets/ffffffffffffffff.jpg"`;
  const refs = extractAssetRefs(text);
  assert.equal(refs.length, 2);
  assert.ok(refs.includes('assets/abc123def4567890.png'));
  assert.ok(refs.includes('assets/ffffffffffffffff.jpg'));
});

test('extractAssetRefs ignores wrong hash length', () => {
  const text = 'assets/abc.png assets/deadbeefdeadbeef.png';
  const refs = extractAssetRefs(text);
  assert.deepEqual(refs, ['assets/deadbeefdeadbeef.png']);
});

test('toDataUri builds standard data URI', () => {
  const uri = toDataUri({ ext: 'png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
  assert.equal(uri, 'data:image/png;base64,iVBORw==');
});

test('toDataUri handles Uint8Array input', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const uri = toDataUri({ ext: 'jpg', bytes });
  assert.ok(uri.startsWith('data:image/jpeg;base64,'));
});

test('save/load round-trip via replaceAll is self-inverse', () => {
  // Simulates the save→load dance.
  const jsx = `<img src="https://app.paper.design/file-assets/AAA/foo.png" />`;
  const url = 'https://app.paper.design/file-assets/AAA/foo.png';
  const ref = 'assets/deadbeefdeadbeef.png';
  const saved = replaceAll(jsx, { [url]: ref });
  const loaded = replaceAll(saved, { [ref]: url });
  assert.equal(loaded, jsx);
});

test('normalizeLogicalCss expands padding-block/inline to physical', () => {
  const html = `<div style="padding-block: 80px;padding-inline: 80px;color:red">x</div>`;
  const out = normalizeLogicalCss(html);
  assert.match(out, /padding-top: 80px;padding-bottom: 80px/);
  assert.match(out, /padding-left: 80px;padding-right: 80px/);
  assert.doesNotMatch(out, /padding-block:/);
  assert.doesNotMatch(out, /padding-inline:/);
});

test('normalizeLogicalCss handles two-value logical padding', () => {
  const html = `<div style="padding-block: 10px 20px">x</div>`;
  const out = normalizeLogicalCss(html);
  assert.match(out, /padding-top: 10px;padding-bottom: 20px/);
});

test('normalizeLogicalCss rewrites block-size / inline-size', () => {
  const html = `<div style="block-size: 100px;inline-size: 200px">x</div>`;
  const out = normalizeLogicalCss(html);
  assert.match(out, /height: 100px/);
  assert.match(out, /width: 200px/);
});

test('normalizeLogicalCss leaves non-logical css alone', () => {
  const html = `<div style="padding: 10px;color:red">x</div>`;
  assert.equal(normalizeLogicalCss(html), html);
});
