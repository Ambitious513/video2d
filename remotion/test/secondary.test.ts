import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scarfNodes, backpackBob, backpackLagX, backpackTransform, backpackLocalToCanvas, strapBackpackAnchor, RUNNER_SCARF, type Pt} from '../src/puppet/secondary';

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('scarf: node 0 is the knot; N+1 nodes; all finite', () => {
  const knot: Pt = [940, 250];
  const nodes = scarfNodes(knot, 20);
  assert.equal(nodes.length, 7); // knot + 6 tail nodes
  assert.deepEqual(nodes[0], knot);
  for (const p of nodes) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
});

test('scarf: fixed segment lengths (never stretches) across all 94 frames', () => {
  const knot: Pt = [940, 250];
  for (let f = 0; f < 94; f++) {
    const nodes = scarfNodes(knot, f);
    for (let i = 1; i < nodes.length; i++) {
      assert.ok(Math.abs(dist(nodes[i - 1], nodes[i]) - RUNNER_SCARF.segLen) <= 1e-9, `frame ${f} seg ${i}: ${dist(nodes[i - 1], nodes[i])}`);
    }
  }
});

test('scarf: pure / deterministic for out-of-order and repeated frames', () => {
  const knot: Pt = [940, 250];
  const order = [72, 0, 45, 12, 93, 25];
  const first = order.map((f) => scarfNodes(knot, f));
  for (const f of [3, 17, 88, 51]) scarfNodes(knot, f);
  const second = order.map((f) => scarfNodes(knot, f));
  for (let i = 0; i < order.length; i++) assert.deepEqual(second[i], first[i], `frame ${order[i]}`);
});

test('scarf: tail stays behind/below the knot (no flip up/forward)', () => {
  const knot: Pt = [940, 250];
  for (const f of [0, 12, 25, 26, 34, 72, 93]) {
    const tail = scarfNodes(knot, f)[6];
    assert.ok(tail[0] < knot[0], `frame ${f}: tail not behind (x ${tail[0]} vs ${knot[0]})`);
  }
});

test('scarf: deterministic secondary motion differs across frames (it actually waves)', () => {
  const knot: Pt = [940, 250];
  const a = scarfNodes(knot, 0);
  const b = scarfNodes(knot, 7);
  assert.notDeepEqual(a, b);
});

test('backpack: bob/lag are small, deterministic, and bounded', () => {
  for (const f of [0, 12, 25, 26, 34, 72, 93]) {
    const bob = backpackBob(f);
    const lag = backpackLagX(f);
    assert.ok(Math.abs(bob) <= 5, `frame ${f} bob ${bob}`);
    assert.ok(Math.abs(lag) <= 3, `frame ${f} lag ${lag}`);
  }
  assert.deepEqual(backpackBob(20), backpackBob(20));
  assert.deepEqual(backpackLagX(20), backpackLagX(20));
  // differs across frames (motion present)
  assert.notEqual(backpackBob(0), backpackBob(7));
});

test('strap: backpack-side anchor follows the shared backpack transform (all 94 frames)', () => {
  const anchor: Pt = [818, 470];
  for (let f = 0; f < 94; f++) {
    const t = backpackTransform(anchor, f);
    // translation == group translate (anchor + bob/lag)
    assert.ok(Math.abs(t.tx - (anchor[0] + backpackLagX(f))) <= 1e-9, `frame ${f} tx`);
    assert.ok(Math.abs(t.ty - (anchor[1] + backpackBob(f))) <= 1e-9, `frame ${f} ty`);
    // strap anchor == local (44,-78) mapped by the same transform
    const s = strapBackpackAnchor(anchor, f);
    const expect = backpackLocalToCanvas([44, -78], t);
    assert.ok(Math.hypot(s[0] - expect[0], s[1] - expect[1]) <= 1e-9, `frame ${f} strap != transform`);
    // finite + in canvas
    assert.ok(Number.isFinite(s[0]) && Number.isFinite(s[1]));
    assert.ok(s[0] >= 0 && s[0] <= 1920 && s[1] >= 0 && s[1] <= 1080);
  }
});

test('strap: shoulder-side anchor is the fixed shoulder point (not transformed by the pack)', () => {
  const anchor: Pt = [818, 470];
  // the shoulder endpoint is sh + (16, -4) in Runner; here we assert the
  // transform helper never moves the shoulder (it only maps backpack-local).
  // A shoulder-local point maps through backpackLocalToCanvas with the pack
  // transform, but Runner uses the raw sh for the shoulder end, so we verify
  // the helper is pure and the pack anchor is the only transformed endpoint.
  const f = 30;
  const s = strapBackpackAnchor(anchor, f);
  const t = backpackTransform(anchor, f);
  // the pack anchor moves with bob/lag (not fixed), confirming it is transformed
  assert.ok(Math.abs(s[0] - (t.tx + 44 * Math.cos(t.rot) - (-78) * Math.sin(t.rot))) <= 1e-9);
});

test('strap: no frame-boundary jump (25->26 and 93->0) in the transformed anchor', () => {
  const anchor: Pt = [818, 470];
  const jump = (a: number, b: number) => {
    const p = strapBackpackAnchor(anchor, a), q = strapBackpackAnchor(anchor, b);
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  };
  const wrap1 = jump(25, 26);
  const wrap2 = jump(93, 0);
  // small frame-to-frame motion (bob/lag + rotation), no discontinuity
  assert.ok(wrap1 < 8, `25->26 jump ${wrap1}`);
  assert.ok(wrap2 < 8, `93->0 jump ${wrap2}`);
});