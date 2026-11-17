/**
 * Test I — motion & continuity checks for the procedural puppet (RunCycle).
 *
 *   npx tsx remotion/scripts/motion-check.tsx   (from anywhere; or npm run verify:motion)
 *
 * Checks, over ALL 94 timeline frames:
 *  - determinism: same frame + same inputs -> byte-identical SSR SVG;
 *  - no NaN / Infinity / undefined / missing coordinates in the markup;
 *  - shadow, scarf and body elements present in every frame;
 *  - every computed joint coordinate finite and inside the 1920x1080 canvas;
 *  - limb segment lengths: min/max/mean reported; max/min ratio must stay
 *    within the documented tolerance 2.0 (Catmull-Rom resampling of measured
 *    keys legitimately varies lengths somewhat — this bounds "unexpected");
 *  - continuity: max joint displacement between adjacent frames, and the
 *    26-frame cycle wrap (25->26) must not pop: wrap delta <= 1.5 x p95 of
 *    all adjacent deltas (documented heuristic);
 *  - pixel-level continuity: SSR SVGs rasterized to 96x54, adjacent-frame
 *    MAD series; the wrap MAD must satisfy the same 1.5 x p95 rule.
 *
 * Cel asset selection monotonicity is covered by the pure unit tests
 * (remotion/test/cels.test.ts) — exact is strictly +1 per frame, loop wraps
 * by design every 26 frames.
 *
 * HONESTY NOTE: the current Runner.tsx / keys.ts have NO true IK
 * stance-locking and NO measured foot-contact solver. Those are future work,
 * not passing tests. This script does not claim them.
 *
 * Writes reports/motion-validation.json.
 */
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Runner} from '../src/puppet/Runner';
import {
  HIP_X, HEAD_X, hipY, headY, cycleSample, LEG_CYCLE, armPose, shadow, DURATION, LOOP,
} from '../src/puppet/keys';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const toolsRequire = createRequire(path.join(ROOT, 'tools', 'package.json'));
const sharp = toolsRequire('sharp');

type Pt = [number, number];
const check = (name: string, ok: boolean, detail: string) => ({name, status: ok ? 'PASS' : 'FAIL', detail});
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const add = (p: Pt, o: Pt): Pt => [p[0] + o[0], p[1] + o[1]];

interface FrameJoints {
  hip: Pt; head: Pt; shoulder: Pt; knot: Pt; pack: Pt;
  nearKnee: Pt; nearAnkle: Pt; nearToe: Pt;
  farKnee: Pt; farAnkle: Pt; farToe: Pt;
  nearElbow: Pt; nearFist: Pt; farElbow: Pt; farFist: Pt;
}

function joints(f: number): FrameJoints {
  const hip: Pt = [HIP_X, hipY(f)];
  const head: Pt = [HEAD_X, headY(f)];
  const sh: Pt = [922, headY(f) + 154];
  const knot: Pt = [940, headY(f) + 112];
  const pack: Pt = [818, headY(f) + 222];
  const nl = cycleSample(LEG_CYCLE, f);
  const fl = cycleSample(LEG_CYCLE, f + 13);
  const na = armPose(f, 0);
  const fa = armPose(f, 13);
  return {
    hip, head, shoulder: sh, knot, pack,
    nearKnee: add(nl.knee, hip), nearAnkle: add(nl.ankle, hip), nearToe: add(nl.toe, hip),
    farKnee: add(fl.knee, hip), farAnkle: add(fl.ankle, hip), farToe: add(fl.toe, hip),
    nearElbow: add(na.elbow, sh), nearFist: add(na.fist, sh),
    farElbow: add(fa.elbow, sh), farFist: add(fa.fist, sh),
  };
}

const LENGTH_TOLERANCE = 2.0; // documented max/min segment-length ratio
const POP_FACTOR = 1.5; // wrap delta must be <= 1.5 x p95 of adjacent deltas

(async () => {
  const checks: ReturnType<typeof check>[] = [];
  const markupProblems: string[] = [];
  const boundsProblems: string[] = [];
  const determinismProblems: string[] = [];
  const svgs: string[] = [];
  const allJoints: FrameJoints[] = [];

  for (let f = 0; f < DURATION; f++) {
    const svg = renderToStaticMarkup(React.createElement(Runner, {frame: f}));
    const svg2 = renderToStaticMarkup(React.createElement(Runner, {frame: f}));
    if (svg !== svg2) determinismProblems.push(`frame ${f}: repeated SSR differs`);
    if (/NaN|Infinity|undefined/.test(svg)) markupProblems.push(`frame ${f}: NaN/Infinity/undefined in markup`);
    if (!svg.includes('viewBox="0 0 1920 1080"')) markupProblems.push(`frame ${f}: viewBox missing`);
    if (!/fill="#DCDBDE"/.test(svg)) markupProblems.push(`frame ${f}: ground shadow missing`);
    if (!/fill="#F3E9D3"/.test(svg)) markupProblems.push(`frame ${f}: scarf missing`);
    if (!/fill="#686D75"/.test(svg)) markupProblems.push(`frame ${f}: body missing`);
    if ((svg.match(/<path/g) || []).length < 8) markupProblems.push(`frame ${f}: too few paths`);
    svgs.push(svg);

    const j = joints(f);
    allJoints.push(j);
    for (const [name, p] of Object.entries(j) as [string, Pt][]) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) boundsProblems.push(`frame ${f}: ${name} not finite`);
      else if (p[0] < 0 || p[0] > 1920 || p[1] < 0 || p[1] > 1080) boundsProblems.push(`frame ${f}: ${name}=(${p[0].toFixed(1)},${p[1].toFixed(1)}) outside canvas`);
    }
    const shd = shadow(f);
    if (![shd.rx, shd.ry, shd.opacity].every(Number.isFinite)) boundsProblems.push(`frame ${f}: shadow params not finite`);
  }

  checks.push(check('deterministic SSR: same frame -> identical SVG (94 frames x2)', determinismProblems.length === 0, determinismProblems.join('; ') || '94/94 identical'));
  checks.push(check('no NaN/Infinity/undefined; shadow+scarf+body present every frame', markupProblems.length === 0, markupProblems.join('; ') || 'clean'));
  checks.push(check('all joint coordinates finite and inside 1920x1080', boundsProblems.length === 0, boundsProblems.join('; ') || `${DURATION * 15} points in bounds`));

  // Segment lengths across the cycle
  const segDefs: [string, (j: FrameJoints) => [Pt, Pt]][] = [
    ['near hip->knee', (j) => [j.hip, j.nearKnee]],
    ['near knee->ankle', (j) => [j.nearKnee, j.nearAnkle]],
    ['near ankle->toe', (j) => [j.nearAnkle, j.nearToe]],
    ['far hip->knee', (j) => [j.hip, j.farKnee]],
    ['far knee->ankle', (j) => [j.farKnee, j.farAnkle]],
    ['far ankle->toe', (j) => [j.farAnkle, j.farToe]],
    ['near shoulder->elbow', (j) => [j.shoulder, j.nearElbow]],
    ['near elbow->fist', (j) => [j.nearElbow, j.nearFist]],
    ['far shoulder->elbow', (j) => [j.shoulder, j.farElbow]],
    ['far elbow->fist', (j) => [j.farElbow, j.farFist]],
  ];
  const segmentStats = segDefs.map(([name, sel]) => {
    const lens = allJoints.map((j) => { const [a, b] = sel(j); return dist(a, b); });
    const min = Math.min(...lens), max = Math.max(...lens), mean = lens.reduce((s, v) => s + v, 0) / lens.length;
    return {segment: name, min: +min.toFixed(1), max: +max.toFixed(1), mean: +mean.toFixed(1), maxOverMin: +(max / min).toFixed(3)};
  });
  const lenBad = segmentStats.filter((s) => s.maxOverMin > LENGTH_TOLERANCE);
  checks.push(check(`limb segment length variation within documented tolerance (max/min <= ${LENGTH_TOLERANCE})`, lenBad.length === 0,
    lenBad.length ? lenBad.map((s) => `${s.segment}: ${s.maxOverMin}`).join('; ') : `worst ratio ${Math.max(...segmentStats.map((s) => s.maxOverMin))}`));

  // Joint-displacement continuity (geometry level)
  const keys = Object.keys(allJoints[0]) as (keyof FrameJoints)[];
  const deltas: number[] = [];
  for (let f = 0; f + 1 < DURATION; f++) {
    let m = 0;
    for (const k of keys) m = Math.max(m, dist(allJoints[f][k], allJoints[f + 1][k]));
    deltas.push(m);
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))];
  const wrapDelta = deltas[LOOP - 1]; // 25 -> 26
  checks.push(check(`no one-frame pop at 26-frame wrap (joint delta ${wrapDelta.toFixed(1)}px <= ${POP_FACTOR} x p95 ${p95.toFixed(1)}px)`, wrapDelta <= POP_FACTOR * p95,
    `wrap(25->26)=${wrapDelta.toFixed(2)}px, adjacent-delta median=${sorted[Math.floor(sorted.length / 2)].toFixed(2)}px, p95=${p95.toFixed(2)}px, max=${sorted[sorted.length - 1].toFixed(2)}px`));

  // Pixel-level continuity at 96x54
  const thumbs: Buffer[] = [];
  for (const svg of svgs) {
    const raw = await sharp(Buffer.from(svg)).resize(96, 54).removeAlpha().raw().toBuffer();
    thumbs.push(raw);
  }
  const mads: number[] = [];
  for (let f = 0; f + 1 < DURATION; f++) {
    let s = 0;
    for (let i = 0; i < thumbs[f].length; i++) s += Math.abs(thumbs[f][i] - thumbs[f + 1][i]);
    mads.push(s / thumbs[f].length);
  }
  const ms = [...mads].sort((a, b) => a - b);
  const mp95 = ms[Math.floor(0.95 * (ms.length - 1))];
  const wrapMad = mads[LOOP - 1];
  checks.push(check(`no pixel pop at wrap (MAD ${wrapMad.toFixed(2)} <= ${POP_FACTOR} x p95 ${mp95.toFixed(2)})`, wrapMad <= POP_FACTOR * mp95,
    `wrap(25->26)=${wrapMad.toFixed(3)}, median=${ms[Math.floor(ms.length / 2)].toFixed(3)}, p95=${mp95.toFixed(3)}, max=${ms[ms.length - 1].toFixed(3)}`));

  const nonEmpty = thumbs.every((t) => { let s = 0; for (const v of t) s += v; return s / t.length < 250; });
  checks.push(check('character visible (not blank) in every rasterized frame', nonEmpty, '94/94 non-blank at 96x54'));

  const report = {
    generatedAt: new Date().toISOString(),
    scope: 'RunCycle procedural puppet, frames 0..93; cel selection monotonicity covered by remotion/test/cels.test.ts',
    tolerances: {segmentLengthMaxOverMin: LENGTH_TOLERANCE, wrapPopFactor: POP_FACTOR, pixelThumb: '96x54 grayscale-free RGB MAD'},
    checks,
    segmentLengthStats: segmentStats,
    adjacentJointDeltaPx: {median: +sorted[Math.floor(sorted.length / 2)].toFixed(2), p95: +p95.toFixed(2), max: +sorted[sorted.length - 1].toFixed(2), wrap25to26: +wrapDelta.toFixed(2)},
    adjacentPixelMad: {median: +ms[Math.floor(ms.length / 2)].toFixed(3), p95: +mp95.toFixed(3), max: +ms[ms.length - 1].toFixed(3), wrap25to26: +wrapMad.toFixed(3)},
    notPresent_futureWork: [
      'true IK stance-locking (not implemented in Runner.tsx / keys.ts)',
      'measured foot-contact solver (not implemented)',
    ],
    status: checks.every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL',
  };
  fs.mkdirSync(path.join(ROOT, 'reports'), {recursive: true});
  fs.writeFileSync(path.join(ROOT, 'reports', 'motion-validation.json'), JSON.stringify(report, null, 2));
  for (const c of checks) console.log(`[${c.status}] ${c.name} — ${c.detail}`);
  console.log('Test I motion:', report.status);
  process.exit(report.status === 'PASS' ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
