#!/usr/bin/env node
/**
 * Phase 4 — side-by-side variant comparison sheet (runner vs teal).
 *   node tools/compare-variants.mjs
 * Renders two rows per frame (runner top, teal bottom) from reports/p4-new/,
 * scaled to 640x360, with a caption. The stills are rendered with
 * `remotion still PuppetVariant --props={"variant":...}` first (by the caller
 * or the script). Same rig/solver/motion, different appearance + proportions.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'tools', 'package.json'));
const sharp = require('sharp');

const FRAMES = [0, 12, 25, 26, 34, 72, 93];
const W = 640, H = 360, PAD = 6, TOP = 44;

const newDir = path.join(ROOT, 'reports', 'p4-new');
const outDir = path.join(ROOT, 'reports');
const load = (file, w, h) => sharp(file).resize(w, h, {fit: 'fill'}).png().toBuffer();

async function main() {
  const cols = FRAMES.length;
  const cellW = W, cellH = H;
  const width = cols * (cellW + PAD) + PAD;
  const height = TOP + 2 * (cellH + PAD) + PAD;
  const composites = [];

  const header = Buffer.from(
    `<svg width="${width}" height="${TOP}"><rect width="100%" height="100%" fill="#ffffff"/>` +
    `<text x="10" y="28" font-family="sans-serif" font-size="17" fill="#222">Phase 4 — runner (top) vs teal variant (bottom), same rig/solver/motion — frames ${FRAMES.join(', ')}</text></svg>`,
  );
  composites.push({input: header, left: 0, top: 0});

  for (let c = 0; c < cols; c++) {
    const f = FRAMES[c];
    const left = PAD + c * (cellW + PAD);
    const runner = await load(path.join(newDir, `runner_${String(f).padStart(3, '0')}.png`), cellW, cellH);
    composites.push({input: runner, left, top: TOP});
    const teal = await load(path.join(newDir, `teal_${String(f).padStart(3, '0')}.png`), cellW, cellH);
    composites.push({input: teal, left, top: TOP + cellH + PAD});
  }

  const out = path.join(outDir, 'phase4-variant-comparison.png');
  await sharp({create: {width, height, channels: 3, background: '#ffffff'}})
    .composite(composites).png().toFile(out);
  console.log('wrote', out, `${width}x${height}`);
}

main().catch((e) => { console.error(e); process.exit(1); });