// Form field rendering helpers.
//
// injectMarkers: JSX bodies + field list → JSX with data-field-key attrs
// overlayFields: PDF bytes + fields + bboxes → PDF bytes with AcroForm fields
// bakeFields:    PDF bytes + fields + bboxes → PDF bytes with static text (no form)
//
// Pure. PDF I/O via pdf-lib operates on bytes, not files.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const nodeRequire = createRequire(import.meta.url);
const DM_SANS_REGULAR_PATH = nodeRequire.resolve('@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff');
const DM_SANS_MEDIUM_PATH = nodeRequire.resolve('@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff');

const CSS_PX_TO_PT = 0.75;

export const FIELD_NAME_RE = /^\{field:(.+)\}$/;

// HTML/CSS that the form renderer injects alongside the JSX:
//   print-hide: fields' baked text hidden in print so AcroForm overlay shows
//   measure-script: write per-field bbox JSON into a sink element for dump-dom
export const PRINT_HIDE_CSS = `<style>
  @media print {
    [data-field-key] { visibility: hidden; }
  }
</style>`;

export const MEASURE_SCRIPT = `
<pre id="field-bboxes" style="display:none"></pre>
<script>
(function() {
  function measure() {
    var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
    var out = {};
    var nodes = document.querySelectorAll('[data-field-key]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-field-key');
      var page = el.closest('.page');
      var pageIdx = pages.indexOf(page);
      var pageRect = page.getBoundingClientRect();
      var r = el.getBoundingClientRect();
      out[key] = { page: pageIdx, x: r.left - pageRect.left, y: r.top - pageRect.top, w: r.width, h: r.height };
    }
    var sink = document.getElementById('field-bboxes');
    if (sink) sink.textContent = JSON.stringify(out);
  }
  if (document.readyState === 'complete') measure();
  else window.addEventListener('load', measure);
})();
</script>`;

// Inject data-field-key="..." onto the <div> wrapping each field's preview text.
// Matches by first unique occurrence of the preview text; collisions warn.
export function injectMarkers(jsx, fields) {
  const taken = new Set();
  const warnings = [];
  let out = jsx;

  for (const f of fields) {
    if (!f.textContent) { warnings.push(`field "${f.key}": empty preview text, skipping`); continue; }
    let searchFrom = 0;
    let foundStart = -1;
    while (searchFrom < out.length) {
      const idx = out.indexOf(f.textContent, searchFrom);
      if (idx === -1) break;
      const divStart = out.lastIndexOf('<div', idx);
      if (divStart === -1 || taken.has(divStart)) { searchFrom = idx + 1; continue; }
      foundStart = divStart;
      break;
    }
    if (foundStart === -1) { warnings.push(`field "${f.key}": text "${f.textContent}" not found`); continue; }
    taken.add(foundStart);
    out = out.slice(0, foundStart + 4) + ` data-field-key="${f.key}"` + out.slice(foundStart + 4);
  }

  return { jsx: out, warnings };
}

async function embedDmSans(doc) {
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(readFileSync(DM_SANS_REGULAR_PATH), { subset: true });
  const medium = await doc.embedFont(readFileSync(DM_SANS_MEDIUM_PATH), { subset: true });
  return { regular, medium };
}

function bboxToPdf(bbox, pageHeightPt) {
  const xPt = bbox.x * CSS_PX_TO_PT;
  const wPt = bbox.w * CSS_PX_TO_PT;
  const hPt = bbox.h * CSS_PX_TO_PT;
  const yPt = pageHeightPt - (bbox.y * CSS_PX_TO_PT) - hPt;
  return { xPt, yPt, wPt, hPt };
}

// Overlay editable AcroForm text fields.
export async function overlayFields({ pdfBytes, fields, bboxes }) {
  const doc = await PDFDocument.load(pdfBytes);
  const form = doc.getForm();
  const { regular, medium } = await embedDmSans(doc);
  const pages = doc.getPages();

  let placed = 0;
  const missing = [];
  for (const f of fields) {
    const bbox = bboxes[f.key];
    if (!bbox) { missing.push(f.key); continue; }
    const page = pages[bbox.page ?? 0];
    if (!page) { missing.push(`${f.key} (no page ${bbox.page})`); continue; }
    const { xPt, yPt, wPt, hPt } = bboxToPdf(bbox, page.getHeight());
    const pdfField = form.createTextField(f.key);
    if (f.textContent) pdfField.setText(f.textContent);
    pdfField.addToPage(page, {
      x: xPt, y: yPt, width: wPt, height: hPt,
      font: f.fontWeight >= 600 ? medium : regular,
      textColor: rgb(0.102, 0.09, 0.071),
      borderWidth: 0,
      backgroundColor: undefined,
    });
    pdfField.setFontSize(f.fontSize * CSS_PX_TO_PT);
    placed++;
  }
  const saved = await doc.save({ updateFieldAppearances: true });
  return { bytes: saved, placed, missing };
}

// Bake static field text into the page content stream — no AcroForm.
export async function bakeFields({ pdfBytes, fields, bboxes }) {
  const doc = await PDFDocument.load(pdfBytes);
  const { regular, medium } = await embedDmSans(doc);
  const pages = doc.getPages();
  const textColor = rgb(0.102, 0.09, 0.071);

  let placed = 0;
  const missing = [];
  for (const f of fields) {
    const bbox = bboxes[f.key];
    if (!bbox) { missing.push(f.key); continue; }
    const page = pages[bbox.page ?? 0];
    if (!page) { missing.push(`${f.key} (no page ${bbox.page})`); continue; }
    const text = f.textContent ?? '';
    if (!text) { placed++; continue; }

    const sizePt = f.fontSize * CSS_PX_TO_PT;
    const font = f.fontWeight >= 600 ? medium : regular;
    const pageHeightPt = page.getHeight();
    const halfLeadingPx = (bbox.h - f.fontSize) / 2;
    const baselineFromTopPx = halfLeadingPx + f.fontSize * 0.8;
    const yBaselinePt = pageHeightPt - (bbox.y + baselineFromTopPx) * CSS_PX_TO_PT;
    const xPt = bbox.x * CSS_PX_TO_PT;

    page.drawText(text, { x: xPt, y: yBaselinePt, size: sizePt, font, color: textColor });
    placed++;
  }
  const saved = await doc.save();
  return { bytes: saved, placed, missing };
}
