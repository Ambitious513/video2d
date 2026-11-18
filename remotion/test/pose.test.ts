/**
 * Phase 1 unit tests — constrained pose evaluator (master plan §5.2, §5.5,
 * §9.3). All 94 timeline frames are checked for fixed bone lengths, finite
 * in-bounds joints, stable bend side, raw-target preservation, constant foot
 * artwork length, and deterministic out-of-order evaluation.
 *
 * Measured Phase 1 facts these tests lock in (reports/ik-validation.json):
 *   - every raw ankle/fist target is REACHABLE on all 94 frames (0 clamps);
 *   - max configured-vs-solved bone error ~1.4e-13 px (analytic solve);
 *   - bend sides constant: knees -1, elbows +1, including the 25->26 wrap.
 * The ±0.5 px master gate is asserted here at a numerically justified tighter
 * tolerance (1e-6) because the solver is exact analytic law-of-cosines.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {solvePose, diagnosePose, solveLimb, type SolvedPose} from '../src/puppet/pose';
import {RUNNER_RIG, boneLengths, BONE_IDS, type RigDefinition} from '../src/puppet/rig';
import {mirrorX, type Pt} from '../src/puppet/ik';
import {DURATION, LOOP, cycleSample, LEG_CYCLE, armPose} from '../src/puppet/keys';

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const add = (p: Pt, o: Pt): Pt => [p[0] + o[0], p[1] + o[1]];
const BONE_TOL = 1e-6; // justified tight tolerance; master gate is ±0.5 px

function allPoints(p: SolvedPose): [string, Pt][] {
  return [
    ['hip', p.hip], ['head', p.head], ['shoulder', p.shoulder], ['knot', p.knot],
    ['pack', p.pack], ['neckTop', p.neckTop],
    ['nearKnee', p.nearLeg.knee], ['nearAnkle', p.nearLeg.ankle], ['nearToe', p.nearLeg.toe],
    ['farKnee', p.farLeg.knee], ['farAnkle', p.farLeg.ankle], ['farToe', p.farLeg.toe],
    ['nearElbow', p.nearArm.elbow], ['nearFist', p.nearArm.fist],
    ['farElbow', p.farArm.elbow], ['farFist', p.farArm.fist],
  ];
}

test('all 94 frames: every constrained bone within 1e-6 px of its configured length', () => {
  let worst = 0;
  for (let f = 0; f < DURATION; f++) {
    const d = diagnosePose(solvePose(f));
    for (const id of BONE_IDS) {
      assert.ok(Number.isFinite(d.boneLengthError[id]));
      worst = Math.max(worst, d.boneLengthError[id]);
      assert.ok(d.boneLengthError[id] <= BONE_TOL, `frame ${f} ${id}: error ${d.boneLengthError[id]}`);
    }
  }
  assert.ok(worst <= BONE_TOL, `worst bone error ${worst}`);
});

test('all 94 frames: every joint finite and inside the 1920x1080 canvas', () => {
  for (let f = 0; f < DURATION; f++) {
    for (const [name, p] of allPoints(solvePose(f))) {
      assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), `frame ${f} ${name} non-finite`);
      assert.ok(p[0] >= 0 && p[0] <= 1920 && p[1] >= 0 && p[1] <= 1080, `frame ${f} ${name}=(${p}) out of bounds`);
    }
  }
});

test('all 94 frames: every raw end target reachable (0 clamps), residual ~ 0', () => {
  for (let f = 0; f < DURATION; f++) {
    const d = diagnosePose(solvePose(f));
    for (const limb of ['nearLeg', 'farLeg', 'nearArm', 'farArm'] as const) {
      assert.equal(d.clamped[limb], 'none', `frame ${f} ${limb} clamped: ${d.clamped[limb]}`);
      assert.ok(d.endResidual[limb] <= 1e-9, `frame ${f} ${limb} residual ${d.endResidual[limb]}`);
    }
  }
});

test('bend side equals the rig hint on every frame; no flips incl. the 25->26 wrap', () => {
  let prev: Record<string, number> | null = null;
  for (let f = 0; f < DURATION; f++) {
    const d = diagnosePose(solvePose(f));
    assert.equal(d.bendSide.nearLeg, -1, `frame ${f} near knee`);
    assert.equal(d.bendSide.farLeg, -1, `frame ${f} far knee`);
    assert.equal(d.bendSide.nearArm, 1, `frame ${f} near elbow`);
    assert.equal(d.bendSide.farArm, 1, `frame ${f} far elbow`);
    if (prev) {
      for (const k of Object.keys(d.bendSide) as (keyof typeof d.bendSide)[]) {
        assert.equal(d.bendSide[k], prev[k], `bend flip at frame ${f - 1}->${f} (${k})`);
      }
    }
    prev = d.bendSide;
  }
  // explicit cycle-wrap check (gait period 26; the 94-frame clip itself is not cyclic)
  const a = diagnosePose(solvePose(LOOP - 1));
  const b = diagnosePose(solvePose(LOOP));
  assert.deepEqual(a.bendSide, b.bendSide);
});

test('determinism: out-of-order frame requests produce identical poses', () => {
  const order = [72, 0, 45, 12, 93, 25];
  const first = order.map((f) => solvePose(f));
  // interleave other frames, then request the same order again
  for (const f of [3, 17, 88, 51]) solvePose(f);
  const second = order.map((f) => solvePose(f));
  for (let i = 0; i < order.length; i++) {
    assert.deepEqual(second[i], first[i], `frame ${order[i]} differs on re-evaluation`);
  }
  // and a fresh solve after everything still matches
  assert.deepEqual(solvePose(72), first[0]);
});

test('raw measured targets are preserved exactly alongside solved joints', () => {
  for (let f = 0; f < DURATION; f++) {
    const p = solvePose(f);
    const nl = cycleSample(LEG_CYCLE, f);
    const fl = cycleSample(LEG_CYCLE, f + 13);
    const na = armPose(f, 0);
    const fa = armPose(f, 13);
    assert.deepEqual(p.nearLeg.rawKnee, add(nl.knee, p.hip), `frame ${f} near rawKnee`);
    assert.deepEqual(p.nearLeg.rawAnkle, add(nl.ankle, p.hip), `frame ${f} near rawAnkle`);
    assert.deepEqual(p.nearLeg.rawToe, add(nl.toe, p.hip), `frame ${f} near rawToe`);
    assert.deepEqual(p.farLeg.rawAnkle, add(fl.ankle, p.hip), `frame ${f} far rawAnkle`);
    assert.deepEqual(p.nearArm.rawElbow, add(na.elbow, p.shoulder), `frame ${f} near rawElbow`);
    assert.deepEqual(p.nearArm.rawFist, add(na.fist, p.shoulder), `frame ${f} near rawFist`);
    assert.deepEqual(p.farArm.rawFist, add(fa.fist, p.shoulder), `frame ${f} far rawFist`);
  }
});

test('foot artwork length is constant (rig.footLen) on every frame; direction is unit', () => {
  for (let f = 0; f < DURATION; f++) {
    const p = solvePose(f);
    const d = diagnosePose(p);
    assert.ok(Math.abs(d.footLength.near - RUNNER_RIG.footLen) <= 1e-6, `frame ${f} near foot ${d.footLength.near}`);
    assert.ok(Math.abs(d.footLength.far - RUNNER_RIG.footLen) <= 1e-6, `frame ${f} far foot ${d.footLength.far}`);
    for (const leg of [p.nearLeg, p.farLeg]) {
      assert.ok(Math.abs(Math.hypot(leg.footDirection[0], leg.footDirection[1]) - 1) <= 1e-9);
      // toe extends from the SOLVED ankle along the raw intent direction
      assert.ok(dist(leg.toe, add(leg.ankle, [leg.footDirection[0] * RUNNER_RIG.footLen, leg.footDirection[1] * RUNNER_RIG.footLen])) <= 1e-9);
    }
  }
});

test('mid-joint deviation from noisy raw targets is reported, finite, and bounded by evidence', () => {
  // Measured Phase 1 maxima (reports/ik-validation.json): knees 141.05 px,
  // elbows 45.18 px. The raw knee readings are noisy (hip->knee varies 1.96x);
  // the solver deliberately prioritizes ankle accuracy + fixed bone lengths.
  // This guard catches silent worsening, not the documented deviation itself.
  let maxKnee = 0, maxElbow = 0;
  for (let f = 0; f < DURATION; f++) {
    const d = diagnosePose(solvePose(f));
    maxKnee = Math.max(maxKnee, d.midDeviation.nearLeg, d.midDeviation.farLeg);
    maxElbow = Math.max(maxElbow, d.midDeviation.nearArm, d.midDeviation.farArm);
  }
  assert.ok(maxKnee <= 141.1, `knee deviation grew: ${maxKnee}`);
  assert.ok(maxElbow <= 45.2, `elbow deviation grew: ${maxElbow}`);
});

test('mirrored facing through solveLimb: mirror x + flip bend hint -> mirrored joints', () => {
  const axis = 960;
  const p = solvePose(34);
  for (const [leg, def] of [[p.nearLeg, RUNNER_RIG.legs.near], [p.farLeg, RUNNER_RIG.legs.far]] as const) {
    const mir = solveLimb(mirrorX(leg.hip, axis), mirrorX(leg.rawAnkle, axis), {...def, bendSign: -def.bendSign as 1 | -1});
    assert.ok(dist(mirrorX(leg.knee, axis), mir.mid) <= 1e-9);
    assert.ok(dist(mirrorX(leg.ankle, axis), mir.end) <= 1e-9);
  }
  for (const [arm, def] of [[p.nearArm, RUNNER_RIG.arms.near], [p.farArm, RUNNER_RIG.arms.far]] as const) {
    const mir = solveLimb(mirrorX(arm.shoulder, axis), mirrorX(arm.rawFist, axis), {...def, bendSign: -def.bendSign as 1 | -1});
    assert.ok(dist(mirrorX(arm.elbow, axis), mir.mid) <= 1e-9);
    assert.ok(dist(mirrorX(arm.fist, axis), mir.end) <= 1e-9);
  }
});

test('shared evaluator honors a different rig profile (no hardcoded lengths)', () => {
  const alt: RigDefinition = {
    ...RUNNER_RIG,
    id: 'test-alt-proportions',
    legs: {
      near: {upper: 150, lower: 213.82, bendSign: -1},
      far: {upper: 200, lower: 163.82, bendSign: -1},
    },
  };
  const cfg = boneLengths(alt);
  for (const f of [0, 12, 25, 26, 34, 72, 93]) {
    const p = solvePose(f, alt);
    const d = diagnosePose(p, alt);
    assert.equal(p.rigId, 'test-alt-proportions');
    for (const id of BONE_IDS) {
      assert.ok(d.boneLengthError[id] <= BONE_TOL, `alt rig frame ${f} ${id}: ${d.boneLengthError[id]} vs ${cfg[id]}`);
    }
    // different proportions -> different knee position than the runner rig
    const base = solvePose(f);
    assert.ok(dist(p.nearLeg.knee, base.nearLeg.knee) > 1, `frame ${f}: alt rig produced identical knee`);
  }
});

test('fractional frames evaluate cleanly (pure function of frame, not integer-only)', () => {
  for (const f of [0.5, 12.25, 25.999, 93.5]) {
    const p = solvePose(f);
    const d = diagnosePose(p);
    for (const [name, pt] of allPoints(p)) {
      assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]), `f=${f} ${name}`);
    }
    for (const id of BONE_IDS) assert.ok(d.boneLengthError[id] <= BONE_TOL, `f=${f} ${id}`);
  }
});
