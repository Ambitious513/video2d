/**
 * Phase 0 — freeze and characterize the pre-upgrade procedural puppet.
 *
 *   cd remotion && npx tsx scripts/puppet-baseline.ts
 *
 * READ-ONLY against the puppet: imports keys.ts and replicates the exact
 * joint math of Runner.tsx / motion-check.tsx without modifying anything.
 * Records, for all 94 timeline frames at 1920x1080:
 *   - per-frame limb segment lengths (10 segments) + min/max/mean/ratio;
 *   - lowest-point (max-y of ankle/toe) trajectory per foot;
 *   - ankle/toe velocities (forward difference; frame 93 has no successor
 *     in this non-looping 94-frame clip and is recorded as null);
 *   - HEURISTIC contact CANDIDATES only (lowest-point proximity + small
 *     horizontal velocity). These are NOT verified stance labels — Phase 2
 *     must review/label contacts properly (master plan §6.2);
 *   - palette + geometry constants + SSR SVG sha256 at reference frames.
 *
 * Baseline provenance (commit SHA, committed Test I / fidelity numbers) is
 * embedded from reports/baseline/ (verbatim copies of the reports at the
 * reconciled baseline commit).
 *
 * Writes reports/puppet-upgrade-baseline.json. Refuses to overwrite an
 * existing baseline unless --force is passed (the baseline is a frozen
 * record, not a regenerable report).
 */
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Runner} from '../src/puppet/Runner';
import {
  C, HIP_X, HEAD_X, HEAD_R, hipY, headY, cycleSample, LEG_CYCLE, armPose, DURATION, LOOP, STEP, FPS,
} from '../src/puppet/keys';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'reports', 'puppet-upgrade-baseline.json');
if (fs.existsSync(OUT) && !process.argv.includes('--force')) {
  console.error(`${OUT} already exists — the baseline is frozen. Use --force only to re-capture a deliberately new baseline.`);
  process.exit(1);
}

type Pt = [number, number];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const add = (p: Pt, o: Pt): Pt => [p[0] + o[0], p[1] + o[1]];
const r2 = (v: number) => +v.toFixed(2);

interface FrameJoints {
  hip: Pt; head: Pt; shoulder: Pt; knot: Pt; pack: Pt;
  nearKnee: Pt; nearAnkle: Pt; nearToe: Pt;
  farKnee: Pt; farAnkle: Pt; farToe: Pt;
  nearElbow: Pt; nearFist: Pt; farElbow: Pt; farFist: Pt;
}
/** Exact joint math of the pre-upgrade Runner.tsx (kept in sync manually). */
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

const all: FrameJoints[] = [];
for (let f = 0; f < DURATION; f++) all.push(joints(f));

const segments = segDefs.map(([name, sel]) => {
  const perFrame = all.map((j) => { const [a, b] = sel(j); return r2(dist(a, b)); });
  const min = Math.min(...perFrame), max = Math.max(...perFrame);
  const mean = perFrame.reduce((s, v) => s + v, 0) / perFrame.length;
  return {segment: name, min, max, mean: r2(mean), maxOverMin: +(max / min).toFixed(3), perFrame};
});

// --- Lowest-point trajectory + velocities + heuristic contact candidates ---
const GROUND_Y = 972; // shadow ellipse center y in Runner.tsx (visual ground reference)
const footTrack = (side: 'near' | 'far') => {
  const ankleKey = side === 'near' ? 'nearAnkle' : 'farAnkle';
  const toeKey = side === 'near' ? 'nearToe' : 'farToe';
  const lowest = all.map((j) => r2(Math.max(j[ankleKey][1], j[toeKey][1])));
  const ankleV = all.map((j, f) => f + 1 < DURATION
    ? {vx: r2(all[f + 1][ankleKey][0] - j[ankleKey][0]), vy: r2(all[f + 1][ankleKey][1] - j[ankleKey][1])}
    : null);
  const toeV = all.map((j, f) => f + 1 < DURATION
    ? {vx: r2(all[f + 1][toeKey][0] - j[toeKey][0]), vy: r2(all[f + 1][toeKey][1] - j[toeKey][1])}
    : null);
  const maxLowest = Math.max(...lowest);
  // CANDIDATE heuristic (not a verified stance label): lowest point within
  // 12 px of this foot's deepest reach AND |ankle vx| <= 25 px/frame.
  const candidates = all.map((_, f) => {
    const v = ankleV[f];
    return lowest[f] >= maxLowest - 12 && v !== null && Math.abs(v.vx) <= 25;
  });
  const candidateFrames = candidates.map((c, f) => (c ? f : -1)).filter((f) => f >= 0);
  // Proximity-only candidates (no velocity condition), with the measured
  // ankle velocity at each — Phase 2 reviews these as `uncertain` windows.
  const proximityCandidates = all.map((_, f) => f).filter((f) => lowest[f] >= maxLowest - 12)
    .map((f) => ({frame: f, lowestY: lowest[f], ankleVx: ankleV[f]?.vx ?? null, ankleVy: ankleV[f]?.vy ?? null}));
  return {
    lowestPointY: lowest, maxLowestY: maxLowest,
    ankleVelocity: ankleV, toeVelocity: toeV,
    contactCandidateFrames: candidateFrames,
    candidateRule: 'lowest point within 12px of foot max reach AND |ankle vx| <= 25 px/frame — UNVERIFIED candidates for Phase 2 review',
    proximityCandidates,
    proximityRule: 'lowest point within 12px of foot max reach (velocity NOT constrained) — label `uncertain` until Phase 2 review',
  };
};

const REF_FRAMES = [0, 12, 25, 26, 34, 72, 93];
const svgHashes = REF_FRAMES.map((f) => ({
  frame: f,
  sha256: crypto.createHash('sha256').update(renderToStaticMarkup(React.createElement(Runner, {frame: f}))).digest('hex'),
}));

const baselineMotion = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'baseline', 'motion-validation.json'), 'utf8'));
const baselineFidelity = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'baseline', 'fidelity-all-frames.json'), 'utf8'));
const baselineCommit = '5d4d13ab92ac38be0397bd2b8feb27e19eefdf98';

const report = {
  generatedAt: new Date().toISOString(),
  purpose: 'Phase 0 frozen pre-change baseline for the procedural puppet upgrade (master plan §4). Read-only characterization; no puppet code changed.',
  baselineCommit,
  branch: 'feat/constrained-puppet-rig',
  verificationCommand: 'node verify.mjs --install --force-trace',
  timeline: {frames: DURATION, fps: FPS, width: 1920, height: 1080, cycle: LOOP, step: STEP, cyclic: '26-frame gait cycle; the 94-frame clip itself is NOT an exact loop'},
  committedBaselineEvidence: {
    provenance: 'reports/baseline/ (verbatim copies at ' + baselineCommit + ')',
    testI: {status: baselineMotion.status, summary: baselineMotion.summary, segmentLengthStats: baselineMotion.segmentLengthStats, segmentLengthOrigin: baselineMotion.segmentLengthOrigin},
    fidelity: {puppet: baselineFidelity.variants?.puppet ?? baselineFidelity.puppet ?? null, note: 'see reports/baseline/fidelity-all-frames.json for the full structure'},
  },
  measuredNow: {
    note: 'Recomputed read-only from keys.ts joint math at all 94 frames; must agree with the committed Test I segment stats.',
    segments,
    feet: {near: footTrack('near'), far: footTrack('far')},
    groundReferenceY: GROUND_Y,
  },
  visualCharacteristics: {
    palette: C,
    geometry: {
      headRadius: HEAD_R, hipX: HIP_X, headX: HEAD_X,
      limbStrokeWidths: {thigh: 50, calf: 38, upperArm: 34, forearm: 28, outlineExtra: 9},
      foot: 'filled wedge along ankle->toe, half-width 15, heel extension 24 (stretchy: ankle->toe length varies 1.849x)',
      scarf: '6-point sinusoidal ribbon, amp [8,14,19,24,30], period 13',
      backpack: 'flat rounded rect 140x185 at (818, headY+222), rotate -12, single strap line',
      torso: 'single bezier quad between shoulder and hip anchors',
      drawOrder: 'shadow -> far leg -> far arm -> scarf tail -> backpack+strap -> torso+neck -> near leg -> scarf knot -> head -> near arm',
    },
    referenceSheets: ['verify/contact-sheet.png', 'verify/comparison-contact-sheet.png', 'reports/puppet-upgrade-baseline-contact-sheet.png'],
    ssrSvgSha256AtReferenceFrames: svgHashes,
  },
  knownPreExistingDefect: {
    check: 'Test I limb segment length max/min <= 2.0',
    worst: '2.891x near/far knee->ankle',
    classification: 'PRE-EXISTING (raw keys 1.958x -> Catmull-Rom stored track 2.891x -> interpolation overshoot <=1.192x). Phase 1 replaces this ratio gate with per-bone configured-length error.',
  },
  contactCharacterization: {
    finding: 'The strict candidate rule (near-ground AND |ankle vx| <= 25 px/frame) matches ZERO frames for both feet: the unconstrained track has no unambiguous stance. At the deepest ground-proximity frames the ankle still moves 27-74 px/frame horizontally — measured foot slip, the defect Phase 2 must fix.',
    proximityWindows: 'near foot ~frames 17-19/43-45/69-71; far foot ~frames 4-6/30-32/56-58/82-84 (13-frame alternation). All labelled UNCERTAIN candidates for Phase 2 manual review, not verified stance.',
  },
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`wrote ${path.relative(ROOT, OUT)}`);
console.log(`segments: ${segments.length}, frames: ${DURATION}, worst ratio: ${Math.max(...segments.map((s) => s.maxOverMin))}`);
console.log(`near-foot contact candidates: ${report.measuredNow.feet.near.contactCandidateFrames.join(',')}`);
console.log(`far-foot contact candidates: ${report.measuredNow.feet.far.contactCandidateFrames.join(',')}`);
