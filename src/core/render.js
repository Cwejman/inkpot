// JSX bodies → full HTML document (pre-optimization).
//
// In-process React SSR via esbuild.transform (no subprocess, no temp files).
// Pure given React + esbuild workers (deterministic transformation).

import * as esbuild from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildPageShell } from './layout.js';

// Google Fonts — the stylesheet imported at @page print time.
export const FONT_LINKS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=EB+Garamond:ital,wght@1,400&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">`;

// Map Paper's internal font names → web-safe equivalents Chrome can print.
export function normalizeFonts(jsx) {
  jsx = jsx.replace(
    /Paper Mono Preview, ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace/g,
    '"JetBrains Mono", monospace'
  );
  jsx = jsx.replace(/Paper Mono Preview, ui-monospace, monospace/g, '"JetBrains Mono", monospace');
  jsx = jsx.replace(/Paper Mono Preview/g, '"JetBrains Mono"');
  jsx = jsx.replace(/Paper Mono \(Preview\)/g, '"JetBrains Mono"');

  jsx = jsx.replace(/"Inter Tight"/g, '"DM Sans"');
  jsx = jsx.replace(/'Inter Tight'/g, "'DM Sans'");
  jsx = jsx.replace(/\\"Inter Tight\\"/g, '\\"DM Sans\\"');

  jsx = jsx.replace(/"DMSans-[^"]+"/g, '"DM Sans"');

  jsx = jsx.replace(
    /ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace/g,
    '"JetBrains Mono", monospace'
  );

  // Quote CSS custom-property keys: `{ --foo: 'x' }` → `{ '--foo': 'x' }`
  jsx = jsx.replace(/([{,]\s*)(--[a-zA-Z0-9-]+)(\s*:)/g, "$1'$2'$3");

  // Collapse literal newlines inside single-quoted strings
  jsx = jsx.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/gs, (m, s) =>
    "'" + s.replace(/\s*\n\s*/g, ' ').trim() + "'"
  );

  return jsx;
}

// Strip the outer ( ... ) that get_jsx wraps around bodies.
function unwrap(jsx) {
  const t = jsx.trim();
  return t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1).trim() : t;
}

// Transform one JSX body to a rendered HTML string.
export async function renderBody(rawJsx) {
  const body = normalizeFonts(unwrap(rawJsx));
  const source = `(React) => (${body})`;
  const { code } = await esbuild.transform(source, { loader: 'jsx' });
  // esbuild returns an expression statement; wrap so `new Function` can return it.
  const trimmed = code.trim().replace(/;+$/, '');
  const factory = new Function('React', `return (${trimmed});`);
  const elementFn = factory(React);
  const element = elementFn(React);
  return renderToStaticMarkup(element);
}

// Full HTML document: jsx bodies + layout + optional head/body extras (for form's measure/hide).
export async function renderHtml({ jsxBodies, layout, extras = {} }) {
  const { css, wrapsInner } = buildPageShell({
    paper: layout.paper,
    bleedMm: layout.bleedMm,
    marginMm: layout.marginMm,
    artW: layout.artW,
    artH: layout.artH,
  });

  const bodies = await Promise.all(jsxBodies.map(renderBody));

  const pagesHtml = bodies.map((b, i) => {
    const brk = i === 0 ? 'auto' : 'always';
    const inner = wrapsInner ? `<div class="page-inner">${b}</div>` : b;
    return `<div class="page" style="page-break-before: ${brk};">${inner}</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
${FONT_LINKS}
${extras.headHtml ?? ''}
<style>${css}
</style>
</head>
<body>
${pagesHtml}
${extras.bodyHtml ?? ''}
</body>
</html>`;
}
