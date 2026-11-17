#!/usr/bin/env node
/**
 * Bulk-trace all 94 full-resolution source frames into remotion/public/cel94/.
 *
 *   node tools/trace-all.js            # SVG only (default)
 *   node tools/trace-all.js --flat     # also write _flat.png debug rasters
 *
 * Uses tools/flatrace.js unchanged (same palette, same vtracer parameters).
 * The ONLY post-processing is inserting viewBox="0 0 1920 1080" into the
 * vtracer <svg> tag (vtracer emits width/height but no viewBox). This is a
 * metadata normalization — it does not change rendering, palette or paths.
 * The legacy 26 cels in public/cel/ are never touched.
 */
const fs = require('fs');
const path = require('path');
const {trace} = require('./flatrace');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'fullres');
const OUT = path.join(ROOT, 'remotion', 'public', 'cel94');
const flat = process.argv.includes('--flat') || process.env.FLAT_PNG === '1';

fs.mkdirSync(OUT, {recursive: true});
const t0 = Date.now();
for (let i = 1; i <= 94; i++) {
  const n = String(i).padStart(3, '0');
  const inp = path.join(SRC, `f_${n}.png`);
  const out = path.join(OUT, `f_${n}.svg`);
  if (!fs.existsSync(inp)) throw new Error(`missing ${inp} — run tools/extract-frames.js first`);
  trace(inp, out, {flat});
  let svg = fs.readFileSync(out, 'utf8');
  if (!/viewBox=/.test(svg)) {
    svg = svg.replace(/<svg([^>]*)>/, '<svg$1 viewBox="0 0 1920 1080">');
    fs.writeFileSync(out, svg);
  }
  if (i % 10 === 0 || i === 94) console.log(`traced ${i}/94 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const files = fs.readdirSync(OUT).filter((f) => /^f_\d{3}\.svg$/.test(f));
if (files.length !== 94) throw new Error(`expected 94 SVGs, got ${files.length}`);
if (!flat) {
  const flats = fs.readdirSync(OUT).filter((f) => f.endsWith('_flat.png'));
  if (flats.length) throw new Error(`debug PNGs written without --flat: ${flats.length}`);
}
console.log(`cel94 complete: ${files.length} SVGs, debug PNGs: ${flat ? 'requested' : 'none'} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
