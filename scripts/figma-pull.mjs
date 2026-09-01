#!/usr/bin/env node
/**
 * figma-pull.mjs — one-pass export of a Figma file into docs/design/ so the design
 * blueprint lives in the repo and we never have to re-fetch interactively.
 *
 * Usage:
 *   FIGMA_TOKEN=figd_xxx FIGMA_FILE_KEY=l027yH0ARNs9FFYcc3SJ3t node scripts/figma-pull.mjs
 *   node scripts/figma-pull.mjs --token figd_xxx --key l027yH0ARNs9FFYcc3SJ3t
 *   node scripts/figma-pull.mjs --key <key> --no-images       # skip PNG renders
 *
 * Requires Node >= 18 (native fetch). No dependencies.
 *
 * Output (docs/design/<file-name-or-key>/):
 *   file.json              full document tree (plugin_data=shared)
 *   meta.json             GET /files/:key/meta
 *   styles.json           published/used styles
 *   components.json        components + component_sets (merged)
 *   variables.local.json   Variables (Enterprise only; a NOTE file is written on 403)
 *   variables.published.json
 *   nodes/<page>.json      deep node dump per page
 *   renders/<id>.png       PNG @2x of every top-level frame
 *   manifest.json          pages -> frames index + counts + timestamp
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { argv, env, exit } from 'node:process';
import path from 'node:path';

const API = 'https://api.figma.com/v1';

function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : undefined;
}

const TOKEN = arg('token') || env.FIGMA_TOKEN;
const KEY = arg('key') || env.FIGMA_FILE_KEY;
const WITH_IMAGES = arg('no-images') ? false : true;

if (!TOKEN || !KEY) {
  console.error('Missing FIGMA_TOKEN and/or FIGMA_FILE_KEY (or --token / --key).');
  exit(1);
}

const headers = { 'X-Figma-Token': TOKEN };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(endpoint, { raw = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}${endpoint}`, { headers });
    if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (raw) return res;
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }
  throw new Error(`Too many retries for ${endpoint}`);
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  console.log(`→ Figma file ${KEY}`);

  // 1. Full document tree (+ shared plugin data => Tokens Studio etc.)
  const file = await api(`/files/${KEY}?plugin_data=shared&geometry=paths`);
  if (file.status !== 200) {
    console.error(`file fetch failed (${file.status}):`, JSON.stringify(file.json));
    exit(1);
  }
  const fileName = (file.json.name || KEY).replace(/[^\w.-]+/g, '-');
  const outDir = path.resolve('docs/design', fileName);
  await mkdir(path.join(outDir, 'nodes'), { recursive: true });
  if (WITH_IMAGES) await mkdir(path.join(outDir, 'renders'), { recursive: true });

  await writeFile(path.join(outDir, 'file.json'), JSON.stringify(file.json, null, 2));

  const pages = file.json.document?.children ?? [];
  const emptyDoc = pages.every((p) => (p.children?.length ?? 0) === 0);
  if (emptyDoc) {
    console.warn('⚠  This file has no content on any page. Populate it in Figma, then re-run.');
  }

  // 2. Sidecar metadata
  for (const [name, ep] of [
    ['meta', `/files/${KEY}/meta`],
    ['styles', `/files/${KEY}/styles`],
    ['variables.local', `/files/${KEY}/variables/local`],
    ['variables.published', `/files/${KEY}/variables/published`],
  ]) {
    const r = await api(ep);
    if (r.status === 200) {
      await writeFile(path.join(outDir, `${name}.json`), JSON.stringify(r.json, null, 2));
      console.log(`  ✓ ${name}.json`);
    } else if (name.startsWith('variables') && r.status === 403) {
      await writeFile(
        path.join(outDir, `${name}.NOTE.txt`),
        `403 from ${ep}\n${JSON.stringify(r.json)}\n\n` +
          `The Variables REST API requires the file to be in a Figma Enterprise org,\n` +
          `and the token needs the file_variables:read scope. If not Enterprise, export\n` +
          `variables with a plugin (Tokens Studio / Design Tokens) into docs/design/tokens/.\n`,
      );
      console.warn(`  ⚠ ${name}: 403 (see ${name}.NOTE.txt)`);
    } else {
      console.warn(`  ⚠ ${name}: ${r.status}`);
    }
  }

  // 3. components + component_sets merged
  const comps = await api(`/files/${KEY}/components`);
  const sets = await api(`/files/${KEY}/component_sets`);
  await writeFile(
    path.join(outDir, 'components.json'),
    JSON.stringify({ components: comps.json?.meta ?? comps.json, component_sets: sets.json?.meta ?? sets.json }, null, 2),
  );
  console.log('  ✓ components.json');

  // 4. Deep node dump per page + collect top-level frames for rendering
  const manifest = { file: KEY, name: file.json.name, fetchedAt: new Date().toISOString(), pages: [] };
  const frameIds = [];
  for (const page of pages) {
    const topFrames = (page.children ?? []).filter((n) =>
      ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION'].includes(n.type),
    );
    manifest.pages.push({
      id: page.id,
      name: page.name,
      frames: topFrames.map((f) => ({ id: f.id, name: f.name, type: f.type })),
    });
    for (const f of topFrames) frameIds.push(f.id);

    if (topFrames.length) {
      const batches = chunk(topFrames.map((f) => f.id), 20);
      const nodeData = {};
      for (const b of batches) {
        const r = await api(`/files/${KEY}/nodes?ids=${b.join(',')}&plugin_data=shared`);
        Object.assign(nodeData, r.json?.nodes ?? {});
        await sleep(300);
      }
      const safe = page.name.replace(/[^\w.-]+/g, '-');
      await writeFile(path.join(outDir, 'nodes', `${safe}.json`), JSON.stringify(nodeData, null, 2));
      console.log(`  ✓ nodes/${safe}.json (${topFrames.length} frames)`);
    }
  }
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`  ✓ manifest.json (${pages.length} pages, ${frameIds.length} frames)`);

  // 5. PNG renders of every top-level frame
  if (WITH_IMAGES && frameIds.length) {
    let n = 0;
    for (const b of chunk(frameIds, 40)) {
      const r = await api(`/images/${KEY}?ids=${b.join(',')}&format=png&scale=2`);
      const map = r.json?.images ?? {};
      for (const [id, url] of Object.entries(map)) {
        if (!url) continue;
        const img = await fetch(url);
        if (!img.ok) continue;
        const buf = Buffer.from(await img.arrayBuffer());
        await writeFile(path.join(outDir, 'renders', `${id.replace(/[:]/g, '-')}.png`), buf);
        n++;
      }
      await sleep(500);
    }
    console.log(`  ✓ renders/ (${n} PNGs)`);
  }

  console.log(`\nDone → ${path.relative(process.cwd(), outDir)}`);
  if (emptyDoc) exit(2);
}

main().catch((e) => { console.error(e); exit(1); });
