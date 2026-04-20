import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml, normalizeFonts } from '../src/core/render.js';

test('normalizeFonts remaps Paper-internal names', () => {
  const input = `fontFamily: "DMSans-9ptRegular_Regular"`;
  assert.equal(normalizeFonts(input), `fontFamily: "DM Sans"`);
});

test('normalizeFonts quotes CSS custom-property keys', () => {
  const input = `style={{--foo: 'bar'}}`;
  assert.match(normalizeFonts(input), /'--foo':/);
});

test('renderHtml produces a full document with one page', async () => {
  const layout = { paper: null, artW: 832, artH: 1178 };
  const html = await renderHtml({ jsxBodies: ['<div>hello</div>'], layout });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<div class="page"/);
  assert.match(html, /hello/);
  assert.match(html, /@page \{ size: 832px 1178px/);
});

test('renderHtml handles parenthesised JSX from get_jsx', async () => {
  const html = await renderHtml({
    jsxBodies: ['(<div>wrapped</div>)'],
    layout: { paper: null, artW: 100, artH: 100 },
  });
  assert.match(html, /wrapped/);
});

test('renderHtml includes extras', async () => {
  const html = await renderHtml({
    jsxBodies: ['<p>p</p>'],
    layout: { paper: null, artW: 50, artH: 50 },
    extras: { headHtml: '<meta name="x" />', bodyHtml: '<!-- extra -->' },
  });
  assert.match(html, /<meta name="x" \/>/);
  assert.match(html, /<!-- extra -->/);
});
