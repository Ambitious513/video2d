/**
 * Phase 1 unit tests — generic two-bone IK solver (master plan §9.1).
 *
 * Covers: natural reach, exact max reach, beyond-max clamp, below-min clamp,
 * coincident root / zero-length direction, both bend sides, mirrored facing,
 * near-straight and folded configurations, repeat-evaluation determinism,
 * invalid-input rejection, and a seeded random sweep proving fixed bone
 * lengths + stable bend side for arbitrary targets.
 *
 * Conventions under test (ik.ts header — fixed, do not silently change):
 *   bendSign = sign of cross(root->target, root->mid), y-down canvas coords.
 *   Annulus clamp [|l1-l2|+EPS, l1+l2-EPS]; `end` is the point actually
 *   reached; `residual` = |requested target - end| (0 when reachable).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {solveTwoBone, bendSideOf, mirrorX, IK_EPS, type Pt, type IkSolution} from '../src/puppet/ik';

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// Runner leg lengths — the solver is generic; any positive pair behaves the same.
const L1 = 186.0;
const L2 = 177.82;
const ROOT: Pt = [864, 600];

/** Every solution must be finite and preserve both bone lengths exactly. */
function assertValidChain(sol: IkSolution, root: Pt, l1: number, l2: number, tol = 1e-6) {
  for (const p of [sol.mid, sol.end]) {
    assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), `non-finite joint: ${p}`);
  }
  assert.ok(Number.isFinite(sol.residual) && Number.isFinite(sol.targetDistance) && Number.isFinite(sol.solvedDistance));
  assert.ok(Math.abs(dist(root, sol.mid) - l1) <= tol, `bone1 length ${dist(root, sol.mid)} != ${l1}`);
  assert.ok(Math.abs(dist(sol.mid, sol.end) - l2) <= tol, `bone2 length ${dist(sol.mid, sol.end)} != ${l2}`);
}

test('reachable target at a natural distance: exact lengths, zero residual, end == target', () => {
  const target: Pt = [700, 850]; // dist ~299, well inside the annulus
  for (const sign of [1, -1] as const) {
    const sol = solveTwoBone(ROOT, target, L1, L2, sign);
    assertValidChain(sol, ROOT, L1, L2);
    assert.equal(sol.clamped, 'none');
    assert.ok(sol.residual <= 1e-9, `residual ${sol.residual}`);
    assert.ok(dist(sol.end, target) <= 1e-9);
    assert.equal(bendSideOf(ROOT, sol.mid, sol.end), sign);
  }
});

test('target exactly at maximum reach: safe near-straight solve, residual ~ EPS', () => {
  const dir: Pt = [0.6, 0.8];
  const target: Pt = [ROOT[0] + dir[0] * (L1 + L2), ROOT[1] + dir[1] * (L1 + L2)];
  const sol = solveTwoBone(ROOT, target, L1, L2, -1);
  assertValidChain(sol, ROOT, L1, L2);
  assert.equal(sol.clamped, 'max'); // EPS margin keeps the bend side non-degenerate
  assert.ok(sol.residual <= 2 * IK_EPS + 1e-9, `residual ${sol.residual}`);
  assert.equal(bendSideOf(ROOT, sol.mid, sol.end), -1);
});

test('target slightly beyond maximum reach: clamps safely onto the reach ray', () => {
  const overshoot = 25;
  const target: Pt = [ROOT[0] + (L1 + L2 + overshoot), ROOT[1]];
  const sol = solveTwoBone(ROOT, target, L1, L2, -1);
  assertValidChain(sol, ROOT, L1, L2);
  assert.equal(sol.clamped, 'max');
  assert.ok(Math.abs(sol.solvedDistance - (L1 + L2 - IK_EPS)) <= 1e-9);
  assert.ok(Math.abs(sol.residual - (overshoot + IK_EPS)) <= 1e-6, `residual ${sol.residual}`);
  // end stays on the root->target ray (direction preserved, never sideways)
  assert.ok(Math.abs(sol.end[1] - ROOT[1]) <= 1e-9);
  assert.ok(sol.end[0] > ROOT[0]);
});

test('target closer than minimum reach: clamps safely, no division blow-up', () => {
  const target: Pt = [ROOT[0] + 1, ROOT[1] + 0.5]; // dist ~1.12 << |L1-L2| = 8.18
  const sol = solveTwoBone(ROOT, target, L1, L2, -1);
  assertValidChain(sol, ROOT, L1, L2);
  assert.equal(sol.clamped, 'min');
  assert.ok(Math.abs(sol.solvedDistance - (Math.abs(L1 - L2) + IK_EPS)) <= 1e-9);
  assert.ok(sol.residual > 0);
  assert.equal(bendSideOf(ROOT, sol.mid, sol.end), -1);
});

test('target coincident with root: deterministic +x fallback, never NaN', () => {
  const sol = solveTwoBone(ROOT, [...ROOT] as Pt, L1, L2, -1);
  assertValidChain(sol, ROOT, L1, L2);
  assert.equal(sol.targetDistance, 0);
  assert.equal(sol.clamped, 'min');
  // documented fallback: direction +x, end at minReach along +x
  assert.ok(Math.abs(sol.end[0] - (ROOT[0] + Math.abs(L1 - L2) + IK_EPS)) <= 1e-9);
  assert.ok(Math.abs(sol.end[1] - ROOT[1]) <= 1e-9);
  const again = solveTwoBone(ROOT, [...ROOT] as Pt, L1, L2, -1);
  assert.deepEqual(again, sol);
});

test('bend-left and bend-right pole hints place the mid joint on opposite sides', () => {
  const target: Pt = [900, 900];
  const a = solveTwoBone(ROOT, target, L1, L2, 1);
  const b = solveTwoBone(ROOT, target, L1, L2, -1);
  assertValidChain(a, ROOT, L1, L2);
  assertValidChain(b, ROOT, L1, L2);
  assert.equal(bendSideOf(ROOT, a.mid, a.end), 1);
  assert.equal(bendSideOf(ROOT, b.mid, b.end), -1);
  // the two mids are mirror images across the root->target line
  const midOfMids: Pt = [(a.mid[0] + b.mid[0]) / 2, (a.mid[1] + b.mid[1]) / 2];
  const ux = (target[0] - ROOT[0]) / dist(ROOT, target);
  const uy = (target[1] - ROOT[1]) / dist(ROOT, target);
  const offAxis = (midOfMids[0] - ROOT[0]) * -uy + (midOfMids[1] - ROOT[1]) * ux;
  assert.ok(Math.abs(offAxis) <= 1e-6, `midpoint off the axis by ${offAxis}`);
  assert.ok(dist(a.mid, b.mid) > 1); // genuinely different sides
});

test('mirrored facing: mirror x and flip bendSign -> mirrored solution', () => {
  const axis = 960;
  const target: Pt = [700, 850];
  const orig = solveTwoBone(ROOT, target, L1, L2, -1);
  const mir = solveTwoBone(mirrorX(ROOT, axis), mirrorX(target, axis), L1, L2, 1);
  assertValidChain(mir, mirrorX(ROOT, axis), L1, L2);
  assert.ok(dist(mirrorX(orig.mid, axis), mir.mid) <= 1e-9);
  assert.ok(dist(mirrorX(orig.end, axis), mir.end) <= 1e-9);
  assert.equal(mir.clamped, orig.clamped);
});

test('near-straight and highly folded configurations stay finite with correct bend side', () => {
  const cases: [string, number][] = [
    ['near-straight', L1 + L2 - 0.01],
    ['highly folded', Math.abs(L1 - L2) + 0.01],
  ];
  for (const [name, d] of cases) {
    for (const sign of [1, -1] as const) {
      const target: Pt = [ROOT[0] + d * 0.7071, ROOT[1] + d * 0.7071];
      const sol = solveTwoBone(ROOT, target, L1, L2, sign);
      assertValidChain(sol, ROOT, L1, L2, 1e-6);
      assert.equal(sol.clamped, 'none', name);
      assert.equal(bendSideOf(ROOT, sol.mid, sol.end), sign, name);
    }
  }
});

test('repeat evaluation with identical inputs is deeply identical (purity)', () => {
  const target: Pt = [1023.7, 788.2];
  const a = solveTwoBone(ROOT, target, L1, L2, -1);
  const b = solveTwoBone(ROOT, target, L1, L2, -1);
  assert.deepEqual(a, b);
});

test('invalid rig data throws loudly instead of rendering NaN', () => {
  const t: Pt = [900, 800];
  assert.throws(() => solveTwoBone(ROOT, t, 0, L2, -1), RangeError);
  assert.throws(() => solveTwoBone(ROOT, t, L1, -5, -1), RangeError);
  assert.throws(() => solveTwoBone(ROOT, t, Number.NaN, L2, -1), RangeError);
  assert.throws(() => solveTwoBone(ROOT, t, L1, Number.POSITIVE_INFINITY, -1), RangeError);
  assert.throws(() => solveTwoBone(ROOT, t, L1, L2, 0 as unknown as 1), RangeError);
  assert.throws(() => solveTwoBone([Number.NaN, 0], t, L1, L2, -1), RangeError);
  assert.throws(() => solveTwoBone(ROOT, [0, Number.NaN], L1, L2, -1), RangeError);
});

test('equal-length bones: min reach 0, coincident target still safe', () => {
  const sol = solveTwoBone(ROOT, [...ROOT] as Pt, 100, 100, 1);
  assertValidChain(sol, ROOT, 100, 100);
  assert.equal(sol.clamped, 'min'); // minReach = 0 + EPS
  assert.ok(sol.solvedDistance <= IK_EPS + 1e-12);
});

test('seeded random sweep (500 targets, both signs): fixed lengths, stable bend, finite', () => {
  // Deterministic LCG (seed 42) — no unseeded randomness anywhere in tests.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 500; i++) {
    const ang = rand() * 2 * Math.PI;
    const d = rand() * (L1 + L2) * 1.4; // includes unreachable + too-close
    const target: Pt = [ROOT[0] + Math.cos(ang) * d, ROOT[1] + Math.sin(ang) * d];
    const sign = rand() < 0.5 ? 1 : -1;
    const sol = solveTwoBone(ROOT, target, L1, L2, sign);
    assertValidChain(sol, ROOT, L1, L2, 1e-6);
    assert.equal(bendSideOf(ROOT, sol.mid, sol.end), sign, `case ${i} d=${d.toFixed(3)}`);
    if (sol.clamped === 'none') {
      assert.ok(sol.residual <= 1e-9, `case ${i}: reachable residual ${sol.residual}`);
    } else {
      // clamped end lies on the root->target ray at the annulus boundary
      const expected = sol.clamped === 'max' ? L1 + L2 - IK_EPS : Math.abs(L1 - L2) + IK_EPS;
      assert.ok(Math.abs(sol.solvedDistance - expected) <= 1e-9, `case ${i}`);
    }
  }
});

test('end-effector accuracy gate: reachable targets solved within 1 px (actually ~1e-13)', () => {
  let worst = 0;
  for (let i = 0; i < 94; i++) {
    const ang = (i / 94) * 2 * Math.PI;
    const d = Math.abs(L1 - L2) + 1 + (i / 94) * (L1 + L2 - Math.abs(L1 - L2) - 2);
    const target: Pt = [ROOT[0] + Math.cos(ang) * d, ROOT[1] + Math.sin(ang) * d];
    const sol = solveTwoBone(ROOT, target, L1, L2, -1);
    assert.equal(sol.clamped, 'none');
    worst = Math.max(worst, sol.residual);
  }
  assert.ok(worst <= 1e-9, `worst reachable residual ${worst}`);
});
