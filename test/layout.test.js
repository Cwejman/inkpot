import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePageSize, forPdf, forLoad, PLACEMENT_GAP } from '../src/core/layout.js';

test('resolvePageSize is case-insensitive', () => {
  assert.equal(resolvePageSize('a4').name, 'A4');
  assert.equal(resolvePageSize('Letter').name, 'LETTER');
  assert.equal(resolvePageSize(null), null);
});

test('resolvePageSize throws on unknown', () => {
  assert.throws(() => resolvePageSize('B5'), /Unknown --page-size/);
});

test('forPdf: no paper → matches artboard', () => {
  const frames = [{ width: 832, height: 1178 }, { width: 800, height: 1000 }];
  const layout = forPdf({}, frames);
  assert.equal(layout.paper, null);
  assert.equal(layout.artW, 832);
  assert.equal(layout.artH, 1178);
});

test('forPdf: with paper returns margin/bleed', () => {
  const frames = [{ width: 832, height: 1178 }];
  const layout = forPdf({ pageSize: 'A4', margin: 5, bleed: 3 }, frames);
  assert.equal(layout.paper.name, 'A4');
  assert.equal(layout.marginMm, 5);
  assert.equal(layout.bleedMm, 3);
});

test('forLoad: empty canvas → origin (0,0), vertical stack', () => {
  const bundle = {
    artboards: [
      { n: 1, w: 832, h: 1178, jsx: 'a' },
      { n: 2, w: 832, h: 1178, jsx: 'b' },
    ],
  };
  const placed = forLoad([], bundle, 'hero');
  assert.equal(placed.length, 2);
  assert.equal(placed[0].name, 'hero/1');
  assert.equal(placed[0].left, 0);
  assert.equal(placed[0].top, 0);
  assert.equal(placed[1].top, 1178 + PLACEMENT_GAP);
});

test('forLoad: new column to the right of existing bbox, top-aligned', () => {
  const existing = [
    { left: 100, top: 50, width: 200, height: 300 },
    { left: 500, top: 100, width: 200, height: 400 },
  ];
  // bbox: minL=100, minT=50, maxR=700, maxB=500 → origin (700+GAP, 50)
  const bundle = { artboards: [{ n: 1, w: 832, h: 1178, jsx: 'x' }] };
  const placed = forLoad(existing, bundle, 'vp');
  assert.equal(placed[0].left, 700 + PLACEMENT_GAP);
  assert.equal(placed[0].top, 50);
});

test('forLoad: names use prefix', () => {
  const bundle = { artboards: [{ n: 7, w: 10, h: 10, jsx: 'x' }] };
  const placed = forLoad([], bundle, 'myname');
  assert.equal(placed[0].name, 'myname/7');
});
