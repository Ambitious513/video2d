// Real unit tests for the tracing tool (replaces the placeholder exit-1 test).
// Run: npm test  (inside tools/)
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {PNG} = require('pngjs');
const {PALETTE, hex, quantize} = require('../flatrace');

const BODY = PALETTE.find((p) => p[0] === 'body').slice(1);
const EYE = PALETTE.find((p) => p[0] === 'eye').slice(1);

function solidImage(w, h, [r, g, b]) {
  const img = new PNG({width: w, height: h});
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  return img;
}
const px = (img, x, y) => { const o = (y * img.width + x) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2]]; };

test('palette is the locked 11-color set with matching hex list', () => {
  assert.equal(PALETTE.length, 11);
  assert.equal(hex.length, 11);
  assert.ok(hex.includes('#686d75'));
  assert.ok(hex.includes('#f3e9d3'));
  assert.ok(hex.includes('#272a3e'));
});

test('quantize maps every pixel to an exact palette color', () => {
  const img = solidImage(16, 16, [104, 109, 117]); // body
  // perturb a region toward another palette color
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
    const o = (y * 16 + x) * 4;
    img.data[o] = 40; img.data[o + 1] = 43; img.data[o + 2] = 60; // near eye
  }
  quantize(img);
  const allowed = new Set(PALETTE.map((p) => p.slice(1).join(',')));
  for (let i = 0; i < 16 * 16; i++) {
    const c = [img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]].join(',');
    assert.ok(allowed.has(c), `pixel ${i} = ${c} not in palette`);
  }
});

test('despeckle preserves multi-pixel features (the eye survives)', () => {
  const img = solidImage(16, 16, BODY);
  for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) {
    const o = (y * 16 + x) * 4;
    img.data[o] = EYE[0]; img.data[o + 1] = EYE[1]; img.data[o + 2] = EYE[2];
  }
  quantize(img);
  assert.deepEqual(px(img, 8, 8), EYE, '4x4 eye block must survive despeckle');
});

test('despeckle removes a fully isolated single pixel', () => {
  const img = solidImage(16, 16, BODY);
  const o = (8 * 16 + 8) * 4;
  img.data[o] = EYE[0]; img.data[o + 1] = EYE[1]; img.data[o + 2] = EYE[2];
  quantize(img);
  assert.deepEqual(px(img, 8, 8), BODY, 'isolated pixel adopts neighbor majority');
});

test('CLI: debug _flat.png is OPT-IN (--flat / FLAT_PNG=1), default emits SVG only', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flatrace-test-'));
  const inp = path.join(tmp, 'in.png');
  const out = path.join(tmp, 'out.svg');
  fs.writeFileSync(inp, PNG.sync.write(solidImage(64, 64, BODY)));
  const script = path.resolve(__dirname, '..', 'flatrace.js');

  // default: no debug PNG
  let r = spawnSync(process.execPath, [script, inp, out], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 0);
  assert.ok(!fs.existsSync(path.join(tmp, 'out_flat.png')), 'default run must not write _flat.png');

  // --flat flag: debug PNG written
  r = spawnSync(process.execPath, [script, inp, out, '--flat'], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(tmp, 'out_flat.png')), '--flat must write _flat.png');
  fs.rmSync(path.join(tmp, 'out_flat.png'));

  // FLAT_PNG=1 env: debug PNG written
  r = spawnSync(process.execPath, [script, inp, out], {encoding: 'utf8', env: {...process.env, FLAT_PNG: '1'}});
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(tmp, 'out_flat.png')), 'FLAT_PNG=1 must write _flat.png');

  fs.rmSync(tmp, {recursive: true, force: true});
});
