// Layout — pure geometry.
//
// Two responsibilities:
//   forPdf(flags, frames) → page shell spec for the PDF pipeline
//   forLoad(artboards, bundle, prefix) → artboard specs with positions

// ───────── PDF ─────────

// Paper sizes in millimetres, portrait.
export const PAGE_SIZES = {
  A4:     { width: 210, height: 297 },
  A5:     { width: 148, height: 210 },
  LETTER: { width: 216, height: 279 },
};

const PX_PER_MM = 96 / 25.4;

export function resolvePageSize(name) {
  if (!name) return null;
  const key = name.toUpperCase();
  if (!PAGE_SIZES[key]) {
    throw new Error(`Unknown --page-size "${name}". Supported: ${Object.keys(PAGE_SIZES).join(', ')}`);
  }
  return { ...PAGE_SIZES[key], name: key };
}

// Build the page CSS + whether pages need an inner scaling wrapper.
// `paper` null → page matches artboard pixels, no scaling.
// `paper` set → artboard scaled uniformly to fit paper (minus margins/bleed).
const BASE_CSS = `
  html, body { margin: 0; padding: 0; background: #FAFAFA; font-optical-sizing: auto; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }`;

export function buildPageShell({ paper, bleedMm = 0, marginMm = 0, artW, artH }) {
  if (!paper) {
    return {
      css: `${BASE_CSS}
  @page { size: ${artW}px ${artH}px; margin: 0; }
  .page { width: ${artW}px; height: ${artH}px; overflow: hidden; position: relative; }`,
      wrapsInner: false,
    };
  }
  const totalW = paper.width + 2 * bleedMm;
  const totalH = paper.height + 2 * bleedMm;
  const innerWpx = (totalW - 2 * marginMm) * PX_PER_MM;
  const innerHpx = (totalH - 2 * marginMm) * PX_PER_MM;
  const scale = Math.min(innerWpx / artW, innerHpx / artH);
  const offX = marginMm * PX_PER_MM + (innerWpx - artW * scale) / 2;
  const offY = marginMm * PX_PER_MM + (innerHpx - artH * scale) / 2;
  return {
    css: `${BASE_CSS}
  @page { size: ${totalW}mm ${totalH}mm; margin: 0; }
  .page { width: ${totalW}mm; height: ${totalH}mm; overflow: hidden; position: relative; background: #FAFAFA; }
  .page-inner { position: absolute; left: ${offX}px; top: ${offY}px; width: ${artW}px; height: ${artH}px; zoom: ${scale}; }`,
    wrapsInner: true,
  };
}

// Combine CLI flags + frames into a concrete pdf layout.
export function forPdf(flags, frames) {
  const artW = Math.max(...frames.map(f => f.width));
  const artH = Math.max(...frames.map(f => f.height));
  const paper = resolvePageSize(flags.pageSize);
  if (!paper) return { paper: null, artW, artH };

  const bleedMm = flags.bleed ?? 0;
  if (Number.isNaN(bleedMm) || bleedMm < 0) throw new Error(`Invalid --bleed value: ${flags.bleed}`);
  const marginMm = flags.margin ?? 0;
  if (Number.isNaN(marginMm) || marginMm < 0) throw new Error(`Invalid --margin value: ${flags.margin}`);
  return { paper, bleedMm, marginMm, artW, artH };
}

// ───────── LOAD PLACEMENT ─────────

export const PLACEMENT_GAP = 64;

// Existing artboards' bounding box. Returns null when canvas is empty.
function boundingBox(artboards) {
  if (!artboards.length) return null;
  let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
  for (const ab of artboards) {
    const l = ab.left ?? 0;
    const t = ab.top ?? 0;
    minL = Math.min(minL, l);
    minT = Math.min(minT, t);
    maxR = Math.max(maxR, l + (ab.width ?? 0));
    maxB = Math.max(maxB, t + (ab.height ?? 0));
  }
  return { minL, minT, maxR, maxB };
}

// Place bundle artboards vertically as a new column to the right of existing
// content, top-aligned. Empty canvas → origin (0, 0). gap=PLACEMENT_GAP.
// Returns [{ name, left, top, width, height, jsx }].
export function forLoad(existingArtboards, bundle, prefix) {
  const bbox = boundingBox(existingArtboards);
  const originX = bbox ? bbox.maxR + PLACEMENT_GAP : 0;
  const originY = bbox ? bbox.minT : 0;

  let y = originY;
  return bundle.artboards.map(a => {
    const spec = {
      name: `${prefix}/${a.n}`,
      left: originX,
      top: y,
      width: a.w,
      height: a.h,
      jsx: a.jsx,
    };
    y += a.h + PLACEMENT_GAP;
    return spec;
  });
}
