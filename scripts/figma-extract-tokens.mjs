#!/usr/bin/env node
/**
 * figma-extract-tokens.mjs — walk a pulled Figma file.json and mine the *implicit*
 * design system (this file has no published Styles/Variables — everything is inline).
 *
 * Usage: node scripts/figma-extract-tokens.mjs [docs/design/<name>/file.json]
 * Writes: <dir>/extracted-tokens.json  and prints a ranked summary.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const inPath = path.resolve(process.argv[2] || 'docs/design/Untitled/file.json');
const outPath = path.join(path.dirname(inPath), 'extracted-tokens.json');
const doc = JSON.parse(readFileSync(inPath, 'utf8'));

const hex = (c) => {
  if (!c) return null;
  const h = (n) => Math.round((n ?? 0) * 255).toString(16).padStart(2, '0');
  const a = c.a ?? 1;
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${a < 1 ? h(a) : ''}`.toUpperCase();
};
const bump = (map, key, ctx) => {
  if (key == null) return;
  const e = map.get(key) || { count: 0, samples: new Set() };
  e.count++;
  if (ctx && e.samples.size < 6) e.samples.add(ctx);
  map.set(key, e);
};
const dump = (map, extra = (k) => ({})) =>
  [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([k, v]) => ({ value: k, count: v.count, samples: [...v.samples], ...extra(k) }));

const fills = new Map();
const strokes = new Map();
const gradients = new Map();
const texts = new Map();
const radii = new Map();
const shadows = new Map();
const spacing = new Map();
const padding = new Map();
const frameSizes = [];
let nodeCount = 0;

function walk(node, screen) {
  nodeCount++;
  const here = node.type === 'FRAME' && /^[0-9]+:[0-9]+$/.test(node.id || '') ? node.name : screen;

  if (Array.isArray(node.fills)) {
    for (const f of node.fills) {
      if (f.visible === false) continue;
      if (f.type === 'SOLID') bump(fills, hex({ ...f.color, a: f.opacity ?? f.color?.a ?? 1 }), `${screen}/${node.name}:${node.type}`);
      else if (f.type?.startsWith('GRADIENT')) {
        const stops = (f.gradientStops || []).map((s) => hex(s.color)).join(' → ');
        bump(gradients, `${f.type} ${stops}`, `${screen}/${node.name}`);
      }
    }
  }
  if (Array.isArray(node.strokes)) {
    for (const s of node.strokes) if (s.type === 'SOLID') bump(strokes, hex(s.color), `${screen}/${node.name} w${node.strokeWeight ?? '?'}`);
  }
  if (node.style && node.type === 'TEXT') {
    const s = node.style;
    const key = JSON.stringify({
      family: s.fontFamily,
      weight: s.fontWeight,
      size: s.fontSize,
      lineHeight: s.lineHeightPx ? Math.round(s.lineHeightPx) : s.lineHeightPercent,
      letter: s.letterSpacing ? +s.letterSpacing.toFixed(2) : 0,
      case: s.textCase || 'ORIGINAL',
    });
    bump(texts, key, `${screen}/${(node.characters || '').slice(0, 24)}`);
  }
  if (typeof node.cornerRadius === 'number') bump(radii, node.cornerRadius, `${screen}/${node.name}`);
  if (Array.isArray(node.rectangleCornerRadii)) bump(radii, node.rectangleCornerRadii.join(','), `${screen}/${node.name}`);
  if (Array.isArray(node.effects)) {
    for (const e of node.effects) {
      if (e.visible === false) continue;
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        bump(shadows, `${e.type} x${e.offset?.x ?? 0} y${e.offset?.y ?? 0} blur${e.radius ?? 0} spread${e.spread ?? 0} ${hex(e.color)}`, `${screen}/${node.name}`);
      }
    }
  }
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    if (typeof node.itemSpacing === 'number') bump(spacing, node.itemSpacing, `${screen}/${node.name}`);
    for (const p of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'])
      if (typeof node[p] === 'number') bump(padding, node[p], `${screen}/${node.name}.${p}`);
  }
  if (here && node.type === 'FRAME' && node.absoluteBoundingBox && screen === undefined) {
    frameSizes.push({ name: node.name, w: Math.round(node.absoluteBoundingBox.width), h: Math.round(node.absoluteBoundingBox.height) });
  }

  for (const child of node.children || []) walk(child, here ?? screen);
}

for (const page of doc.document.children || []) for (const frame of page.children || []) walk(frame, undefined);

const out = {
  source: path.basename(inPath),
  fileName: doc.name,
  lastModified: doc.lastModified,
  nodeCount,
  frameSizes,
  colors: dump(fills),
  strokeColors: dump(strokes),
  gradients: dump(gradients),
  textStyles: dump(texts).map((t) => ({ ...t, value: JSON.parse(t.value) })),
  cornerRadii: dump(radii),
  shadows: dump(shadows),
  spacingScale: dump(spacing).sort((a, b) => +a.value - +b.value),
  paddingValues: dump(padding).sort((a, b) => +a.value - +b.value),
};
writeFileSync(outPath, JSON.stringify(out, null, 2));

const top = (arr, n = 15) => arr.slice(0, n).map((x) => `  ${String(x.count).padStart(4)}  ${typeof x.value === 'object' ? JSON.stringify(x.value) : x.value}`).join('\n');
console.log(`nodes: ${nodeCount}  frames: ${frameSizes.length}`);
console.log(`frame sizes: ${[...new Set(frameSizes.map((f) => `${f.w}x${f.h}`))].join(', ')}`);
console.log(`\nCOLORS (${out.colors.length} unique):\n${top(out.colors, 20)}`);
console.log(`\nSTROKES (${out.strokeColors.length}):\n${top(out.strokeColors, 8)}`);
console.log(`\nGRADIENTS (${out.gradients.length}):\n${top(out.gradients, 8)}`);
console.log(`\nTEXT STYLES (${out.textStyles.length}):\n${top(out.textStyles, 20)}`);
console.log(`\nCORNER RADII:\n${top(out.cornerRadii, 12)}`);
console.log(`\nSHADOWS (${out.shadows.length}):\n${top(out.shadows, 10)}`);
console.log(`\nSPACING (itemSpacing):\n${top(out.spacingScale, 20)}`);
console.log(`\nPADDING:\n${top(out.paddingValues, 20)}`);
console.log(`\n→ ${path.relative(process.cwd(), outPath)}`);
