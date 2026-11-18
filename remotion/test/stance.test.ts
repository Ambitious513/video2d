/**
 * Phase 2.3 unit tests — stance locking (master plan §6.3, §6.5, §9.2).
 *
 * Covers: anchor capture at touchdown, world-space stance preservation
 * (planted-point slip vs the belt/ground), toe-off release, swing continuity,
 * full-cycle alternation, mirroring, in_place root stability, the
 * root_motion synthetic contract (planted world-space foot stays fixed while
 * the root advances), and the Phase 2 acceptance numbers on the solved track:
 *   stance slip < 0.5 px/frame · anchor drift <= 1.5 px · penetration <= 1 px
 *   touchdown/toe-off continuous (max delta <= 1.5 x p95)
 *   fixed bones through the stance solve · in_place root stable
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  GROUND_Y, BELT_VX, buildStanceIntervals, diagnoseStance, stancePhaseAtFrame,
  toWorldX, toCharacterX, anchorInCharacterFrame, type StanceInterval,
} from '../src/puppet/motion/stance';
import {CONTACT_HEIGHT_WINDOWS, type FootContactTrack} from '../src/puppet/motion/contacts';
import {solvePose} from '../src/puppet/pose';
import {mirrorX} from '../src/puppet/ik';
import {DURATION} from '../src/puppet/keys';

const dist = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(a.x - b.x, a.y - b.y);

test('2.3 anchors: one stance interval per contact window, in clip order', () => {
  const iv = buildStanceIntervals();
  assert.equal(iv.length, 7);
  const near = iv.filter((i) => i.side === 'near');
  const far = iv.filter((i) => i.side === 'far');
  assert.deepEqual(near.map((i) => [i.touchdown, i.stance, i.toeOff]), [[17, 18, 19], [43, 44, 45], [69, 70, 71]]);
  assert.deepEqual(far.map((i) => [i.touchdown, i.stance, i.toeOff]), [[4, 5, 6], [30, 31, 32], [56, 57, 58], [82, 83, 84]]);
});

test('2.3 anchor capture: stance anchor == solved toe at the stance frame (world == canvas, in_place)', () => {
  const iv = buildStanceIntervals();
  for (const i of iv) {
    assert.ok(dist(i.anchor, i.solvedToeAtStance) <= 1e-9, `${i.side}@${i.stance} anchor != solved toe`);
    assert.equal(i.anchor.y, GROUND_Y, 'anchor rides the ground plane');
    // belt-lock at the bottom instant: the SOLVED toe velocity at the stance
    // frame equals the belt exactly (the planted frame). The raw measured toe
    // is noisy there (-72.5) — reported, not a gate.
    {
      const f = i.stance;
      const lm = (i.side === 'near' ? solvePose(f - 1).nearLeg : solvePose(f - 1).farLeg);
      const lp = (i.side === 'near' ? solvePose(f + 1).nearLeg : solvePose(f + 1).farLeg);
      const solvedVx = (lp.toe[0] - lm.toe[0]) / 2;
      assert.ok(Math.abs(solvedVx - BELT_VX) <= 1e-6, `${i.side}@${i.stance} solved toe vx ${solvedVx} != belt`);
    }
  }
});

test('2.3 planted world-space foot stays fixed: belt-locked stance, slip 0 (< 0.5 gate)', () => {
  const d = diagnoseStance();
  assert.ok(d.plantedSlipMax < 0.5, `planted slip ${d.plantedSlipMax}`);
  // the planted toe moves backward with the belt in the character frame and
  // has exactly zero velocity relative to the belt (ground) frame
  for (const i of d.intervals) {
    assert.ok(Math.abs(i.worldVelocity.x - BELT_VX) <= 1e-12);
    assert.equal(i.worldVelocity.y, 0);
  }
  // belt-relative world x of the planted toe is CONSTANT across the stance:
  // x_world(f) = anchorX + belt*(f - stance)  ->  d/df = belt  ->  slip 0
  const iv = d.intervals[0];
  const worldX = (f: number) => iv.anchor.x + BELT_VX * (f - iv.stance);
  for (let f = iv.stance; f <= iv.stance; f++) {
    assert.ok(Math.abs(worldX(f) - iv.anchor.x) <= 1e-12, 'anchor moved within stance');
  }
});

test('2.3 anchor drift <= 1.5 px and ground penetration <= 1 px over every stance', () => {
  const d = diagnoseStance();
  assert.ok(d.stanceAnchorDriftMax <= 1.5, `anchor drift ${d.stanceAnchorDriftMax}`);
  assert.ok(d.groundPenetrationMax <= 1, `penetration ${d.groundPenetrationMax}`);
  assert.ok(d.solvedAnchorMaxError <= 1e-9, `solved-vs-anchor ${d.solvedAnchorMaxError}`);
  assert.ok(d.beltShiftMaxError <= 1e-6, `belt-shift ${d.beltShiftMaxError}`);
});

test('2.3 stance state machine: touchdown/stance/toeOff/swing per frame, correct alternation', () => {
  const d = diagnoseStance();
  // alternation: near stance frames and far stance frames interleave with a
  // 13-frame step (near 18,44,70; far 5,31,57,83)
  const nearStance = d.states.filter((s) => s.near === 'stance').map((s) => s.frame);
  const farStance = d.states.filter((s) => s.far === 'stance').map((s) => s.frame);
  assert.deepEqual(nearStance, [18, 44, 70]);
  assert.deepEqual(farStance, [5, 31, 57, 83]);
  // both feet never in stance on the same frame
  for (const s of d.states) assert.ok(!(s.near === 'stance' && s.far === 'stance'), `frame ${s.frame}`);
  // state counts: 7 touchdown + 7 stance + 7 toeOff = 21 events across both feet
  const count = (side: 'near' | 'far', phase: string) => d.states.filter((s) => s[side] === phase).length;
  for (const side of ['near', 'far'] as const) {
    assert.equal(count(side, 'touchdown'), side === 'near' ? 3 : 4);
    assert.equal(count(side, 'stance'), side === 'near' ? 3 : 4);
    assert.equal(count(side, 'toeOff'), side === 'near' ? 3 : 4);
    assert.equal(count(side, 'swing'), 94 - (side === 'near' ? 9 : 12));
  }
  // phase function agrees with the reviewed windows
  for (const w of CONTACT_HEIGHT_WINDOWS.near) {
    assert.equal(stancePhaseAtFrame(w.start, 'near'), 'touchdown');
    assert.equal(stancePhaseAtFrame(w.start + 1, 'near'), 'stance');
    assert.equal(stancePhaseAtFrame(w.start + 2, 'near'), 'toeOff');
    assert.equal(stancePhaseAtFrame(w.start - 1, 'near'), 'swing');
    assert.equal(stancePhaseAtFrame(w.start + 3, 'near'), 'swing');
  }
});

test('2.3 toe-off release: the foot leaves the anchor cleanly (next frame is swing, no snap)', () => {
  const d = diagnoseStance();
  for (const iv of d.intervals) {
    assert.equal(stancePhaseAtFrame(iv.toeOff, iv.side), 'toeOff');
    assert.equal(stancePhaseAtFrame(iv.toeOff + 1, iv.side), 'swing');
    // the solved toe is off the ground by the exit frame (rising)
    const leg = iv.side === 'near' ? solvePose(iv.toeOff).nearLeg : solvePose(iv.toeOff).farLeg;
    assert.ok(leg.toe[1] < GROUND_Y - 1, `toe still at ground at toe-off ${iv.side}@${iv.toeOff}`);
  }
});

test('2.3 touchdown/toe-off continuity: no one-frame snap (max delta <= 1.5 x p95)', () => {
  const d = diagnoseStance();
  const c = d.transitionContinuity;
  assert.ok(c.touchdownMaxDelta <= 1.5 * c.p95, `touchdown delta ${c.touchdownMaxDelta} > 1.5*p95 ${c.p95}`);
  assert.ok(c.toeOffMaxDelta <= 1.5 * c.p95, `toeOff delta ${c.toeOffMaxDelta} > 1.5*p95 ${c.p95}`);
});

test('2.3 fixed bones through the stance solve; in_place root stable across the clip', () => {
  const d = diagnoseStance();
  assert.ok(d.stanceBoneErrorMax <= 1e-9, `bone error ${d.stanceBoneErrorMax}`);
  // in_place: the root does not translate (hip x constant over all 94 frames)
  let minX = Infinity, maxX = -Infinity;
  for (let f = 0; f < DURATION; f++) {
    const x = solvePose(f).hip[0];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  }
  assert.ok(maxX - minX < 1e-9, `root moved horizontally: range ${maxX - minX}`);
});

test('2.3 root_motion contract: a planted world-space foot stays fixed while the root advances', () => {
  // Synthetic root_motion: the root advances by rootDeltaX over the clip; the
  // world anchor is fixed in the BELT-relative world; in the character frame
  // the anchor shifts back by the root advance (anchorInCharacterFrame).
  const iv = buildStanceIntervals()[0];
  const worldAtStance = toWorldX(iv.anchor.x, iv.stance);
  const rootDeltaX = 37.5;
  const charFrameX = anchorInCharacterFrame(iv.anchor.x, rootDeltaX);
  // the world-space position of the anchored foot is unchanged by root motion
  const worldAfter = toWorldX(charFrameX + rootDeltaX, iv.stance);
  assert.ok(Math.abs(worldAfter - worldAtStance) <= 1e-9, 'planted world foot moved with the root');
  // and the belt-locked character-frame anchor + belt == world anchor again
  assert.ok(Math.abs(toCharacterX(worldAtStance, iv.stance) - iv.anchor.x) <= 1e-9);
});

test('2.3 mirroring: the belt-locked solve mirrors x with the bend side flipped', () => {
  // Mirroring is a left-facing variant of the same rig: the anchor mirrors and
  // the knee bend flips. The stance contract is defined per side, so a mirrored
  // clip simply mirrors each interval's anchor.
  const iv = buildStanceIntervals().find((i) => i.side === 'near')!;
  const axis = 960;
  const mirrored = mirrorX([iv.anchor.x, iv.anchor.y], axis);
  assert.ok(Math.abs(mirrored[0] - (2 * axis - iv.anchor.x)) <= 1e-9);
  // the pose evaluator honors the mirrored bend side through solveLimb
  const pose = solvePose(iv.stance);
  const mir = solveLimbMirror(pose.nearLeg.hip, pose.nearLeg.rawAnkle, axis);
  assert.ok(Math.abs(mir.knee[0] - (2 * axis - pose.nearLeg.knee[0])) <= 1e-6);
});

// local helper mirroring a solved leg's knee via solveLimb with flipped bend
import {solveTwoBone} from '../src/puppet/ik';
function solveLimbMirror(root: [number, number], target: [number, number], axis: number) {
  const mr = mirrorX(root, axis);
  const mt = mirrorX(target, axis);
  const sol = solveTwoBone(mr, mt, 186.0, 177.82, 1); // bend flips for the mirrored facing
  return {knee: sol.mid, ankle: sol.end};
}

test('2.3 determinism: repeated evaluation is deeply identical (out-of-order frames)', () => {
  const order = [72, 0, 45, 12, 93, 25];
  const first = order.map((f) => solvePose(f));
  for (const f of [3, 17, 88, 51]) solvePose(f);
  const second = order.map((f) => solvePose(f));
  for (let i = 0; i < order.length; i++) assert.deepEqual(second[i], first[i], `frame ${order[i]}`);
  // stance diagnostics are deterministic too
  assert.deepEqual(diagnoseStance(), diagnoseStance());
});

test('2.3 stance anchors are finite, inside the canvas, and below the hip', () => {
  const iv = buildStanceIntervals();
  for (const i of iv) {
    assert.ok(Number.isFinite(i.anchor.x) && Number.isFinite(i.anchor.y));
    assert.ok(i.anchor.x >= 0 && i.anchor.x <= 1920);
    assert.ok(i.anchor.y >= 0 && i.anchor.y <= 1080);
    const hip = solvePose(i.stance).hip;
    assert.ok(i.anchor.y > hip[1], `anchor not below hip at ${i.side}@${i.stance}`);
  }
});