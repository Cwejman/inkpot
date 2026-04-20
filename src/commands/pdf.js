// `inkpot pdf <prefix>` — artboards → compact PDF.

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import * as paper from '../io/paper.js';
import * as chrome from '../io/chrome.js';
import * as files from '../io/files.js';
import * as net from '../io/net.js';
import { byPrefix } from '../core/resolve.js';
import * as layout from '../core/layout.js';
import { renderHtml } from '../core/render.js';
import { blooms, photos, formatBytes } from '../core/optimize.js';
import { replaceAll } from '../core/jsx.js';
import { PAPER_URL_RE } from '../core/format.js';

const HELP = `Usage: inkpot pdf [options] <prefix>

Render artboards named <prefix>/1, <prefix>/2, ... as an optimised PDF.

Options:
  -o, --output <path>           PDF output path (default: <prefix>.pdf)
  -n, --name <name>             Override output filename stem
  --page-size <A4|A5|Letter>    Fit artboards to paper with uniform scaling
  --margin <mm>                 Inset from paper edge (default 0)
  --bleed <mm>                  Outset for print handoff (default 0)
  --mcp-url <url>               MCP endpoint (default: ${paper.DEFAULT_MCP_URL})
  --chrome <path>               Chrome binary path
  -h, --help                    Show this help`;

function parseFlags(argv) {
  return parseArgs({
    args: argv,
    options: {
      output: { type: 'string', short: 'o' },
      name: { type: 'string', short: 'n' },
      'page-size': { type: 'string' },
      margin: { type: 'string' },
      bleed: { type: 'string' },
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

  const client = await paper.connect(values['mcp-url']);
  console.log('connected to Paper MCP');

  const artboards = await paper.getArtboards(client);

  const prefix = positionals[0];
  if (!prefix) { await paper.close(client); console.error(HELP); process.exit(1); }

  const frames = byPrefix(artboards, prefix);
  console.log(`found ${frames.length} frames: ${frames.map(f => f.name).join(', ')}`);

  const pageLayout = layout.forPdf({
    pageSize: values['page-size'],
    margin: values.margin !== undefined ? parseFloat(values.margin) : 0,
    bleed: values.bleed !== undefined ? parseFloat(values.bleed) : 0,
  }, frames);

  if (pageLayout.paper) {
    const { paper: p, bleedMm, artW, artH } = pageLayout;
    const tw = p.width + 2 * bleedMm;
    const th = p.height + 2 * bleedMm;
    console.log(`page size: ${p.name} ${tw}×${th}mm${bleedMm ? ` (incl. ${bleedMm}mm bleed)` : ''}, artboard ${artW}×${artH}px`);
  }

  const jsxBodies = await paper.getJsxBodies(client, frames);
  await paper.close(client);
  console.log('disconnected from Paper MCP');

  let html = await renderHtml({ jsxBodies, layout: pageLayout });

  console.log('collapsing blooms to shared images...');
  const bloomPass = await blooms(html);
  html = bloomPass.html;
  console.log(`  ${bloomPass.summary.replaced} gradient instances → ${bloomPass.summary.unique} unique PNG XObject${bloomPass.summary.unique === 1 ? '' : 's'}`);

  console.log('embedding remote assets...');
  const urls = [...new Set([...html.matchAll(PAPER_URL_RE)].map(m => m[0]))];
  if (urls.length) {
    const fetched = await net.fetchAll(urls);
    const mapping = {};
    let bytes = 0, embedded = 0;
    for (const r of fetched) {
      if (r.error) { console.warn(`  ${r.url} → ${r.error}, leaving as remote`); continue; }
      const mime = r.contentType?.split(';')[0].trim() ?? 'application/octet-stream';
      mapping[r.url] = `data:${mime};base64,${r.bytes.toString('base64')}`;
      bytes += r.bytes.length;
      embedded++;
    }
    html = replaceAll(html, mapping);
    console.log(`  ${embedded}/${urls.length} remote images embedded (${formatBytes(bytes)})`);
  }

  const photoPass = await photos(html);
  html = photoPass.html;
  const ps = photoPass.summary;
  if (ps.count) {
    const savings = ps.before - ps.after;
    const pct = ps.before ? Math.round((savings / ps.before) * 100) : 0;
    const classSummary = Object.entries(ps.classCounts || {}).map(([k, v]) => `${v} ${k}`).join(', ');
    console.log(`  ${ps.count} raster images: ${formatBytes(ps.before)} → ${formatBytes(ps.after)} (-${pct}%) [${classSummary}]`);
  }

  const defaultStem = values.name ?? prefix;
  const outputPdf = resolve(values.output ?? `${defaultStem}.pdf`);
  const chromeBin = chrome.findChrome(values.chrome);
  console.log('printing to PDF...');
  const pdfBytes = chrome.printPdf({ chrome: chromeBin, html });
  await files.writeBytes(outputPdf, pdfBytes);
  console.log(`done: ${outputPdf}`);
}
