// Filesystem — read/write bytes. Thin node:fs wrappers.

import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

export async function readBytes(path) {
  return await readFile(path);
}

export async function writeBytes(path, bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : Buffer.from(bytes);
  await writeFile(path, buf);
}

// The prefix embedded in an .inkpot file's name.
export function prefixFromPath(path) {
  const base = basename(path);
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}
