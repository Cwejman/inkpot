// `inkpot list` — print all artboards on the canvas.

import { parseArgs } from 'node:util';
import * as paper from '../io/paper.js';

const HELP = `Usage: inkpot list [options]

Print every artboard on the current Paper canvas, sorted naturally by name.

Options:
  --mcp-url <url>   MCP endpoint (default: ${paper.DEFAULT_MCP_URL})
  -h, --help        Show this help`;

function parseFlags(argv) {
  return parseArgs({
    args: argv,
    options: {
      'mcp-url': { type: 'string', default: paper.DEFAULT_MCP_URL },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
}

export async function run(argv) {
  let values;
  try { ({ values } = parseFlags(argv)); }
  catch (err) { console.error(err.message); console.error(HELP); process.exit(1); }

  if (values.help) { console.log(HELP); return; }

  const client = await paper.connect(values['mcp-url']);
  const artboards = await paper.getArtboards(client);
  await paper.close(client);

  console.log(`${artboards.length} artboards:\n`);
  const sorted = [...artboards].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const ab of sorted) console.log(`  ${ab.name.padEnd(30)} ${ab.width}×${ab.height}  [${ab.id}]`);
}
