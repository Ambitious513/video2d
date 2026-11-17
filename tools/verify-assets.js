#!/usr/bin/env node
/**
 * Test C — traced SVG asset validation.
 *
 *   node tools/verify-assets.js
 *
 * Checks remotion/public/cel94/ (94 unique exact cels) and
 * remotion/public/cel/ (26 legacy loop cels):
 *   - contiguous naming f_001.svg .. f_NNN.svg, non-empty;
 *   - root element is <svg> (after optional XML prolog / generator comment);
 *   - width/height = 1920x1080; viewBox presence recorded per directory;
 *   - no embedded raster images (<image> / data:image);
 *   - XML parses AND rasterizes: sharp (librsvg) renders each SVG to 96x54;
 *   - cel94 files are pairwise unique (sha256).
 * Browser renderability is additionally proven by the still-render smoke
 * tests (remotion/scripts/render-stills.mjs).
 *
 * NOTE: the 26 legacy cels were committed without a viewBox attribute
 * (vtracer emits width/height only). They are preserved unmodified per the
 * reconciliation contract; the missing viewBox is reported as a deviation,
 * not silently "fixed". New cel94 output gets viewBox via tools/trace-all.js.
 *
 * Writes reports/svg-asset-validation.json.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');

async function validateSet(rel, count) {
  const dir = path.join(ROOT, rel);
  const result = {dir: rel, expectedCount: count, files: [], problems: [], deviations: []};
  if (!fs.existsSync(dir)) {
    result.problems.push('directory missing');
    result.status = 'FAIL';
    return result;
  }
  const hashes = new Map();
  for (let i = 1; i <= count; i++) {
    const name = `f_${String(i).padStart(3, '0')}.svg`;
    const full = path.join(dir, name);
    const entry = {name};
    if (!fs.existsSync(full)) { result.problems.push(`missing ${name}`); continue; }
    const buf = fs.readFileSync(full);
    entry.bytes = buf.length;
    if (buf.length === 0) result.problems.push(`empty ${name}`);
    const text = buf.toString('utf8');
    const rootOk = /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/.test(text);
    if (!rootOk) result.problems.push(`${name}: root element is not <svg>`);
    entry.width = (text.match(/<svg[^>]*\bwidth="(\d+)"/) || [])[1];
    entry.height = (text.match(/<svg[^>]*\bheight="(\d+)"/) || [])[1];
    entry.viewBox = (text.match(/<svg[^>]*\bviewBox="([^"]+)"/) || [])[1] || null;
    if (entry.width !== '1920' || entry.height !== '1080') result.problems.push(`${name}: width/height ${entry.width}x${entry.height} != 1920x1080`);
    if (!entry.viewBox) result.deviations.push(`${name}: no viewBox (legacy vtracer output; width/height present)`);
    else if (entry.viewBox !== '0 0 1920 1080') result.problems.push(`${name}: viewBox ${entry.viewBox} != 0 0 1920 1080`);
    if (/<image[\s>]/.test(text) || /data:image\//.test(text)) result.problems.push(`${name}: embedded raster image found`);
    entry.paths = (text.match(/<path/g) || []).length;
    if (entry.paths === 0) result.problems.push(`${name}: no <path> elements`);
    // librsvg parse + render proof (strict XML parser; throws on malformed SVG)
    try {
      const out = await sharp(buf).resize(96, 54).png().toBuffer();
      entry.rasterizes = out.length > 0;
    } catch (err) {
      entry.rasterizes = false;
      result.problems.push(`${name}: librsvg render failed: ${err.message}`);
    }
    const h = crypto.createHash('sha256').update(buf).digest('hex');
    entry.sha256 = h.slice(0, 16);
    if (hashes.has(h)) result.problems.push(`${name}: duplicate of ${hashes.get(h)}`);
    hashes.set(h, name);
    result.files.push(entry);
  }
  const extras = fs.readdirSync(dir).filter((f) => !/^f_\d{3}\.svg$/.test(f));
  if (extras.length) result.deviations.push(`extra files in directory: ${extras.join(', ')}`);
  result.actualCount = result.files.length;
  result.uniqueHashes = hashes.size;
  result.status = result.problems.length ? 'FAIL' : (result.deviations.length ? 'PASS_WITH_NOTES' : 'PASS');
  return result;
}

(async () => {
  const cel94 = await validateSet(path.join('remotion', 'public', 'cel94'), 94);
  const cel = await validateSet(path.join('remotion', 'public', 'cel'), 26);
  const report = {
    generatedAt: new Date().toISOString(),
    checks: ['contiguous naming', 'non-empty', 'svg root', '1920x1080 width/height', 'viewBox recorded', 'no embedded raster', 'librsvg parse+render', 'pairwise unique (sha256)'],
    cel94: {...cel94, files: cel94.files.map(({name, bytes, paths, viewBox, sha256, rasterizes}) => ({name, bytes, paths, viewBox, sha256, rasterizes}))},
    cel: {...cel, files: cel.files.map(({name, bytes, paths, viewBox, sha256, rasterizes}) => ({name, bytes, paths, viewBox, sha256, rasterizes}))},
    status: cel94.status === 'FAIL' || cel.status === 'FAIL' ? 'FAIL' : 'PASS',
  };
  fs.mkdirSync(path.join(ROOT, 'reports'), {recursive: true});
  fs.writeFileSync(path.join(ROOT, 'reports', 'svg-asset-validation.json'), JSON.stringify(report, null, 2));
  console.log(`cel94: ${cel94.actualCount}/${cel94.expectedCount} files, ${cel94.uniqueHashes} unique — ${cel94.status}`);
  console.log(`cel:   ${cel.actualCount}/${cel.expectedCount} files, ${cel.uniqueHashes} unique — ${cel.status}`);
  for (const p of [...cel94.problems, ...cel.problems]) console.log('  PROBLEM:', p);
  const devSummary = {};
  for (const d of [...cel94.deviations, ...cel.deviations]) {
    const key = d.replace(/^f_\d{3}\.svg: /, '');
    devSummary[key] = (devSummary[key] || 0) + 1;
  }
  for (const [k, n] of Object.entries(devSummary)) console.log(`  NOTE (x${n}):`, k);
  process.exit(report.status === 'PASS' ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
