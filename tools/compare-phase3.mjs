#!/usr/bin/env node
/**
 * Phase 3c — labelled source-vs-Phase-3-puppet comparison sheet.
 *   node tools/compare-phase3.mjs
 * For each frame in FRAMES, places the SOURCE render (fullres, top) above the
 * Phase-3 puppet render (reports/p3c-new, bottom), scaled to 640x360, with a
 * caption. The puppet frames are rendered with `remotion still` first.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'tools', 'package.json'));
const sharp = require('sharp');

const FRAMES = [0, 12, 25, 26, 34, 72, 93];
const W = 640, H = 360, PAD = 6, LABEL = 26, TOP = 44;

const srcDir = path.join(ROOT, 'fullres');
const newDir = path.join(ROOT, 'reports', 'p3c-new');
const outDir = path.join(ROOT, 'reports');

const load = (file, w, h) => sharp(file).resize(w, h, {fit: 'fill'}).png().toBuffer();

async function main() {
  fs.mkdirSync(newDir, {recursive: true});
  const {execFileSync} = await import('node:child_process');
  const cli = path.join(ROOT, 'remotion', 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  for (const f of FRAMES) {
    const out = path.join(newDir, `f_${String(f).padStart(3, '0')}.png`);
    if (!fs.existsSync(out)) {
      execFileSync(process.execPath, [cli, 'still', 'RunCycle', out, `--frame=${f}`], {
        cwd: path.join(ROOT, 'remotion'), stdio: 'inherit',
      });
    }
  }

  const cols = FRAMES.length;
  const cellW = W, cellH = H;
  const width = cols * (cellW + PAD) + PAD;
  const height = TOP + 2 * (cellH + PAD) + PAD;
  const composites = [];

  const header = Buffer.from(
    `<svg width="${width}" height="${TOP}"><rect width="100%" height="100%" fill="#ffffff"/>` +
    `<text x="10" y="28" font-family="sans-serif" font-size="17" fill="#222">Phase 3c — source (top) vs Phase-3 puppet (bottom) — frames ${FRAMES.join(', ')}</text></svg>`,
  );
  composites.push({input: header, left: 0, top: 0});

  for (let c = 0; c < cols; c++) {
    const f = FRAMES[c];
    const left = PAD + c * (cellW + PAD);
    const src = await load(path.join(srcDir, `f_${String(f + 1).padStart(3, '0')}.png`), cellW, cellH);
    composites.push({input: src, left, top: TOP});
    const pv = await load(path.join(newDir, `f_${String(f).padStart(3, '0')}.png`), cellW, cellH);
    composites.push({input: pv, left, top: TOP + cellH + PAD});
  }

  const out = path.join(outDir, 'phase3-comparison-sheet.png');
  await sharp({create: {width, height, channels: 3, background: '#ffffff'}})
    .composite(composites).png().toFile(out);
  console.log('wrote', out, `${width}x${height}`);
}

main().catch((e) => { console.error(e); process.exit(1); });