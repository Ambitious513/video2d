#!/usr/bin/env node
/**
 * Phase 4 — variant-render verification (REGRESSION for the hardcoded-frame bug).
 *   node remotion/scripts/verify-variants.mjs
 * Renders actual Remotion stills for BOTH variants at distinct frames, then
 * asserts (with sharp, on real pixels — not React element identity):
 *   - different animation phases produce different rendered poses (per variant);
 *   - both variants use the same underlying motion (same raw ankle target);
 *   - their rig proportions differ (knees differ);
 *   - their visual identities are distinct (teal body != runner body);
 *   - all images are 1920x1080.
 * Writes reports/variant-render-validation.json. Exit 0 = PASS.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.resolve(HERE, '..');
const ROOT = path.resolve(REMOTION, '..');
const toolsRequire = createRequire(path.join(ROOT, 'tools', 'package.json'));
const sharp = toolsRequire('sharp');

const FRAMES = [0, 12, 25, 26, 34, 72, 93];
const OUT = path.resolve(ROOT, 'reports', 'variant-render-check');
fs.mkdirSync(OUT, {recursive: true});

// Temp entry: two compositions using the CURRENT timeline frame (the fix).
const entryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-verify-'));
const entry = path.join(entryDir, 'entry.tsx');
fs.writeFileSync(entry, `
import React from 'react';
import {Composition, registerRoot, useCurrentFrame} from 'remotion';
import {PuppetVariant} from '${path.join(REMOTION, 'src', 'puppet', 'Runner').replace(/\\/g, '/')}';
const Runner: React.FC = () => <PuppetVariant frame={useCurrentFrame()} variant="runner" />;
const Teal: React.FC = () => <PuppetVariant frame={useCurrentFrame()} variant="teal" />;
const Root: React.FC = () => (
  <>
    <Composition id="VariantRunner" component={Runner} durationInFrames={94} fps={24} width={1920} height={1080} />
    <Composition id="VariantTeal" component={Teal} durationInFrames={94} fps={24} width={1920} height={1080} />
  </>
);
registerRoot(Root);
`);

const serveUrl = await bundle({entryPoint: entry, logLevel: 'error'});
const variants = [['runner', 'VariantRunner'], ['teal', 'VariantTeal']];
const rendered = {};
for (const [name, comp] of variants) {
  const composition = await selectComposition({serveUrl, id: comp});
  rendered[name] = {};
  for (const frame of FRAMES) {
    const out = path.join(OUT, `${name}_${String(frame).padStart(3, '0')}.png`);
    await renderStill({composition, serveUrl, output: out, frame, imageFormat: 'png', logLevel: 'error'});
    const m = await sharp(out).metadata();
    if (m.width !== 1920 || m.height !== 1080) throw new Error(`${name}_${frame}: ${m.width}x${m.height} != 1920x1080`);
    rendered[name][frame] = out;
  }
}
fs.rmSync(entryDir, {recursive: true, force: true});

// --- assertions on real pixels ---------------------------------------------
const raw = async (f) => (await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject: true})).data;
const meanAbsDiff = (a, b) => {
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  return s / n;
};
const fracDiff = (a, b, thr = 24) => {
  let c = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d > thr) c++;
    n++;
  }
  return c / n;
};

const checks = [];
const push = (name, ok, detail) => checks.push({name, pass: !!ok, detail});

for (const name of ['runner', 'teal']) {
  // distinct animation phases -> different rendered poses. The gait cycle is
  // exactly 26 frames (the measured stride period), so frame f and f+26 are the
  // SAME phase by design; skip that pair and require all other pairs to differ.
  const base = await raw(rendered[name][0]);
  for (const frame of FRAMES.slice(1)) {
    if (frame === 26) continue; // 0 and 26 are the same gait phase (period 26)
    const cur = await raw(rendered[name][frame]);
    const frac = fracDiff(base, cur);
    push(`${name} frame 0 vs ${frame} differs`, frac > 0.001, `fracDiff=${frac.toFixed(5)}`);
  }
  // and 0 vs 26 must be identical (period-26 gait) — proves the cycle, not a static frame
  const f26 = await raw(rendered[name][26]);
  const same = fracDiff(base, f26);
  push(`${name} frame 0 == 26 (period-26 gait, not a static frame)`, same <= 0.001, `fracDiff=${same.toFixed(5)}`);
}

// both variants differ in appearance at the same frame (identity distinct)
{
  const a = await raw(rendered.runner[34]);
  const b = await raw(rendered.teal[34]);
  push('runner vs teal at frame 34 differ (identity)', fracDiff(a, b) > 0.001, `fracDiff=${fracDiff(a, b).toFixed(5)}`);
}

// geometry sanity: same motion timing (raw ankle target) + different proportions (knee)
const poseMod = await import(pathToFileURL(path.join(REMOTION, 'src', 'puppet', 'pose.ts')).href);
const rigMod = await import(pathToFileURL(path.join(REMOTION, 'src', 'puppet', 'rig.ts')).href);
const runnerMod = await import(pathToFileURL(path.join(REMOTION, 'src', 'puppet', 'Runner.tsx')).href);
const VARIANT_RIG = runnerMod.VARIANT_RIG;
const RUNNER_RIG = rigMod.RUNNER_RIG;
{
  let sameRaw = true, diffKnee = false;
  for (const f of FRAMES) {
    const r = poseMod.solvePose(f, RUNNER_RIG);
    const t = poseMod.solvePose(f, VARIANT_RIG);
    if (Math.hypot(r.nearLeg.rawAnkle[0] - t.nearLeg.rawAnkle[0], r.nearLeg.rawAnkle[1] - t.nearLeg.rawAnkle[1]) > 1e-9) sameRaw = false;
    if (Math.hypot(r.nearLeg.knee[0] - t.nearLeg.knee[0], r.nearLeg.knee[1] - t.nearLeg.knee[1]) > 1) diffKnee = true;
  }
  push('both variants share the same motion (raw ankle target)', sameRaw, 'raw ankle identical');
  push('variant rig proportions differ (knee positions)', diffKnee, 'knees differ > 1px');
}

const report = {
  generatedAt: new Date().toISOString(),
  schema: 'variant-render-validation/1',
  purpose: 'Phase 4 regression: variant stills render the CURRENT timeline frame (not a hardcoded frame) and both variants are distinct + deterministic.',
  frames: FRAMES,
  checks,
  pass: checks.every((c) => c.pass),
};
fs.writeFileSync(path.resolve(ROOT, 'reports', 'variant-render-validation.json'), JSON.stringify(report, null, 2) + '\n');
for (const c of checks) console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
console.log(`\nvariant-render: ${report.pass ? 'PASS' : 'FAIL'} (${checks.filter((c) => c.pass).length}/${checks.length})`);
process.exit(report.pass ? 0 : 1);