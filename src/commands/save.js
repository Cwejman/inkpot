// `inkpot save <prefix>` — pack artboards into a .inkpot bundle.

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import * as paper from '../io/paper.js';
import * as net from '../io/net.js';
import * as files from '../io/files.js';
import { byPrefixContiguous } from '../core/resolve.js';
import { pack } from '../core/bundle.js';
import { replaceAll } from '../core/jsx.js';
import {
  PAPER_URL_RE, assetHash, extFromContentType, extFromUrl,
} from '../core/format.js';

const HELP = `Usage: inkpot save [options] <prefix>

Pack artboards named <prefix>/1, <prefix>/2, ... into a .inkpot bundle.

Options:
  -o, --output <path>   Bundle output path (default: <prefix>.inkpot)
  -n, --name <name>     Override output prefix (= -o <name>.inkpot)
  --list                Print what would be packed; don't write
  --mcp-url <url>       MCP endpoint (default: ${paper.DEFAULT_MCP_URL})
  -h, --help            Show this help`;

function parseFlags(argv) {
  return parseArgs({
    args: argv,
    options: {
      output: { type: 'string', short: 'o' },
      name: { type: 'string', short: 'n' },
      list: { type: 'boolean', default: false },
      'mcp-url': { type: 'string', default: paper.DEFAULT_MCP_URL },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
}

export async function run(argv) {
  let values, positionals;
  try { ({ values, positionals } = parseFlags(argv)); }
  catch (err) { console.error(err.message); console.error(HELP); process.exit(1); }

  if (values.help) { console.log(HELP); return; }

  const prefix = positionals[0];
  if (!prefix) { console.error(HELP); process.exit(1); }

  const client = await paper.connect(values['mcp-url']);
  console.log('connected to Paper MCP');

  const artboards = await paper.getArtboards(client);
  const frames = byPrefixContiguous(artboards, prefix);
  console.log(`found ${frames.length} frame${frames.length === 1 ? '' : 's'}: ${frames.map(f => f.name).join(', ')}`);

  const jsxBodies = await paper.getJsxBodies(client, frames);
  await paper.close(client);
  console.log('disconnected from Paper MCP');

  // Extract and fetch every unique Paper CDN URL referenced across all bodies.
  const urls = [...new Set(jsxBodies.flatMap(j => [...j.matchAll(PAPER_URL_RE)].map(m => m[0])))];
  let assets = [];
  let mapping = {};
  if (urls.length) {
    console.log(`fetching ${urls.length} asset${urls.length === 1 ? '' : 's'}...`);
    const fetched = await net.fetchAll(urls);
    const byHash = new Map();
    for (const r of fetched) {
      if (r.error) { console.warn(`  ${r.url} → ${r.error}, leaving URL verbatim`); continue; }
      const ext = extFromContentType(r.contentType) ?? extFromUrl(r.url);
      if (!ext) { console.warn(`  ${r.url} → unknown type, leaving URL verbatim`); continue; }
      const hash = assetHash(r.bytes);
      mapping[r.url] = `assets/${hash}.${ext}`;
      if (!byHash.has(hash)) byHash.set(hash, { hash, ext, bytes: r.bytes });
    }
    assets = [...byHash.values()];
    console.log(`  ${assets.length} unique asset${assets.length === 1 ? '' : 's'} (${Object.keys(mapping).length}/${urls.length} URLs mapped)`);
  }

  const rewritten = jsxBodies.map(b => replaceAll(b, mapping));

  if (values.list) {
    console.log('\nwould pack:');
    for (let i = 0; i < frames.length; i++) console.log(`  ${i + 1}.jsx  (${frames[i].width}×${frames[i].height})`);
    for (const a of assets) console.log(`  assets/${a.hash}.${a.ext}  (${a.bytes.length} bytes)`);
    return;
  }

  const buffer = pack({ frames, jsxBodies: rewritten, assets });

  const stem = values.name ?? prefix;
  const outputPath = resolve(values.output ?? `${stem}.inkpot`);
  await files.writeBytes(outputPath, buffer);
  console.log(`done: ${outputPath} (${buffer.length} bytes)`);
}
