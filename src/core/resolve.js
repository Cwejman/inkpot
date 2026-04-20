// Frame resolution — map an artboard list from Paper + a user arg
// to a sorted, validated list of frames.
//
// Pure. Throws Error on invalid inputs; orchestrators catch + print.
//
// Frame shape: { name, id, number, width, height }

const SEPARATORS = ['/', ' ']; // slash preferred; space kept for legacy Paper files

// Parse "<prefix><sep><n>" → number, or null if it doesn't match this prefix.
function numberOf(name, prefix) {
  for (const sep of SEPARATORS) {
    if (!name.startsWith(prefix + sep)) continue;
    const numStr = name.slice(prefix.length + sep.length);
    const num = parseInt(numStr, 10);
    if (!Number.isNaN(num) && String(num) === numStr.trim()) return num;
  }
  return null;
}

function toFrame(ab, number) {
  return {
    name: ab.name,
    id: ab.id,
    number,
    width: ab.width,
    height: ab.height,
  };
}

// All artboards matching "<prefix>/<n>" sorted by n ascending.
export function byPrefix(artboards, prefix) {
  const matches = [];
  for (const ab of artboards) {
    const n = numberOf(ab.name, prefix);
    if (n !== null) matches.push(toFrame(ab, n));
  }
  if (matches.length === 0) {
    const names = artboards.map(a => a.name).sort().join(', ');
    throw new Error(`No artboards matching "${prefix}/*". Available: ${names}`);
  }
  matches.sort((a, b) => a.number - b.number);
  return matches;
}

// Same as byPrefix, but asserts numbers form a contiguous run 1..N.
export function byPrefixContiguous(artboards, prefix) {
  const frames = byPrefix(artboards, prefix);
  const gaps = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].number !== i + 1) gaps.push(i + 1);
  }
  if (gaps.length) {
    const got = frames.map(f => f.number).join(', ');
    throw new Error(
      `Artboards "${prefix}/*" must be numbered contiguously from 1. Got: ${got}. Expected 1..${frames.length}.`
    );
  }
  return frames;
}

// For `form`: try exact name, then exact id, then fall back to prefix.
export function byNameIdOrPrefix(artboards, arg) {
  const byName = artboards.find(a => a.name === arg);
  if (byName) return [toFrame(byName, 1)];
  const byId = artboards.find(a => a.id === arg);
  if (byId) return [toFrame(byId, 1)];
  return byPrefix(artboards, arg);
}

// For `load`: refuse if any <prefix>/<n> for n ∈ bundle already exists.
export function assertNoCollision(artboards, prefix, bundleNumbers) {
  const colliding = [];
  for (const ab of artboards) {
    const n = numberOf(ab.name, prefix);
    if (n !== null && bundleNumbers.includes(n)) colliding.push(ab.name);
  }
  if (colliding.length) {
    throw new Error(
      `Cannot load: ${colliding.length} artboard(s) named "${prefix}/*" already exist in Paper.\n` +
      `Colliding: ${colliding.join(', ')}\n` +
      `Rerun with \`-n <name>\` to import under a different prefix.`
    );
  }
}
