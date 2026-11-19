#!/usr/bin/env node
/**
 * Phase 3 fast puppet-only fidelity scorer (dev loop).
 *   node tools/score-puppet-fast.js <seqDir>
 * Compares <seqDir>/f_NNN.png (RunCycle puppet render) against
 * fullres/f_NNN.png at 1920x1080, reporting MAE and character IoU (shadow
 * excluded) — same mask definitions as score-fidelity.js. Writes nothing.
 */
const fs = require('fs');
const path = require('path');
const {PNG} = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const seqDir = process.argv[2];
if (!seqDir) { console.error('usage: node score-puppet-fast.js <seqDir>'); process.exit(1); }
const W = 1920, H = 1080, N = 94;

const isShadow = (r, g, b) => Math.abs(r - 220) <= 14 && Math.abs(g - 219) <= 14 && Math.abs(b - 222) <= 14;
const isFg = (r, g, b) => Math.max(255 - r, 255 - g, 255 - b) > 12;

let sumAbs = 0, pix = 0;
let inter = 0, uni = 0;
const perFrame = [];
for (let n = 1; n <= N; n++) {
  const f = String(n).padStart(3, '0');
  const a = PNG.sync.read(fs.readFileSync(path.join(seqDir, `element-${String(n - 1).padStart(2, '0')}.png`)));
  const b = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'fullres', `f_${f}.png`)));
  let fa = 0, fb = 0, best = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const ar = a.data[i], ag = a.data[i + 1], ab = a.data[i + 2];
    const br = b.data[i], bg = b.data[i + 1], bb = b.data[i + 2];
    sumAbs += Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb); pix += 3;
    const af = isFg(ar, ag, ab) && !isShadow(ar, ag, ab);
    const bf = isFg(br, bg, bb) && !isShadow(br, bg, bb);
    if (af) fa++; if (bf) fb++;
    if (af && bf) best++;
  }
  inter += best; uni += fa + fb - best;
  perFrame.push({n, iou: best / (fa + fb - best || 1)});
}
const mae = sumAbs / pix;
const iou = inter / uni;
const worst = [...perFrame].sort((x, y) => x.iou - y.iou).slice(0, 5).map((p) => p.n);
console.log(`puppet: MAE ${mae.toFixed(4)}  IoU(char) ${iou.toFixed(4)}  worst frames ${worst.join(',')}`);