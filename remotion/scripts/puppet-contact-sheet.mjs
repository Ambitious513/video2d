#!/usr/bin/env node
/**
 * Render ACTUAL Remotion stills of one composition at chosen frames and
 * assemble a labelled contact sheet. Used for puppet-upgrade before/after
 * evidence (master plan §7.8 / §9.5) — never AI-generated imagery.
 *
 *   node remotion/scripts/puppet-contact-sheet.mjs \
 *     --comp RunCycle --frames 0,12,25,26,34,72,93 \
 *     --out reports/puppet-upgrade-baseline-contact-sheet.png \
 *     --label "Baseline puppet (pre-upgrade)"
 *
 * Stills are written to verify/stills/ (gitignored) as <Comp>_f<NN>.png,
 * reusing the same naming as render-stills.mjs. One bundle, one page at a
 * time — low-RAM safe (~1 GB sandbox).
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.resolve(HERE, '..');
const ROOT = path.resolve(REMOTION, '..');
const toolsRequire = createRequire(path.join(ROOT, 'tools', 'package.json'));
const sharp = toolsRequire('sharp');

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const comp = opt('comp', 'RunCycle');
const frames = opt('frames', '0,12,25,26,34,72,93').split(',').map(Number);
const out = path.resolve(ROOT, opt('out', `reports/${comp.toLowerCase()}-contact-sheet.png`));
const label = opt('label', comp);
if (frames.some((f) => !Number.isInteger(f) || f < 0 || f > 93)) {
  console.error('frames must be integers in 0..93');
  process.exit(1);
}

const STILLS = path.join(ROOT, 'verify', 'stills');
fs.mkdirSync(STILLS, {recursive: true});
fs.mkdirSync(path.dirname(out), {recursive: true});

console.log(`bundling remotion entry point...`);
const serveUrl = await bundle({entryPoint: path.join(REMOTION, 'src', 'index.ts'), logLevel: 'error'});
const composition = await selectComposition({serveUrl, id: comp});

const stills = [];
for (const frame of frames) {
  const name = `${comp}_f${String(frame).padStart(2, '0')}.png`;
  const output = path.join(STILLS, name);
  await renderStill({composition, serveUrl, output, frame, imageFormat: 'png', logLevel: 'error'});
  const meta = await sharp(output).metadata();
  if (meta.width !== 1920 || meta.height !== 1080) throw new Error(`${name}: unexpected dims ${meta.width}x${meta.height}`);
  console.log(`rendered ${name}`);
  stills.push({frame, file: output});
}

async function labelSvg(text, w, h, fontSize = 24) {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="#30303A"/>
    <text x="${w / 2}" y="${h / 2 + fontSize / 3}" font-family="DejaVu Sans" font-size="${fontSize}" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${text}</text>
  </svg>`);
}

const TW = 480, TH = 270, HEADER = 44, TITLE = 52;
const width = TW * frames.length;
const height = TITLE + HEADER + TH;
const composites = [
  {input: await labelSvg(`${label} — ${comp}, 1920x1080 @ 24fps, actual Remotion renders`, width, TITLE, 26), left: 0, top: 0},
];
for (let c = 0; c < stills.length; c++) {
  composites.push({input: await labelSvg(`frame ${stills[c].frame}`, TW, HEADER, 22), left: c * TW, top: TITLE});
  const thumb = await sharp(stills[c].file).resize(TW, TH).png().toBuffer();
  composites.push({input: thumb, left: c * TW, top: TITLE + HEADER});
}
await sharp({create: {width, height, channels: 3, background: '#FFFFFF'}}).composite(composites).png().toFile(out);
console.log(`wrote ${path.relative(ROOT, out)} (${width}x${height})`);
