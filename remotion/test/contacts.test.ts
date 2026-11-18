import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCycleContactTrack, expandTrack, getContactAtFrame, stanceFrames, type ContactState } from '../src/puppet/motion/contacts';

const VALID: ContactState[] = ['swing', 'touchdown', 'stance', 'toeOff', 'uncertain'];

test('contacts: track covers all 94 frames exactly', () => {
  const rows = expandTrack(runCycleContactTrack);
  assert.equal(rows.length, 94);
  assert.equal(runCycleContactTrack.totalFrames, 94);
  rows.forEach((r, i) => assert.equal(r.frame, i));
});

test('contacts: every per-frame state is a valid ContactState', () => {
  for (const r of expandTrack(runCycleContactTrack)) {
    assert.ok(VALID.includes(r.near));
    assert.ok(VALID.includes(r.far));
  }
});

test('contacts: intervals in-bounds, ordered, non-overlapping per foot', () => {
  for (const side of ['near', 'far'] as const) {
    let prevEnd = -1;
    for (const i of runCycleContactTrack[side]) {
      assert.ok(i.start >= 0 && i.end <= 93 && i.start <= i.end);
      assert.ok(i.start > prevEnd);
      prevEnd = i.end;
    }
  }
});

test('contacts: near/far windows alternate with a 13-frame step offset', () => {
  const nearStarts = runCycleContactTrack.near.map((i) => i.start);
  const farStarts = runCycleContactTrack.far.map((i) => i.start);
  for (const ns of nearStarts) {
    assert.ok(farStarts.some((fs) => ((ns - fs) % 26 + 26) % 26 === 13));
  }
});

test('contacts: HONESTY GUARD - no stance asserted while provisional/unverified', () => {
  assert.equal(runCycleContactTrack.provisional, true);
  assert.equal(runCycleContactTrack.ground.verified, false);
  assert.deepEqual(stanceFrames(runCycleContactTrack, 'near'), []);
  assert.deepEqual(stanceFrames(runCycleContactTrack, 'far'), []);
});

test('contacts: contact-height windows labelled uncertain (candidates only)', () => {
  const rows = expandTrack(runCycleContactTrack);
  for (const i of runCycleContactTrack.near) for (let f = i.start; f <= i.end; f++) assert.equal(rows[f].near, 'uncertain');
  for (const i of runCycleContactTrack.far) for (let f = i.start; f <= i.end; f++) assert.equal(rows[f].far, 'uncertain');
});

test('contacts: getContactAtFrame wraps cyclically', () => {
  assert.equal(getContactAtFrame(runCycleContactTrack, 0).frame, 0);
  assert.equal(getContactAtFrame(runCycleContactTrack, 94).frame, 0);
  assert.equal(getContactAtFrame(runCycleContactTrack, -1).frame, 93);
  assert.equal(getContactAtFrame(runCycleContactTrack, 94).near, getContactAtFrame(runCycleContactTrack, 0).near);
});

test('contacts: expansion is deterministic', () => {
  assert.deepEqual(expandTrack(runCycleContactTrack), expandTrack(runCycleContactTrack));
});

test('contacts: ground contract carries treadmill hypothesis for in_place', () => {
  assert.equal(runCycleContactTrack.rootMode, 'in_place');
  assert.equal(runCycleContactTrack.ground.mode, 'treadmill');
  assert.ok(runCycleContactTrack.ground.beltVelocityX < 0);
  assert.ok(runCycleContactTrack.ground.worldY > 0);
});
