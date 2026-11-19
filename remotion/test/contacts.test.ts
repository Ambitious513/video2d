import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCycleContactTrack, expandTrack, getContactAtFrame, stanceFrames, CONTACT_HEIGHT_WINDOWS, type ContactState } from '../src/puppet/motion/contacts';
const VALID: ContactState[] = ['swing', 'touchdown', 'stance', 'toeOff', 'uncertain'];
test('contacts: track covers all 94 frames exactly', () => {
  const rows = expandTrack(runCycleContactTrack);
  assert.equal(rows.length, 94); assert.equal(runCycleContactTrack.totalFrames, 94);
  rows.forEach((r, i) => assert.equal(r.frame, i));
});
test('contacts: every per-frame state is a valid ContactState', () => {
  for (const r of expandTrack(runCycleContactTrack)) { assert.ok(VALID.includes(r.near)); assert.ok(VALID.includes(r.far)); }
});
test('contacts: intervals in-bounds, ordered, non-overlapping per foot', () => {
  for (const side of ['near', 'far'] as const) { let prevEnd = -1;
    for (const i of runCycleContactTrack[side]) { assert.ok(i.start >= 0 && i.end <= 93 && i.start <= i.end); assert.ok(i.start > prevEnd); prevEnd = i.end; } }
});
test('contacts: near/far windows alternate with a 13-frame step offset', () => {
  const ns = CONTACT_HEIGHT_WINDOWS.near.map((i) => i.start); const fs = CONTACT_HEIGHT_WINDOWS.far.map((i) => i.start);
  for (const n of ns) assert.ok(fs.some((f) => ((n - f) % 26 + 26) % 26 === 13));
});
test('contacts: HONESTY GUARD - reviewed track is verified and stance matches the evidence', () => {
  assert.equal(runCycleContactTrack.provisional, false); assert.equal(runCycleContactTrack.ground.verified, true);
  // Phase 2.2b evidence review: stance only at the belt-locked bottom instant of
  // each window (toe height 0, vx == belt, |vy| <= 2). No other frame is stance.
  assert.deepEqual(stanceFrames(runCycleContactTrack, 'near'), [18, 44, 70]);
  assert.deepEqual(stanceFrames(runCycleContactTrack, 'far'), [5, 31, 57, 83]);
});
test('contacts: contact-height windows carry reviewed touchdown/stance/toeOff labels', () => {
  const rows = expandTrack(runCycleContactTrack);
  for (const side of ['near', 'far'] as const) {
    for (const w of CONTACT_HEIGHT_WINDOWS[side]) {
      assert.equal(rows[w.start][side], 'touchdown');
      assert.equal(rows[w.start + 1][side], 'stance');
      assert.equal(rows[w.start + 2][side], 'toeOff');
    }
  }
  // No window frame is left 'uncertain' after review.
  for (const side of ['near', 'far'] as const) {
    for (const w of CONTACT_HEIGHT_WINDOWS[side]) for (let f = w.start; f <= w.end; f++) assert.notEqual(rows[f][side], 'uncertain');
  }
});
test('contacts: getContactAtFrame wraps cyclically', () => {
  assert.equal(getContactAtFrame(runCycleContactTrack, 0).frame, 0);
  assert.equal(getContactAtFrame(runCycleContactTrack, 94).frame, 0);
  assert.equal(getContactAtFrame(runCycleContactTrack, -1).frame, 93);
  assert.equal(getContactAtFrame(runCycleContactTrack, 94).near, getContactAtFrame(runCycleContactTrack, 0).near);
});
test('contacts: expansion is deterministic', () => { assert.deepEqual(expandTrack(runCycleContactTrack), expandTrack(runCycleContactTrack)); });
test('contacts: ground contract carries the reviewed treadmill model for in_place', () => {
  assert.equal(runCycleContactTrack.rootMode, 'in_place'); assert.equal(runCycleContactTrack.ground.mode, 'treadmill');
  assert.equal(runCycleContactTrack.ground.verified, true);
  assert.ok(runCycleContactTrack.ground.beltVelocityX < 0); assert.ok(runCycleContactTrack.ground.worldY > 0);
});
