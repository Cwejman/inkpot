// `inkpot form <arg>` — artboards → fillable PDF with AcroForm text fields.

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import * as paper from '../io/paper.js';
import * as chrome from '../io/chrome.js';
import * as files from '../io/files.js';
import * as net from '../io/net.js';
import { byNameIdOrPrefix } from '../core/resolve.js';
import * as layout from '../core/layout.js';
import { renderHtml } from '../core/render.js';
import { blooms, photos } from '../core/optimize.js';
import { replaceAll } from '../core/jsx.js';
import { PAPER_URL_RE } from '../core/format.js';
import { injectMarkers, overlayFields, bakeFields, PRINT_HIDE_CSS, MEASURE_SCRIPT } from '../core/fields.js';

const HELP = `Usage: inkpot form [options] <arg>

<arg> resolves as artboard name, node id, or prefix. Any text node whose
layer name matches {field:<key>} becomes an AcroForm text field.

Options:
  -o, --output <path>   PDF output path (default: <arg>.pdf)
  -n, --name <name>     Override output filename stem
  --flatten             Bake field values into static text (no AcroForm)
  --mcp-url <url>       MCP endpoint (default: ${paper.DEFAULT_MCP_URL})
  --chrome <path>       Chrome binary path
  -h, --help            Show this help`;

function parseFlags(argv) {
  return parseArgs({
    args: argv,
    options: {
      output: { type: 'string', short: 'o' },
      name: { type: 'string', short: 'n' },
      flatten: { type: 'boolean', default: false },
      'mcp-url': { type: 'string', default: paper.DEFAULT_MCP_URL },
      chrome: { type: 'string' },
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

  const arg = positionals[0];
  if (!arg) { console.error(HELP); process.exit(1); }

  const client = await paper.connect(values['mcp-url']);
  console.log('connected to Paper MCP');

  const artboards = await paper.getArtboards(client);
  const frames = byNameIdOrPrefix(artboards, arg);
  console.log(`found ${frames.length} frame${frames.length === 1 ? '' : 's'}: ${frames.map(f => f.name).join(', ')}`);

  console.log('scanning for {field:*} nodes...');
  const fields = await paper.collectFields(client, frames);
  if (fields.length === 0) {
    await paper.close(client);
    throw new Error(`no {field:*} text nodes found in ${frames.map(f => f.name).join(', ')}`);
  }
  console.log(`  found ${fields.length} field${fields.length === 1 ? '' : 's'}:`);
  for (const f of fields) {
    console.log(`    ${f.key.padEnd(32)} "${f.textContent}" (${f.width}×${f.height}, ${f.fontSize}px)`);
  }

  const jsxBodies = await paper.getJsxBodies(client, frames);
  await paper.close(client);
  console.log('disconnected from Paper MCP');

  const markedBodies = jsxBodies.map((jsx, i) => {
    const frameFields = fields.filter(f => f.frameIdx === i);
    const { jsx: out, warnings } = injectMarkers(jsx, frameFields);
    for (const w of warnings) console.warn(`  ! ${frames[i].name}: ${w}`);
    return out;
  });

  const pageLayout = layout.forPdf({}, frames);
  let html = await renderHtml({
    jsxBodies: markedBodies,
    layout: pageLayout,
    extras: { headHtml: PRINT_HIDE_CSS, bodyHtml: MEASURE_SCRIPT },
  });

  html = (await blooms(html)).html;
  const urls = [...new Set([...html.matchAll(PAPER_URL_RE)].map(m => m[0]))];
  if (urls.length) {
    const fetched = await net.fetchAll(urls);
    const mapping = {};
    for (const r of fetched) {
      if (r.error) continue;
      const mime = r.contentType?.split(';')[0].trim() ?? 'application/octet-stream';
      mapping[r.url] = `data:${mime};base64,${r.bytes.toString('base64')}`;
    }
    html = replaceAll(html, mapping);
  }
  html = (await photos(html)).html;

  const chromeBin = chrome.findChrome(values.chrome);
  console.log('measuring field positions...');
  const bboxes = chrome.measureBboxes({ chrome: chromeBin, html });
  console.log(`  measured ${Object.keys(bboxes).length} bbox${Object.keys(bboxes).length === 1 ? '' : 'es'}`);

  console.log('printing to PDF...');
  const basePdf = chrome.printPdf({ chrome: chromeBin, html });

  const defaultStem = values.name ?? arg.replace(/[\/\s·]/g, '_');
  const outputPdf = resolve(values.output ?? `${defaultStem}.pdf`);

  console.log(values.flatten ? 'baking field text (flatten)...' : 'overlaying AcroForm fields...');
  const overlayFn = values.flatten ? bakeFields : overlayFields;
  const { bytes, placed, missing } = await overlayFn({ pdfBytes: basePdf, fields, bboxes });
  await files.writeBytes(outputPdf, bytes);

  console.log(`placed ${placed}/${fields.length} fields${values.flatten ? ' (flattened)' : ''}${missing.length ? ` — missing: ${missing.join(', ')}` : ''}`);
  console.log(`done: ${outputPdf}`);
}
