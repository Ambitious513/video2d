import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DURATION, LOOP} from '../src/puppet/keys';
import {celPath, exactCelIndex, loopCelIndex} from '../src/cels';

// Contract §4.1: expected 0-indexed mapping at start, middle, wrap, end.
const TABLE: [number, number, number][] = [
  [0, 1, 1],
  [12, 13, 13],
  [25, 26, 26],
  [26, 27, 1],
  [72, 73, 21],
  [93, 94, 16],
];

test('constants match the source timeline', () => {
  assert.equal(DURATION, 94);
  assert.equal(LOOP, 26);
});

for (const [frame, exact, loop] of TABLE) {
  test(`frame ${frame}: exact cel ${exact}, loop cel ${loop}`, () => {
    assert.equal(exactCelIndex(frame), exact);
    assert.equal(loopCelIndex(frame), loop);
  });
}

test('exact variant: 94 frames -> 94 unique cels, strictly monotonic, no skips/repeats', () => {
  const seen = new Set<number>();
  let prev = 0;
  for (let f = 0; f < DURATION; f++) {
    const idx = exactCelIndex(f);
    assert.equal(idx, prev + 1, `frame ${f} must select the next cel`);
    assert.ok(!seen.has(idx), `cel ${idx} repeated`);
    seen.add(idx);
    prev = idx;
  }
  assert.equal(seen.size, 94);
  assert.equal(Math.min(...seen), 1);
  assert.equal(Math.max(...seen), 94);
});

test('loop variant: repeats exactly every 26 timeline frames', () => {
  for (let f = 0; f < DURATION; f++) {
    const idx = loopCelIndex(f);
    assert.ok(idx >= 1 && idx <= 26);
    if (f + LOOP < DURATION) {
      assert.equal(loopCelIndex(f + LOOP), idx, `period violated at frame ${f}`);
    }
  }
  // wrap point: last frame of cycle 1 -> first frame of cycle 2
  assert.equal(loopCelIndex(25), 26);
  assert.equal(loopCelIndex(26), 1);
});

test('out-of-range and non-integer frames are rejected, not wrapped', () => {
  for (const bad of [-1, 94, 95, 1000, 1.5, NaN, Infinity]) {
    assert.throws(() => exactCelIndex(bad), RangeError, `exact accepted ${bad}`);
    assert.throws(() => loopCelIndex(bad), RangeError, `loop accepted ${bad}`);
  }
});

test('cel paths are zero-padded and point at the right asset directories', () => {
  assert.equal(celPath('cel94', exactCelIndex(0)), 'cel94/f_001.svg');
  assert.equal(celPath('cel94', exactCelIndex(93)), 'cel94/f_094.svg');
  assert.equal(celPath('cel', loopCelIndex(26)), 'cel/f_001.svg');
  assert.equal(celPath('cel', loopCelIndex(72)), 'cel/f_021.svg');
});
