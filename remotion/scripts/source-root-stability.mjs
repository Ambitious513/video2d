#!/usr/bin/env node
/**
 * Phase 2.2b — INDEPENDENT source-image root-stability measurement.
 *
 * The puppet's keys.ts hard-codes HIP_X=864 (an in_place assumption). To verify
 * that assumption against GROUND TRUTH (master plan §6.2; 2.2b brief C6: the
 * source frames/video are the reference, NOT the puppet's stylized shadow), this
 * script measures the horizontal centroid of the character's BODY pixels in each
 * committed source frame frames/f_001..f_094.png (960x540, timeline frame N ↔
 * f_{N+1}.png). A character that runs in place keeps a bounded, non-drifting
 * centroid; a character travelling through the scene (root_motion) shows a
 * strong monotonic drift.
 *
 * Read-only on protected frames/. Uses sharp from tools/ (already a dependency;
 * no new deps). Deterministic. Writes reports/source-root-stability.json.
 * Run: node remotion/scripts/source-root-stability.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const toolsRequire = createRequire(path.join(ROOT, 'tools', 'package.json'));
const sharp = toolsRequire('sharp');
const FRAMES = path.join(ROOT, 'frames');
const OUT = path.join(ROOT, 'reports', 'source-root-stability.json');
const N = 94;
// Body pixels: slate-gray body / dark outline / far-side limb all have
// max(r,g,b) < 180. This excludes the cream scarf (~243), light backpack (~198),
// soft shadow (~220) and white background (255), isolating the gray character.
const BODY_MAX_CHANNEL = 180;

async function measure(file) {
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const {width, height, channels} = info;
  let sumX = 0, count = 0, minX = width, maxX = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.max(r, g, b) < BODY_MAX_CHANNEL) {
        sumX += x; count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  return {
    centroidX: count ? sumX / count : null,
    bodyPixelCount: count,
    bodyMinX: count ? minX : null,
    bodyMaxX: count ? maxX : null,
    bodyBBoxCenterX: count ? (minX + maxX) / 2 : null,
    width, height,
  };
}

const perFrame = [];
for (let f = 0; f < N; f++) {
  const name = `f_${String(f + 1).padStart(3, '0')}.png`;
  const m = await measure(path.join(FRAMES, name));
  perFrame.push({frame: f, file: `frames/${name}`, ...m});
}
const cents = perFrame.map((p) => p.centroidX).filter((v) => v != null);
const mean = cents.reduce((a, b) => a + b, 0) / cents.length;
const variance = cents.reduce((a, b) => a + (b - mean) ** 2, 0) / cents.length;
// Least-squares drift slope of centroidX vs frame index (px/frame at 960 width).
const n = cents.length;
const xs = perFrame.filter((p) => p.centroidX != null).map((p) => p.frame);
const xMean = xs.reduce((a, b) => a + b, 0) / n;
let num = 0, den = 0;
for (let k = 0; k < n; k++) { num += (xs[k] - xMean) * (cents[k] - mean); den += (xs[k] - xMean) ** 2; }
const slope = den ? num / den : 0;
const centroidMin = Math.min(...cents), centroidMax = Math.max(...cents);

const report = {
  generatedAt: new Date().toISOString(),
  schema: 'source-root-stability/1',
  purpose: 'Independent source-image confirmation of in_place (no horizontal root travel) for Phase 2.2b',
  method: {
    source: 'committed frames/f_001..f_094.png (960x540); timeline frame N <-> f_{N+1}.png',
    bodyMask: `pixels with max(r,g,b) < ${BODY_MAX_CHANNEL} (slate body + dark outline + far limb; excludes cream scarf, light backpack, soft shadow, white bg)`,
    metric: 'horizontal centroid of body pixels per frame; least-squares drift slope vs frame index',
    note: 'native 960px width; multiply by 2 for 1920x1080 canvas coordinates. Limb swing oscillates the centroid slightly even in place; the test is bounded range + ~zero drift slope, not a perfectly constant centroid.',
  },
  frameCount: n,
  centroidX960: {min: centroidMin, max: centroidMax, mean, std: Math.sqrt(variance), range: centroidMax - centroidMin},
  centroidX1920: {min: centroidMin * 2, max: centroidMax * 2, mean: mean * 2, range: (centroidMax - centroidMin) * 2},
  driftSlopePxPerFrame960: slope,
  driftSlopePxPerFrame1920: slope * 2,
  totalDriftOverClipPx960: slope * (N - 1),
  // A travelling character would drift hundreds of px across the clip; an
  // in-place character stays bounded with ~zero slope. Threshold: |total drift|
  // < 20 px (960) AND range < 60 px (960) => no scene translation.
  inPlaceConfirmed: Math.abs(slope * (N - 1)) < 20 && (centroidMax - centroidMin) < 60,
  perFrame,
};
fs.mkdirSync(path.dirname(OUT), {recursive: true});
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log('source frames measured:', n);
console.log('centroidX960: min=', centroidMin.toFixed(2), 'max=', centroidMax.toFixed(2), 'mean=', mean.toFixed(2), 'std=', Math.sqrt(variance).toFixed(2), 'range=', (centroidMax - centroidMin).toFixed(2));
console.log('drift slope px/frame (960)=', slope.toFixed(4), '| total drift over clip (960)=', (slope * (N - 1)).toFixed(2));
console.log('inPlaceConfirmed=', report.inPlaceConfirmed);
