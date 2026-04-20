// Headless Chrome — print HTML to PDF, dump the DOM.

import { execFileSync } from 'node:child_process';
import { accessSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
];

export function findChrome(override) {
  if (override) {
    try { accessSync(override); return override; } catch {
      throw new Error(`Chrome not found at ${override}`);
    }
  }
  for (const p of DEFAULT_CHROME_PATHS) {
    try { accessSync(p); return p; } catch { /* continue */ }
  }
  throw new Error('Chrome not found. Use --chrome <path> to specify.');
}

// Write HTML to a temp file, invoke Chrome, return PDF bytes.
// Uses a temp file because Chrome only accepts file:// URLs for print-to-pdf.
export function printPdf({ chrome, html }) {
  const htmlPath = join(tmpdir(), `inkpot-${process.pid}-${Date.now()}.html`);
  const pdfPath = join(tmpdir(), `inkpot-${process.pid}-${Date.now()}.pdf`);
  writeFileSync(htmlPath, html);
  try {
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--virtual-time-budget=15000',
      `--print-to-pdf=${pdfPath}`,
      '--print-to-pdf-no-header',
      `file://${htmlPath}`,
    ], { stdio: 'pipe' });
    return readFileSync(pdfPath);
  } finally {
    try { unlinkSync(htmlPath); } catch {}
    try { unlinkSync(pdfPath); } catch {}
  }
}

// Render HTML with a measurement script and extract the JSON sink it writes.
// Used by `form` to capture per-field bboxes in page-relative CSS px.
export function measureBboxes({ chrome, html }) {
  const htmlPath = join(tmpdir(), `inkpot-measure-${process.pid}-${Date.now()}.html`);
  writeFileSync(htmlPath, html);
  try {
    const dom = execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--virtual-time-budget=8000',
      '--window-size=832,2000',
      '--dump-dom',
      `file://${htmlPath}`,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
    const m = dom.match(/<pre id="field-bboxes"[^>]*>([\s\S]*?)<\/pre>/);
    if (!m) throw new Error('field-bboxes sink not found in dumped DOM');
    const payload = m[1].trim();
    if (!payload) throw new Error('field-bboxes is empty — no data-field-key elements rendered');
    const decoded = payload
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return JSON.parse(decoded);
  } finally {
    try { unlinkSync(htmlPath); } catch {}
  }
}
