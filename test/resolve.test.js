import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  byPrefix, byPrefixContiguous, byNameIdOrPrefix, assertNoCollision,
} from '../src/core/resolve.js';

const ab = (name, id = name + '-id', width = 832, height = 1178) => ({ name, id, width, height });

test('byPrefix sorts numerically, not lexically', () => {
  const artboards = [ab('vp/10'), ab('vp/2'), ab('vp/1'), ab('other/1')];
  const frames = byPrefix(artboards, 'vp');
  assert.deepEqual(frames.map(f => f.number), [1, 2, 10]);
});

test('byPrefix accepts legacy space separator', () => {
  const artboards = [ab('WW 2'), ab('WW 1')];
  const frames = byPrefix(artboards, 'WW');
  assert.equal(frames.length, 2);
  assert.deepEqual(frames.map(f => f.number), [1, 2]);
});

test('byPrefix throws when no matches', () => {
  assert.throws(() => byPrefix([ab('other/1')], 'vp'), /No artboards matching "vp\/\*"/);
});

test('byPrefix ignores non-numeric suffixes', () => {
  const artboards = [ab('vp/1'), ab('vp/abc'), ab('vp/2')];
  const frames = byPrefix(artboards, 'vp');
  assert.deepEqual(frames.map(f => f.number), [1, 2]);
});

test('byPrefixContiguous accepts 1..N', () => {
  const artboards = [ab('vp/1'), ab('vp/2'), ab('vp/3')];
  assert.equal(byPrefixContiguous(artboards, 'vp').length, 3);
});

test('byPrefixContiguous rejects gaps', () => {
  const artboards = [ab('vp/1'), ab('vp/3')];
  assert.throws(() => byPrefixContiguous(artboards, 'vp'), /contiguously from 1/);
});

test('byPrefixContiguous rejects non-start', () => {
  const artboards = [ab('vp/2'), ab('vp/3')];
  assert.throws(() => byPrefixContiguous(artboards, 'vp'), /contiguously from 1/);
});

test('byNameIdOrPrefix: exact name wins', () => {
  const artboards = [ab('hero'), ab('hero/1'), ab('hero/2')];
  const frames = byNameIdOrPrefix(artboards, 'hero');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].name, 'hero');
});

test('byNameIdOrPrefix: falls back to id then prefix', () => {
  const artboards = [ab('hero/1'), ab('hero/2')];
  assert.equal(byNameIdOrPrefix(artboards, 'hero/1-id')[0].name, 'hero/1');
  assert.equal(byNameIdOrPrefix(artboards, 'hero').length, 2);
});

test('assertNoCollision throws on overlap', () => {
  const artboards = [ab('vp/1'), ab('vp/3')];
  assert.throws(() => assertNoCollision(artboards, 'vp', [1, 2, 3]), /already exist in Paper/);
});

test('assertNoCollision silent when no overlap', () => {
  const artboards = [ab('other/1')];
  assert.doesNotThrow(() => assertNoCollision(artboards, 'vp', [1, 2]));
});

test('assertNoCollision suggests -n flag', () => {
  const artboards = [ab('vp/1')];
  assert.throws(
    () => assertNoCollision(artboards, 'vp', [1]),
    /-n <name>/,
  );
});
