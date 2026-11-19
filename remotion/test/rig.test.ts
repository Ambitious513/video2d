/**
 * Phase 1 unit tests — rig definition + bone-length calibration (master plan
 * §5.1). Proves the stored RUNNER_RIG constants are exactly reproducible from
 * the raw measured keys via the documented calibration method, that every
 * measured end-effector target is reachable with the calibrated lengths, and
 * that the attachment anchors still match the pre-upgrade puppet geometry.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  RUNNER_RIG, calibrateRunnerRig, boneLengths, BONE_IDS, REACH_MARGIN,
} from '../src/puppet/rig';
import {NEAR_LEG_RAW, FAR_LEG_RAW, ARM_FWD, ARM_BACK, armPose, LOOP, HIP_X, HEAD_X, HEAD_R} from '../src/puppet/keys';
import {solveTwoBone, type Pt} from '../src/puppet/ik';

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('stored rig constants == calibrateRunnerRig() output (exact reproducibility, 1e-9)', () => {
  const cal = calibrateRunnerRig();
  assert.ok(Math.abs(RUNNER_RIG.legs.near.upper - cal.upperLeg) <= 1e-9, `upperLeg stored ${RUNNER_RIG.legs.near.upper} vs calibrated ${cal.upperLeg}`);
  assert.ok(Math.abs(RUNNER_RIG.legs.near.lower - cal.lowerLeg) <= 1e-9, `lowerLeg stored ${RUNNER_RIG.legs.near.lower} vs calibrated ${cal.lowerLeg}`);
  assert.ok(Math.abs(RUNNER_RIG.arms.near.upper - cal.upperArm) <= 1e-9, `upperArm stored ${RUNNER_RIG.arms.near.upper} vs calibrated ${cal.upperArm}`);
  assert.ok(Math.abs(RUNNER_RIG.arms.near.lower - cal.lowerArm) <= 1e-9, `lowerArm stored ${RUNNER_RIG.arms.near.lower} vs calibrated ${cal.lowerArm}`);
  assert.ok(Math.abs(RUNNER_RIG.footLen - cal.footLen) <= 1e-9, `footLen stored ${RUNNER_RIG.footLen} vs calibrated ${cal.footLen}`);
});

test('calibration is deterministic (repeat call deeply identical)', () => {
  assert.deepEqual(calibrateRunnerRig(), calibrateRunnerRig());
});

test('documented calibration evidence reproduces (spans, knee deviation stats)', () => {
  const cal = calibrateRunnerRig();
  // Values documented in rig.ts header + Phase 1 report; tolerance covers the
  // 0.01 rounding of the published numbers only.
  assert.ok(Math.abs(cal.maxLegSpan - 363.32) <= 0.01, `maxLegSpan ${cal.maxLegSpan}`);
  assert.ok(Math.abs(cal.maxArmSpan - 205.65) <= 0.01, `maxArmSpan ${cal.maxArmSpan}`);
  assert.ok(Math.abs(cal.legKneeRmsDeviation - 54.64) <= 0.05, `knee rms ${cal.legKneeRmsDeviation}`);
  assert.ok(Math.abs(cal.legKneeMaxDeviation - 73.9) <= 0.05, `knee max ${cal.legKneeMaxDeviation}`);
  // total leg length = max measured span + documented reach margin
  assert.ok(Math.abs(cal.upperLeg + cal.lowerLeg - (cal.maxLegSpan + REACH_MARGIN)) <= 0.011);
});

test('every raw measured ankle target is reachable with the calibrated leg bones', () => {
  const {upper, lower} = RUNNER_RIG.legs.near;
  for (const p of [...NEAR_LEG_RAW, ...FAR_LEG_RAW]) {
    const sol = solveTwoBone(p.hip, p.ankle, upper, lower, -1);
    assert.equal(sol.clamped, 'none', `raw pose hip=${p.hip} ankle=${p.ankle} unreachable`);
    assert.ok(sol.residual <= 1e-9);
  }
});

test('every fist target over the 26-frame arm swing (incl. mid-swing bulge) is reachable', () => {
  const {upper, lower} = RUNNER_RIG.arms.near;
  for (let f = 0; f < LOOP; f++) {
    const a = armPose(f, 0);
    const sol = solveTwoBone([0, 0], a.fist, upper, lower, 1);
    assert.equal(sol.clamped, 'none', `frame ${f} fist ${a.fist} unreachable`);
  }
  // the two measured extremes themselves
  for (const ext of [ARM_FWD, ARM_BACK]) {
    assert.equal(solveTwoBone([0, 0], ext.fist, upper, lower, 1).clamped, 'none');
  }
});

test('boneLengths covers all 8 constrained bones with finite positive values; feet excluded', () => {
  const cfg = boneLengths(RUNNER_RIG);
  assert.equal(BONE_IDS.length, 8);
  for (const id of BONE_IDS) {
    assert.ok(Number.isFinite(cfg[id]) && cfg[id] > 0, `${id} = ${cfg[id]}`);
  }
  assert.ok(!('foot' in cfg) && !('nearFoot' in cfg));
  // runner is left/right symmetric
  assert.equal(cfg.nearThigh, cfg.farThigh);
  assert.equal(cfg.nearCalf, cfg.farCalf);
  assert.equal(cfg.nearUpperArm, cfg.farUpperArm);
  assert.equal(cfg.nearForearm, cfg.farForearm);
});

test('bend-side hints: knees -1 (front), elbows +1 (trailing) — fixed convention', () => {
  assert.equal(RUNNER_RIG.legs.near.bendSign, -1);
  assert.equal(RUNNER_RIG.legs.far.bendSign, -1);
  assert.equal(RUNNER_RIG.arms.near.bendSign, 1);
  assert.equal(RUNNER_RIG.arms.far.bendSign, 1);
});

test('attachment anchors match the pre-upgrade puppet geometry (no silent drift)', () => {
  const a = RUNNER_RIG.anchors;
  assert.equal(a.hipX, HIP_X);
  assert.equal(a.headX, HEAD_X);
  assert.equal(a.headR, HEAD_R);
  // literal anchors from the pre-upgrade Runner.tsx (baseline 5d4d13a)
  assert.deepEqual(a.shoulder, {x: 922, dyFromHead: 154});
  assert.deepEqual(a.scarfKnot, {x: 940, dyFromHead: 112});
  assert.deepEqual(a.backpack, {x: 818, dyFromHead: 222});
  assert.deepEqual(a.neckTop, {dxFromHead: -18, dyFromHead: 62});
});

test('raw measured keys are preserved untouched (reference data, 7 poses per leg)', () => {
  assert.equal(NEAR_LEG_RAW.length, 7);
  assert.equal(FAR_LEG_RAW.length, 7);
  // spot-check the first/last literals against the historical measurement record
  assert.deepEqual(NEAR_LEG_RAW[0].hip, [868, 592]);
  assert.deepEqual(NEAR_LEG_RAW[0].knee, [688, 748]);
  assert.deepEqual(FAR_LEG_RAW[6].toe, [532, 755]);
  assert.deepEqual(ARM_FWD, {elbow: [50, 106], fist: [166, 45]});
  assert.deepEqual(ARM_BACK, {elbow: [-67, 93], fist: [-134, 156]});
});

test('foot artwork length is the median of the 14 raw ankle->toe readings', () => {
  const lens = [...NEAR_LEG_RAW, ...FAR_LEG_RAW].map((p) => dist(p.ankle, p.toe)).sort((x, y) => x - y);
  const median = (lens[6] + lens[7]) / 2;
  assert.ok(Math.abs(RUNNER_RIG.footLen - Math.round(median * 100) / 100) <= 1e-9);
});
