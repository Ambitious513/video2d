/**
 * Test I — motion & continuity checks for the procedural puppet (RunCycle).
 *
 *   npx tsx remotion/scripts/motion-check.tsx   (from anywhere; or npm run verify:motion)
 *
 * Phase 1 update (master plan §9.7): the old primary gate "limb segment
 * max/min <= 2.0" measured an UNCONSTRAINED puppet and failed at 2.891x
 * (knee->ankle). That historical result is preserved verbatim in
 * reports/baseline/motion-validation.json. The puppet now has a constrained
 * skeleton (rig.ts + ik.ts + pose.ts), so the primary gates are:
 *
 *   - solved bone-length consistency: every constrained bone within ±0.5 px
 *     of its configured rig length on ALL 94 frames (analytic solver actually
 *     achieves ~1e-13 px; the measured max is reported);
 *   - IK end-effector residual: <= 1 px for reachable targets; clamped
 *     (unreachable) targets are counted and reported per frame, never hidden;
 *   - bend-side stability: knee/elbow side constant and equal to the rig hint
 *     across adjacent frames including the 25->26 cycle wrap;
 *   - foot artwork length constant (geometry, not a bone).
 *
 * The raw hand-measured track variation is STILL measured and reported as a
 * diagnostic (three levels: raw keys -> stored 26-sample track -> interpolated
 * frames), so the historical finding remains visible and classifiable. It is
 * no longer a pass/fail gate: noisy reference data is expected; the solver's
 * job is to not stretch bones while following it.
 *
 * Also checked over ALL 94 timeline frames:
 *  - determinism: same frame + same inputs -> byte-identical SSR SVG, both
 *    repeated and OUT-OF-ORDER (72,0,45,12,93,25 requested twice);
 *  - no NaN / Infinity / undefined / missing coordinates in the markup;
 *  - shadow, scarf and body elements present in every frame;
 *  - every computed joint coordinate finite and inside the 1920x1080 canvas;
 *  - smoothness: joint acceleration (2nd difference) series;
 *  - continuity: max joint displacement between adjacent frames, and the
 *    26-frame cycle wrap (25->26) must not pop: wrap delta <= 1.5 x p95 of
 *    all adjacent deltas (documented heuristic);
 *  - pixel-level continuity: SSR SVGs rasterized to 96x54, adjacent-frame
 *    MAD series; the wrap MAD must satisfy the same 1.5 x p95 rule.
 *
 * Cel asset selection monotonicity is covered by the pure unit tests
 * (remotion/test/cels.test.ts). IK edge cases + per-frame solver evidence:
 * remotion/test/ik.test.ts, rig.test.ts, pose.test.ts and npm run verify:ik
 * (reports/ik-validation.json).
 *
 * HONESTY NOTE: stance-locking and a measured foot-contact solver do NOT exist
 * yet (Phase 2). Those are future work, not passing tests. This script does
 * not claim them.
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
  hipY, headY, cycleSample, LEG_CYCLE, armPose, shadow, DURATION, LOOP, STEP,
  NEAR_LEG_RAW, FAR_LEG_RAW,
} from '../src/puppet/keys';
import {solvePose, diagnosePose} from '../src/puppet/pose';
import {RUNNER_RIG, boneLengths, BONE_IDS} from '../src/puppet/rig';

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

/** SOLVED joints — what the puppet actually renders (Phase 1 constrained rig). */
function joints(f: number): FrameJoints {
  const p = solvePose(f);
  return {
    hip: p.hip, head: p.head, shoulder: p.shoulder, knot: p.knot, pack: p.pack,
    nearKnee: p.nearLeg.knee, nearAnkle: p.nearLeg.ankle, nearToe: p.nearLeg.toe,
    farKnee: p.farLeg.knee, farAnkle: p.farLeg.ankle, farToe: p.farLeg.toe,
    nearElbow: p.nearArm.elbow, nearFist: p.nearArm.fist,
    farElbow: p.farArm.elbow, farFist: p.farArm.fist,
  };
}

/** RAW unconstrained track joints — the pre-upgrade math, kept as a diagnostic
 *  so the historical length-variation finding stays measurable and visible. */
function rawJoints(f: number): FrameJoints {
  const hip: Pt = [RUNNER_RIG.anchors.hipX, hipY(f)];
  const head: Pt = [RUNNER_RIG.anchors.headX, headY(f)];
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

const BONE_LENGTH_TOLERANCE = 0.5; // master plan §5.5: px at 1920x1080, per configured bone
const IK_RESIDUAL_TOLERANCE = 1.0; // master plan §9.6: px, reachable targets
const FOOT_LENGTH_TOLERANCE = 1e-6; // foot artwork is constant by construction
const POP_FACTOR = 1.5; // wrap delta must be <= 1.5 x p95 of adjacent deltas
const OUT_OF_ORDER = [72, 0, 45, 12, 93, 25];

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

  // Out-of-order determinism (master plan §9.3): request the same frames again
  // after interleaving others; Remotion may render frame 72 before frame 71.
  const firstPass = OUT_OF_ORDER.map((f) => renderToStaticMarkup(React.createElement(Runner, {frame: f})));
  for (const f of [3, 17, 88, 51]) renderToStaticMarkup(React.createElement(Runner, {frame: f}));
  const secondPass = OUT_OF_ORDER.map((f) => renderToStaticMarkup(React.createElement(Runner, {frame: f})));
  const outOfOrderProblems = OUT_OF_ORDER.filter((_, i) => firstPass[i] !== secondPass[i]).map((f) => `frame ${f}`);

  checks.push(check('deterministic SSR: same frame -> identical SVG (94 frames x2)', determinismProblems.length === 0, determinismProblems.join('; ') || '94/94 identical'));
  checks.push(check(`out-of-order frame requests -> identical SVG (${OUT_OF_ORDER.join(',')} twice, interleaved)`, outOfOrderProblems.length === 0, outOfOrderProblems.length ? `differs: ${outOfOrderProblems.join('; ')}` : '6/6 identical'));
  checks.push(check('no NaN/Infinity/undefined; shadow+scarf+body present every frame', markupProblems.length === 0, markupProblems.join('; ') || 'clean'));
  checks.push(check('all joint coordinates finite and inside 1920x1080', boundsProblems.length === 0, boundsProblems.join('; ') || `${DURATION * 15} points in bounds`));

  // --- Phase 1 primary gates: constrained skeleton ---------------------------
  const cfg = boneLengths(RUNNER_RIG);
  const boneErrMax: Record<string, number> = Object.fromEntries(BONE_IDS.map((b) => [b, 0]));
  const limbNames = ['nearLeg', 'farLeg', 'nearArm', 'farArm'] as const;
  const residualMax: Record<string, number> = Object.fromEntries(limbNames.map((l) => [l, 0]));
  const midDevMax: Record<string, number> = Object.fromEntries(limbNames.map((l) => [l, 0]));
  const midDevSumSq: Record<string, number> = Object.fromEntries(limbNames.map((l) => [l, 0]));
  const bendSidesSeen: Record<string, Set<number>> = Object.fromEntries(limbNames.map((l) => [l, new Set<number>()]));
  const clampedFrames: {frame: number; limb: string; kind: string; residual: number}[] = [];
  const boneProblems: string[] = [];
  const residualProblems: string[] = [];
  const bendProblems: string[] = [];
  const footProblems: string[] = [];
  let prevBend: Record<string, number> | null = null;
  let footLenMaxErr = 0;
  const perFrameRig: unknown[] = [];

  for (let f = 0; f < DURATION; f++) {
    const d = diagnosePose(solvePose(f));
    for (const id of BONE_IDS) {
      boneErrMax[id] = Math.max(boneErrMax[id], d.boneLengthError[id]);
      if (!(d.boneLengthError[id] <= BONE_LENGTH_TOLERANCE)) boneProblems.push(`frame ${f} ${id}: ${d.boneLengthError[id].toFixed(4)} px`);
    }
    for (const l of limbNames) {
      residualMax[l] = Math.max(residualMax[l], d.endResidual[l]);
      midDevMax[l] = Math.max(midDevMax[l], d.midDeviation[l]);
      midDevSumSq[l] += d.midDeviation[l] ** 2;
      bendSidesSeen[l].add(d.bendSide[l]);
      if (d.clamped[l] !== 'none') {
        clampedFrames.push({frame: f, limb: l, kind: d.clamped[l], residual: +d.endResidual[l].toFixed(4)});
      } else if (!(d.endResidual[l] <= IK_RESIDUAL_TOLERANCE)) {
        residualProblems.push(`frame ${f} ${l}: reachable residual ${d.endResidual[l].toFixed(4)} px`);
      }
      const expected = l.includes('Leg') ? RUNNER_RIG.legs.near.bendSign : RUNNER_RIG.arms.near.bendSign;
      if (d.bendSide[l] !== expected) bendProblems.push(`frame ${f} ${l}: side ${d.bendSide[l]} != hint ${expected}`);
      if (prevBend && d.bendSide[l] !== prevBend[l]) bendProblems.push(`flip ${f - 1}->${f} ${l}`);
    }
    prevBend = d.bendSide;
    footLenMaxErr = Math.max(footLenMaxErr, Math.abs(d.footLength.near - RUNNER_RIG.footLen), Math.abs(d.footLength.far - RUNNER_RIG.footLen));
    if (!(Math.abs(d.footLength.near - RUNNER_RIG.footLen) <= FOOT_LENGTH_TOLERANCE) || !(Math.abs(d.footLength.far - RUNNER_RIG.footLen) <= FOOT_LENGTH_TOLERANCE)) {
      footProblems.push(`frame ${f}: near ${d.footLength.near.toFixed(4)} far ${d.footLength.far.toFixed(4)}`);
    }
    perFrameRig.push({frame: f, boneLengthError: d.boneLengthError, endResidual: d.endResidual, midDeviation: d.midDeviation, bendSide: d.bendSide, clamped: d.clamped});
  }
  const worstBoneErr = Math.max(...Object.values(boneErrMax));
  const worstResidual = Math.max(...Object.values(residualMax));

  checks.push(check(`solved bone lengths within ±${BONE_LENGTH_TOLERANCE} px of configured rig lengths (94 frames x 8 bones)`, boneProblems.length === 0,
    boneProblems.length ? boneProblems.slice(0, 10).join('; ') : `worst error ${worstBoneErr.toExponential(3)} px (analytic solve; gate ±${BONE_LENGTH_TOLERANCE})`));
  checks.push(check(`IK end-effector residual <= ${IK_RESIDUAL_TOLERANCE} px for reachable targets; clamped targets reported`, residualProblems.length === 0,
    residualProblems.length ? residualProblems.slice(0, 10).join('; ') : `worst residual ${worstResidual.toExponential(3)} px; clamped frames: ${clampedFrames.length}${clampedFrames.length ? ' (see report)' : ''}`));
  checks.push(check('knee/elbow bend side stable and equal to rig hint (no flips incl. 25->26 wrap)', bendProblems.length === 0,
    bendProblems.length ? bendProblems.slice(0, 10).join('; ') : `knees ${[...bendSidesSeen.nearLeg]}, elbows ${[...bendSidesSeen.nearArm]} on all 94 frames`));
  checks.push(check(`foot artwork length constant at rig.footLen=${RUNNER_RIG.footLen} px (geometry, not a bone)`, footProblems.length === 0,
    footProblems.length ? footProblems.slice(0, 10).join('; ') : `max error ${footLenMaxErr.toExponential(3)} px`));

  // --- Solved segment statistics (ratios now ~1.000 by construction) ---------
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
  const statsOf = (pool: FrameJoints[]) => segDefs.map(([name, sel]) => {
    const lens = pool.map((j) => { const [a, b] = sel(j); return dist(a, b); });
    const min = Math.min(...lens), max = Math.max(...lens), mean = lens.reduce((s, v) => s + v, 0) / lens.length;
    return {segment: name, min: +min.toFixed(1), max: +max.toFixed(1), mean: +mean.toFixed(1), maxOverMin: +(max / min).toFixed(3)};
  });
  const segmentStats = statsOf(allJoints);

  // --- Diagnostic (NOT a gate): raw unconstrained track variation ------------
  // The historical Test I failure lives here. Three levels, measured separately:
  // raw hand-measured keys -> stored 26-sample LEG_CYCLE (build-time Catmull-Rom)
  // -> all 94 interpolated frames. The solver now absorbs this noise without
  // stretching bones; the numbers stay visible for comparison with the baseline.
  const rawAll: FrameJoints[] = [];
  for (let f = 0; f < DURATION; f++) rawAll.push(rawJoints(f));
  const rawSegmentStats = statsOf(rawAll);

  const legSampleJoints: FrameJoints[] = [];
  for (let s = 0; s < LEG_CYCLE.length; s++) {
    const k = LEG_CYCLE[s];
    const kf = LEG_CYCLE[(s + STEP) % LEG_CYCLE.length]; // far limb = near + 13 (symmetry trick)
    const base = rawJoints(0);
    legSampleJoints.push({
      ...base,
      nearKnee: add(k.knee, base.hip), nearAnkle: add(k.ankle, base.hip), nearToe: add(k.toe, base.hip),
      farKnee: add(kf.knee, base.hip), farAnkle: add(kf.ankle, base.hip), farToe: add(kf.toe, base.hip),
    });
  }
  const armSampleJoints: FrameJoints[] = [0, STEP].map((f) => {
    const base = rawJoints(f);
    const a = armPose(f, 0);
    const b = armPose(f, STEP);
    return {...base,
      nearElbow: add(a.elbow, base.shoulder), nearFist: add(a.fist, base.shoulder),
      farElbow: add(b.elbow, base.shoulder), farFist: add(b.fist, base.shoulder)};
  });
  const storedStats = segDefs.map(([name, sel]) => {
    const pool = name.includes('shoulder') || name.includes('elbow->fist') ? armSampleJoints : legSampleJoints;
    const lens = pool.map((j) => { const [a, b] = sel(j); return dist(a, b); });
    const min = Math.min(...lens), max = Math.max(...lens);
    const interp = rawSegmentStats.find((s) => s.segment === name)!;
    return {
      segment: name,
      storedMin: +min.toFixed(1), storedMax: +max.toFixed(1),
      storedMaxOverMin: +(max / min).toFixed(3),
      interpolatedMaxOverMin: interp.maxOverMin,
      interpolationOvershoot: +(interp.max / max).toFixed(3),
    };
  });
  const worstStored = Math.max(...storedStats.map((s) => s.storedMaxOverMin));
  const worstInterp = Math.max(...storedStats.map((s) => s.interpolatedMaxOverMin));
  const worstOvershoot = Math.max(...storedStats.map((s) => s.interpolationOvershoot));

  // Raw hand-measured keys — now exported read-only by keys.ts (Phase 1).
  const rawKeyStats = ([
    ['hip->knee', (k: {hip: Pt; knee: Pt}) => [k.hip, k.knee] as [Pt, Pt]],
    ['knee->ankle', (k: {knee: Pt; ankle: Pt}) => [k.knee, k.ankle] as [Pt, Pt]],
    ['ankle->toe', (k: {ankle: Pt; toe: Pt}) => [k.ankle, k.toe] as [Pt, Pt]],
  ] as [string, (k: {hip: Pt; knee: Pt; ankle: Pt; toe: Pt}) => [Pt, Pt]][]).map(([name, sel]) => {
    const lens = [...NEAR_LEG_RAW, ...FAR_LEG_RAW].map((k) => { const [a, b] = sel(k); return dist(a, b); });
    const min = Math.min(...lens), max = Math.max(...lens);
    return {segment: name, rawKeyMin: +min.toFixed(1), rawKeyMax: +max.toFixed(1), rawKeyMaxOverMin: +(max / min).toFixed(3)};
  });
  const worstRaw = Math.max(...rawKeyStats.map((s) => s.rawKeyMaxOverMin));

  // --- Smoothness: joint acceleration (2nd difference) ---------------------
  const accels: number[] = [];
  for (let f = 1; f + 1 < DURATION; f++) {
    let m = 0;
    for (const k of Object.keys(allJoints[0]) as (keyof FrameJoints)[]) {
      const a = allJoints[f - 1][k], b = allJoints[f][k], c = allJoints[f + 1][k];
      m = Math.max(m, Math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1]));
    }
    accels.push(m);
  }
  const as = [...accels].sort((a, b) => a - b);
  const ap95 = as[Math.floor(0.95 * (as.length - 1))];
  const wrapAccel = accels[LOOP - 2]; // acceleration centred on frame 25 (the wrap)
  checks.push(check(`joint motion is smooth at the wrap (accel ${wrapAccel.toFixed(1)}px <= ${POP_FACTOR} x p95 ${ap95.toFixed(1)}px)`, wrapAccel <= POP_FACTOR * ap95,
    `accel median=${as[Math.floor(as.length / 2)].toFixed(2)}px, p95=${ap95.toFixed(2)}px, max=${as[as.length - 1].toFixed(2)}px, wrap=${wrapAccel.toFixed(2)}px`));

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

  const failed = checks.filter((c) => c.status === 'FAIL');
  const findings = failed.map((c) => ({
    check: c.name,
    detail: c.detail,
    classification: 'UNEXPECTED — investigate. The constrained rig (rig.ts/ik.ts/pose.ts) should guarantee fixed bone lengths, stable bend side and reachable-target accuracy; a failure here is a regression or a rig/track defect, not the historical unconstrained-track finding.',
    regression: true,
    action: 'Stop, record failing frames/cases, and repair per master plan §14. Do not widen thresholds.',
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    scope: 'RunCycle procedural puppet (Phase 1 constrained rig), frames 0..93; cel selection monotonicity covered by remotion/test/cels.test.ts; solver edge cases by test/ik.test.ts + reports/ik-validation.json',
    tolerances: {
      solvedBoneLengthErrorPx: BONE_LENGTH_TOLERANCE,
      ikReachableResidualPx: IK_RESIDUAL_TOLERANCE,
      footArtworkLengthErrorPx: FOOT_LENGTH_TOLERANCE,
      wrapPopFactor: POP_FACTOR,
      pixelThumb: '96x54 grayscale-free RGB MAD',
    },
    checks,
    solvedRig: {
      rigId: RUNNER_RIG.id,
      configuredBoneLengths: cfg,
      boneLengthErrorMax: Object.fromEntries(BONE_IDS.map((b) => [b, +boneErrMax[b].toExponential(4)])),
      worstBoneLengthErrorPx: +worstBoneErr.toExponential(4),
      endResidualMax: Object.fromEntries(limbNames.map((l) => [l, +residualMax[l].toExponential(4)])),
      clampedFrames,
      midDeviationFromRawTargets: {
        note: 'Expected nonzero: raw knee/elbow readings are noisy hand measurements (hip->knee varies 1.958x). The solver prioritizes end-effector accuracy + fixed bone lengths. Per-frame values below — never hidden.',
        max: Object.fromEntries(limbNames.map((l) => [l, +midDevMax[l].toFixed(2)])),
        rms: Object.fromEntries(limbNames.map((l) => [l, +Math.sqrt(midDevSumSq[l] / DURATION).toFixed(2)])),
      },
      bendSides: Object.fromEntries(limbNames.map((l) => [l, [...bendSidesSeen[l]]])),
      footArtworkLength: {configured: RUNNER_RIG.footLen, maxErrorPx: +footLenMaxErr.toExponential(4)},
      perFrame: perFrameRig,
    },
    segmentLengthStats: segmentStats,
    segmentLengthStatsNote: 'SOLVED joints (what renders). Constrained bones have ratio ~1.000 by construction; ankle->toe is constant foot artwork. The historical unconstrained variation is preserved below and in reports/baseline/.',
    rawTrackSegmentLengthStats: rawSegmentStats,
    segmentLengthOrigin: {
      note: 'DIAGNOSTIC ONLY (not a gate since Phase 1). Three levels of the RAW unconstrained track, measured separately: rawMeasuredKeys (7 hand-measured poses per leg, exported read-only by keys.ts) -> storedTrack (26-sample LEG_CYCLE after build-time Catmull-Rom) -> interpolatedFrames (all 94). interpolationOvershoot = interpolated max / stored max. The constrained solver absorbs this noise without stretching bones.',
      rawMeasuredKeys: rawKeyStats,
      worstRawMeasuredKeyMaxOverMin: worstRaw,
      perSegment: storedStats,
      worstStoredMaxOverMin: +worstStored.toFixed(3),
      worstInterpolatedMaxOverMin: +worstInterp.toFixed(3),
      worstInterpolationOvershoot: +worstOvershoot.toFixed(3),
    },
    historicalBaseline: {
      commit: '5d4d13ab92ac38be0397bd2b8feb27e19eefdf98',
      oldPrimaryGate: 'limb segment length max/min <= 2.0 (unconstrained puppet)',
      oldResult: 'FAIL 7/8 checks; worst ratio 2.891x knee->ankle',
      preservedIn: 'reports/baseline/motion-validation.json (verbatim) + reports/puppet-upgrade-baseline.json',
      replacedBy: 'per-bone configured-length error ±0.5 px + IK residual + bend stability (master plan §9.7)',
    },
    adjacentJointDeltaPx: {median: +sorted[Math.floor(sorted.length / 2)].toFixed(2), p95: +p95.toFixed(2), max: +sorted[sorted.length - 1].toFixed(2), wrap25to26: +wrapDelta.toFixed(2)},
    jointAccelerationPx: {median: +as[Math.floor(as.length / 2)].toFixed(2), p95: +ap95.toFixed(2), max: +as[as.length - 1].toFixed(2), wrap25to26: +wrapAccel.toFixed(2)},
    adjacentPixelMad: {median: +ms[Math.floor(ms.length / 2)].toFixed(3), p95: +mp95.toFixed(3), max: +ms[ms.length - 1].toFixed(3), wrap25to26: +wrapMad.toFixed(3)},
    notPresent_futureWork: [
      'true IK stance-locking (Phase 2 — not implemented yet)',
      'measured foot-contact solver / verified contact track (Phase 2 — baseline candidates are UNCERTAIN)',
      'cohesive limb/torso/foot silhouettes + deterministic scarf chain (Phase 3)',
      'second character variant (Phase 4)',
    ],
    findings,
    summary: {total: checks.length, passed: checks.length - failed.length, failed: failed.length, failedChecks: failed.map((c) => c.name)},
    status: failed.length === 0 ? 'PASS' : 'FAIL',
  };
  fs.mkdirSync(path.join(ROOT, 'reports'), {recursive: true});
  fs.writeFileSync(path.join(ROOT, 'reports', 'motion-validation.json'), JSON.stringify(report, null, 2));
  for (const c of checks) console.log(`[${c.status}] ${c.name} — ${c.detail}`);
  console.log(`\nraw-track diagnostic (not a gate): raw keys max/min=${worstRaw}, stored track max/min=${worstStored.toFixed(3)}, interpolated max/min=${worstInterp.toFixed(3)}, frame-interp overshoot=${worstOvershoot.toFixed(3)}x`);
  for (const f of findings) console.log(`\nFINDING: ${f.check}\n  ${f.classification}`);
  console.log(`\nTest I motion: ${report.status} (${report.summary.passed}/${report.summary.total} checks pass)`);
  process.exit(report.status === 'PASS' ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
