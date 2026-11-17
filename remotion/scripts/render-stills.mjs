#!/usr/bin/env node
/**
 * Test F — still-render smoke tests + contact sheets (also Test J proof sheet).
 *
 *   node remotion/scripts/render-stills.mjs   (from anywhere)
 *
 * Renders stills for every registered composition at frames 0, 12, 25, 26,
 * 72, 93 (one webpack bundle, one browser page at a time — low-RAM safe).
 * Verifies each still: renders without exception, 1920x1080, non-empty, not
 * all-black/all-white, contains character/source content (dark-pixel and
 * color-variety thresholds below). Missing assets make Remotion throw, so a
 * successful render also proves asset resolution.
 *
 * Outputs:
 *   verify/stills/<Comp>_f<NN>.png          (local, gitignored)
 *   verify/contact-sheet.png                (labelled, committed)
 *   verify/comparison-contact-sheet.png     (Test J proof, committed)
 *   reports/still-render-validation.json
 *
 * Pixel thresholds (documented, applied to every still):
 *   meanLuminance > 5                       (not entirely black)
 *   nonWhiteFraction > 0.002                (not entirely white)
 *   0.002 < darkFraction(lum<200) < 0.5     (character/labels present)
 *   distinctColors(sampled) >= 8            (real content, not a flat fill)
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {JOBS, WIDTH, HEIGHT} from '../../render-lowram.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.resolve(HERE, '..');
const ROOT = path.resolve(REMOTION, '..');
const toolsRequire = createRequire(path.join(ROOT, 'tools', 'package.json'));
const {PNG} = toolsRequire('pngjs');
const sharp = toolsRequire('sharp');

const FRAMES = [0, 12, 25, 26, 72, 93];
const STILLS = path.join(ROOT, 'verify', 'stills');
fs.mkdirSync(STILLS, {recursive: true});
fs.mkdirSync(path.join(ROOT, 'reports'), {recursive: true});

function pngStats(file) {
  const img = PNG.sync.read(fs.readFileSync(file));
  const d = img.data;
  let lumSum = 0, nonWhite = 0, dark = 0;
  const colors = new Set();
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const lum = (d[o] + d[o + 1] + d[o + 2]) / 3;
    lumSum += lum;
    if (d[o] < 250 || d[o + 1] < 250 || d[o + 2] < 250) nonWhite++;
    if (lum < 200) dark++;
    if (i % 7 === 0) colors.add((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
  }
  return {
    width: img.width, height: img.height, bytes: fs.statSync(file).size,
    meanLuminance: +(lumSum / n).toFixed(2),
    nonWhiteFraction: +(nonWhite / n).toFixed(5),
    darkFraction: +(dark / n).toFixed(5),
    distinctColorsSampled: colors.size,
  };
}

const check = (name, ok, detail) => ({name, status: ok ? 'PASS' : 'FAIL', detail});

console.log('bundling remotion entry point...');
const serveUrl = await bundle({entryPoint: path.join(REMOTION, 'src', 'index.ts'), logLevel: 'error'});

const results = [];
for (const job of JOBS) {
  const composition = await selectComposition({serveUrl, id: job.id});
  for (const frame of FRAMES) {
    const name = `${job.id}_f${String(frame).padStart(2, '0')}.png`;
    const output = path.join(STILLS, name);
    const entry = {composition: job.id, frame, file: `verify/stills/${name}`};
    try {
      await renderStill({composition, serveUrl, output, frame, imageFormat: 'png', logLevel: 'error'});
      const s = pngStats(output);
      Object.assign(entry, s);
      entry.checks = [
        check('dimensions 1920x1080', s.width === WIDTH && s.height === HEIGHT, `${s.width}x${s.height}`),
        check('non-empty', s.bytes > 1000, `${s.bytes} bytes`),
        check('not entirely black', s.meanLuminance > 5, `meanLum=${s.meanLuminance}`),
        check('not entirely white', s.nonWhiteFraction > 0.002, `nonWhite=${s.nonWhiteFraction}`),
        check('character/content present', s.darkFraction > 0.002 && s.darkFraction < 0.5, `dark=${s.darkFraction}`),
        check('color variety', s.distinctColorsSampled >= 8, `${s.distinctColorsSampled} colors`),
      ];
      entry.status = entry.checks.every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL';
    } catch (err) {
      entry.status = 'FAIL';
      entry.error = String(err.message || err);
    }
    console.log(`[${entry.status}] ${name}${entry.error ? ' — ' + entry.error : ''}`);
    results.push(entry);
  }
}

// ---- Labelled contact sheet: rows = compositions, cols = frames ----
async function labelSvg(text, w, h, fontSize = 26) {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="#30303A"/>
    <text x="${w / 2}" y="${h / 2 + fontSize / 3}" font-family="DejaVu Sans" font-size="${fontSize}" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${text}</text>
  </svg>`);
}

async function contactSheet() {
  const TW = 480, TH = 270, GUTTER = 200, HEADER = 44;
  const width = GUTTER + TW * FRAMES.length;
  const height = HEADER + TH * JOBS.length;
  const composites = [];
  for (let c = 0; c < FRAMES.length; c++) {
    composites.push({input: await labelSvg(`frame ${FRAMES[c]} (cel ${FRAMES[c] + 1})`, TW, HEADER, 22), left: GUTTER + c * TW, top: 0});
  }
  for (let r = 0; r < JOBS.length; r++) {
    composites.push({input: await labelSvg(JOBS[r].id, GUTTER, TH, 26), left: 0, top: HEADER + r * TH});
    for (let c = 0; c < FRAMES.length; c++) {
      const still = path.join(STILLS, `${JOBS[r].id}_f${String(FRAMES[c]).padStart(2, '0')}.png`);
      if (!fs.existsSync(still)) continue;
      const thumb = await sharp(still).resize(TW, TH).png().toBuffer();
      composites.push({input: thumb, left: GUTTER + c * TW, top: HEADER + r * TH});
    }
  }
  await sharp({create: {width, height, channels: 3, background: '#FFFFFF'}}).composite(composites).png().toFile(path.join(ROOT, 'verify', 'contact-sheet.png'));
}

// ---- Test J proof sheet: Comparison composition at the 6 review frames ----
// Each tile is a FULL 1920x1080 Comparison still (all four labelled panels),
// downscaled to PW x PH. The resize is mandatory: sharp.composite() CLIPS an
// oversized input to the tile box instead of scaling it, which would show only
// the top-left SOURCE quadrant (the bug this sheet originally shipped with).
async function comparisonSheet() {
  const PW = 1440, PH = 810, HEADER = 44, COLS = 2;
  const rows = Math.ceil(FRAMES.length / COLS);
  const width = PW * COLS, height = (HEADER + PH) * rows;
  const composites = [];
  for (let i = 0; i < FRAMES.length; i++) {
    const still = path.join(STILLS, `Comparison_f${String(FRAMES[i]).padStart(2, '0')}.png`);
    if (!fs.existsSync(still)) continue;
    const r = Math.floor(i / COLS), c = i % COLS;
    composites.push({input: await labelSvg(`Comparison — timeline frame ${FRAMES[i]} / source frame ${FRAMES[i] + 1}`, PW, HEADER, 26), left: c * PW, top: r * (PH + HEADER)});
    const tile = await sharp(still).resize(PW, PH, {fit: 'fill', kernel: 'lanczos3'}).png().toBuffer();
    const meta = await sharp(tile).metadata();
    if (meta.width !== PW || meta.height !== PH) throw new Error(`comparison tile not downscaled: ${meta.width}x${meta.height}`);
    composites.push({input: tile, left: c * PW, top: r * (PH + HEADER) + HEADER});
  }
  if (composites.length !== FRAMES.length * 2) throw new Error(`comparison sheet incomplete: ${composites.length / 2}/${FRAMES.length} tiles`);
  await sharp({create: {width, height, channels: 3, background: '#FFFFFF'}})
    .composite(composites)
    .png({compressionLevel: 9, effort: 10})
    .toFile(path.join(ROOT, 'verify', 'comparison-contact-sheet.png'));
}

let sheetsOk = true;
try { await contactSheet(); console.log('wrote verify/contact-sheet.png'); } catch (e) { sheetsOk = false; console.error('contact sheet failed:', e.message); }
try { await comparisonSheet(); console.log('wrote verify/comparison-contact-sheet.png'); } catch (e) { sheetsOk = false; console.error('comparison sheet failed:', e.message); }

const report = {
  generatedAt: new Date().toISOString(),
  framesTested: FRAMES,
  compositions: JOBS.map((j) => j.id),
  pixelThresholds: {meanLuminance: '> 5', nonWhiteFraction: '> 0.002', darkFraction: '0.002..0.5', distinctColorsSampled: '>= 8'},
  stills: results,
  contactSheet: 'verify/contact-sheet.png',
  comparisonContactSheet: 'verify/comparison-contact-sheet.png',
  sheetsGenerated: sheetsOk,
  status: results.every((r) => r.status === 'PASS') && sheetsOk ? 'PASS' : 'FAIL',
};
fs.writeFileSync(path.join(ROOT, 'reports', 'still-render-validation.json'), JSON.stringify(report, null, 2));
console.log('Test F stills:', report.status);
process.exit(report.status === 'PASS' ? 0 : 1);
