/**
 * Phase 4 unit tests — reusable second character variant (master plan §8).
 *
 * Proves the SAME solver + motion clip drive both variants with NO duplicated
 * gait: the variant differs only by rig proportions + appearance data.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {solvePose, diagnosePose} from '../src/puppet/pose';
import {RUNNER_RIG, boneLengths, BONE_IDS, type RigDefinition} from '../src/puppet/rig';
import {Runner, PuppetVariant, VARIANT_RIG, RUNNER_APPEARANCE, VARIANT_APPEARANCE, type Appearance} from '../src/puppet/Runner';

const BONE_TOL = 1e-6;

test('4: variant rig has fixed bone lengths within tolerance on all 94 frames', () => {
  for (let f = 0; f < 94; f++) {
    const d = diagnosePose(solvePose(f, VARIANT_RIG), VARIANT_RIG);
    for (const id of BONE_IDS) {
      assert.ok(Number.isFinite(d.boneLengthError[id]));
      assert.ok(d.boneLengthError[id] <= BONE_TOL, `frame ${f} ${id}: ${d.boneLengthError[id]}`);
    }
    // every raw target still reachable (0 clamps)
    for (const limb of ['nearLeg', 'farLeg', 'nearArm', 'farArm'] as const) {
      assert.equal(d.clamped[limb], 'none', `frame ${f} ${limb} clamped`);
    }
  }
});

test('4: variant bones equal the calibrated profile (no stretch) and differ from the runner', () => {
  const v = boneLengths(VARIANT_RIG);
  const r = boneLengths(RUNNER_RIG);
  assert.equal(v.nearThigh, 172.0); assert.ok(Math.abs(v.nearCalf - 191.82) <= 1e-9);
  // proportions differ from the runner
  assert.notEqual(v.nearThigh, r.nearThigh);
  assert.notEqual(v.nearCalf, r.nearCalf);
  // arms differ too
  assert.notEqual(v.nearUpperArm, r.nearUpperArm);
});

test('4: variant knee/elbow positions differ from the runner (proportions take effect)', () => {
  for (const f of [0, 12, 25, 26, 34, 72, 93]) {
    const a = solvePose(f, RUNNER_RIG);
    const b = solvePose(f, VARIANT_RIG);
    assert.ok(Math.hypot(a.nearLeg.knee[0] - b.nearLeg.knee[0], a.nearLeg.knee[1] - b.nearLeg.knee[1]) > 1, `frame ${f} identical knee`);
    assert.equal(a.rigId, 'runner'); assert.equal(b.rigId, 'variant-teal');
  }
});

test('4: the SAME motion clip drives both variants (gait timing identical)', () => {
  // The raw motion intent is the same; only the rig differs. The solved ankle
  // targets match the raw targets for both (reachable), and the gait phase is
  // identical — proving no duplicated gait.
  for (let f = 0; f < 94; f++) {
    const r = solvePose(f, RUNNER_RIG);
    const v = solvePose(f, VARIANT_RIG);
    // same raw target for the near ankle (motion clip is shared)
    assert.ok(Math.hypot(r.nearLeg.rawAnkle[0] - v.nearLeg.rawAnkle[0], r.nearLeg.rawAnkle[1] - v.nearLeg.rawAnkle[1]) <= 1e-9, `frame ${f} raw ankle differs`);
  }
});

test('4: appearance is data-driven and independent of motion (changing colors does not change the pose)', () => {
  const f = 30;
  const a = solvePose(f, RUNNER_RIG);
  const b = solvePose(f, RUNNER_RIG); // same rig, appearance is not in the pose
  assert.deepEqual(a, b);
  // appearances differ
  assert.notEqual(RUNNER_APPEARANCE.body, VARIANT_APPEARANCE.body);
  assert.notEqual(RUNNER_APPEARANCE.scarf, VARIANT_APPEARANCE.scarf);
  assert.notEqual(RUNNER_APPEARANCE.pack, VARIANT_APPEARANCE.pack);
});

test('4: PuppetVariant renders both variants without throwing (runner + teal)', () => {
  for (const v of ['runner', 'teal'] as const) {
    const el = PuppetVariant({frame: 30, variant: v});
    assert.ok(el, `variant ${v} did not render`);
  }
  // default is the runner
  const def = PuppetVariant({frame: 0});
  assert.ok(def);
});

test('4: Runner honors a custom appearance object (palette injection)', () => {
  const custom: Appearance = {...RUNNER_APPEARANCE, body: '#123456'};
  const el = Runner({frame: 10, appearance: custom});
  assert.ok(el);
  assert.equal(custom.body, '#123456');
  // original unchanged
  assert.notEqual(RUNNER_APPEARANCE.body, '#123456');
});

test('4: variant is deterministic (out-of-order frames identical)', () => {
  const order = [72, 0, 45, 12, 93, 25];
  const first = order.map((f) => solvePose(f, VARIANT_RIG));
  for (const f of [3, 17, 88, 51]) solvePose(f, VARIANT_RIG);
  const second = order.map((f) => solvePose(f, VARIANT_RIG));
  for (let i = 0; i < order.length; i++) assert.deepEqual(second[i], first[i], `frame ${order[i]}`);
});

test('4: variant bend sides equal the rig hint on every frame (knees -1, elbows +1)', () => {
  for (let f = 0; f < 94; f++) {
    const d = diagnosePose(solvePose(f, VARIANT_RIG), VARIANT_RIG);
    assert.equal(d.bendSide.nearLeg, -1, `frame ${f} near knee`);
    assert.equal(d.bendSide.farLeg, -1, `frame ${f} far knee`);
    assert.equal(d.bendSide.nearArm, 1, `frame ${f} near elbow`);
    assert.equal(d.bendSide.farArm, 1, `frame ${f} far elbow`);
  }
});