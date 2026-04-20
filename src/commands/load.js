// `inkpot load <path>` — unpack a .inkpot bundle into Paper.

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import * as paper from '../io/paper.js';
import * as files from '../io/files.js';
import { unpack } from '../core/bundle.js';
import { assertNoCollision } from '../core/resolve.js';
import { forLoad } from '../core/layout.js';
import { replaceAll, toDataUri } from '../core/jsx.js';
import { renderBody } from '../core/render.js';

const HELP = `Usage: inkpot load [options] <path>

Unpack a .inkpot bundle into Paper. The file's basename (minus .inkpot)
becomes the artboard prefix. Artboards are stacked vertically below the
existing canvas content.

Options:
  -n, --name <name>   Override import prefix (default: filename stem)
  --list              Print bundle contents; don't touch Paper
  --mcp-url <url>     MCP endpoint (default: ${paper.DEFAULT_MCP_URL})
  -h, --help          Show this help`;

function parseFlags(argv) {
  return parseArgs({
    args: argv,
    options: {
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

  const path = positionals[0];
  if (!path) { console.error(HELP); process.exit(1); }

  const buffer = await files.readBytes(resolve(path));
  const bundle = unpack(buffer);

  const prefix = values.name ?? files.prefixFromPath(path);

  if (values.list) {
    console.log(`bundle: ${path} → prefix "${prefix}"`);
    for (const a of bundle.artboards) console.log(`  ${prefix}/${a.n}  (${a.w}×${a.h})`);
    for (const a of bundle.assets) console.log(`  assets/${a.hash}.${a.ext}  (${a.bytes.length} bytes)`);
    return;
  }

  const client = await paper.connect(values['mcp-url']);
  console.log('connected to Paper MCP');

  const existing = await paper.getArtboards(client);
  assertNoCollision(existing, prefix, bundle.artboards.map(a => a.n));

  const assetMapping = Object.fromEntries(
    bundle.assets.map(a => [`assets/${a.hash}.${a.ext}`, toDataUri({ ext: a.ext, bytes: a.bytes })])
  );

  const placed = forLoad(existing, bundle, prefix);
  const positionUpdates = [];

  for (const spec of placed) {
    const jsxWithAssets = replaceAll(spec.jsx, assetMapping);
    const html = await renderBody(jsxWithAssets);
    console.log(`  creating ${spec.name}`);
    const nodeId = await paper.createArtboard(client, {
      name: spec.name,
      width: spec.width,
      height: spec.height,
      html,
    });
    positionUpdates.push({ nodeId, left: spec.left, top: spec.top });
  }

  console.log(`positioning ${positionUpdates.length} artboards vertically at (${placed[0]?.left}, ${placed[0]?.top})...`);
  await paper.setPositions(client, positionUpdates);

  await paper.close(client);
  console.log(`done: loaded ${placed.length} artboard${placed.length === 1 ? '' : 's'} as ${prefix}/1..${placed.length}`);
}
