#!/usr/bin/env node
/**
 * Repeatable verification entry point — runs the full reconciliation test
 * suite (Tests A–J) from a clean checkout, in dependency order.
 *
 *   node verify.mjs                     # everything (assumes npm ci done)
 *   node verify.mjs --only=stills,render
 *   node verify.mjs --skip=trace        # cel94 already present
 *   node verify.mjs --force-trace       # re-trace all 94 cels
 *   node verify.mjs --keep-frames       # keep PNG sequences after scoring
 *
 * Prerequisites (documented in METHOD.md §8):
 *   cd tools && npm ci
 *   cd ../remotion && npm ci && npx remotion browser ensure
 *   (+ the Chrome system libs listed in METHOD.md §6)
 *
 * Every step's full output is logged to reports/logs/<step>.log. Statuses are
 * PASS / FAIL / BLOCKED (dependency failed) / NOT RUN (skipped). A failed
 * step never deletes its evidence. Writes reports/test-matrix.json.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.join(ROOT, 'remotion');
const TOOLS = path.join(ROOT, 'tools');
const LOGS = path.join(ROOT, 'reports', 'logs');
fs.mkdirSync(LOGS, {recursive: true});

const argv = process.argv.slice(2);
const getOpt = (name) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=').split(',') : null;
};
const only = getOpt('only');
const skip = getOpt('skip') || [];
const forceTrace = argv.includes('--force-trace');
const keepFrames = argv.includes('--keep-frames');

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = {};

function step(name, cmd, args, cwd, {dependsOn = [], env = {}} = {}) {
  if (only && !only.includes(name)) { results[name] = {status: 'NOT RUN', reason: 'not in --only list'}; return; }
  if (skip.includes(name)) { results[name] = {status: 'NOT RUN', reason: 'skipped via --skip'}; return; }
  const blockedBy = dependsOn.filter((d) => results[d] && results[d].status !== 'PASS' && results[d].status !== 'NOT RUN');
  if (blockedBy.length) {
    results[name] = {status: 'BLOCKED', reason: `dependency failed: ${blockedBy.join(', ')}`};
    console.log(`\n=== ${name}: BLOCKED (${blockedBy.join(', ')}) ===`);
    return;
  }
  const t0 = Date.now();
  const command = `${cmd} ${args.join(' ')}`;
  console.log(`\n=== ${name} ===\n$ (cwd=${cwd}) ${command}`);
  const r = spawnSync(cmd, args, {cwd, encoding: 'utf8', env: {...process.env, ...env}, maxBuffer: 64 * 1024 * 1024});
  const seconds = +((Date.now() - t0) / 1000).toFixed(1);
  const output = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(LOGS, `${name}.log`), `$ ${command}\n(cwd=${cwd})\n\n${output}`);
  // echo a tail so the console stays readable
  const lines = output.trim().split('\n');
  console.log(lines.slice(-14).join('\n'));
  const status = r.status === 0 ? 'PASS' : 'FAIL';
  results[name] = {status, command, cwd, seconds, log: `reports/logs/${name}.log`, exitCode: r.status};
  if (r.error) results[name].error = r.error.message;
  console.log(`=== ${name}: ${status} (${seconds}s) ===`);
}

// 0. deps present? (npm ci itself is a documented prerequisite; logged separately)
const depsOk = fs.existsSync(path.join(TOOLS, 'node_modules', 'ffmpeg-static')) &&
  fs.existsSync(path.join(REMOTION, 'node_modules', 'remotion'));
if (!depsOk) {
  console.error('dependencies missing — run `npm ci` in tools/ and remotion/ first (see METHOD.md §8)');
  process.exit(1);
}

// 1-2. Extraction + source validation (Tests A, B)
step('extract', process.execPath, [path.join(TOOLS, 'extract-frames.js')], ROOT);
step('source', process.execPath, [path.join(TOOLS, 'verify-source.js')], ROOT, {dependsOn: ['extract']});

// 3. Trace 94 unique cels (only if missing/incomplete, or --force-trace)
const cel94Dir = path.join(REMOTION, 'public', 'cel94');
const cel94Count = fs.existsSync(cel94Dir) ? fs.readdirSync(cel94Dir).filter((f) => /^f_\d{3}\.svg$/.test(f)).length : 0;
if (cel94Count === 94 && !forceTrace && !only?.includes('trace')) {
  results.trace = {status: 'PASS', reason: 'cel94 already complete (94 SVGs); use --force-trace to regenerate', seconds: 0};
  console.log('\n=== trace: cel94 already complete (94 SVGs) ===');
} else {
  step('trace', process.execPath, [path.join(TOOLS, 'trace-all.js')], ROOT, {dependsOn: ['extract']});
}

// 4. Asset validation (Test C)
step('assets', process.execPath, [path.join(TOOLS, 'verify-assets.js')], ROOT, {dependsOn: ['trace']});

// 5-7. Unit tests + typecheck (Tests E, D partial, A17)
step('unit-remotion', NPM, ['test'], REMOTION);
step('unit-tools', NPM, ['test'], TOOLS);
step('typecheck', NPM, ['run', 'typecheck'], REMOTION);

// 8. Composition registry (Test D)
step('compositions', process.execPath, [path.join(REMOTION, 'scripts', 'verify-compositions.mjs')], REMOTION, {dependsOn: ['typecheck']});

// 9. Stills + contact sheets (Tests F, J)
step('stills', process.execPath, [path.join(REMOTION, 'scripts', 'render-stills.mjs')], REMOTION, {dependsOn: ['assets', 'compositions']});

// 10. Full low-RAM render (Test G) — keep frames for scoring
step('render', process.execPath, [path.join(ROOT, 'render-lowram.mjs')], ROOT, {dependsOn: ['assets', 'compositions'], env: {KEEP_FRAMES: '1'}});

// 11. Full-sequence fidelity (Test H)
step('fidelity', process.execPath, [
  path.join(TOOLS, 'score-fidelity.js'),
  '--cel94', 'remotion/out/celframes',
  '--celLoop', 'remotion/out/celloopframes',
  '--puppet', 'remotion/out/puppetframes',
], ROOT, {dependsOn: ['render']});

// 12. Motion & continuity (Test I)
step('motion', NPM, ['run', 'verify:motion'], REMOTION);

// 13. Tracked-file audit (A18): nothing regenerable/private may be tracked
{
  const r = spawnSync('git', ['-C', ROOT, 'ls-files'], {encoding: 'utf8'});
  const tracked = r.stdout.trim().split('\n');
  const bad = tracked.filter((f) =>
    f.includes('node_modules/') || f.startsWith('remotion/out/') || f.endsWith('.mp4') && !f.startsWith('source/') ||
    f.startsWith('verify/stills/') || f.startsWith('remotion/public/srcframes/') ||
    /^fullres\/f_(0(2[7-9]|[3-9]\d)|\d{3,})\.png$/.test(f) || f.endsWith('_flat.png'));
  // source/input_video.mp4 is the ground-truth media and MUST stay tracked
  const status = bad.length === 0 && tracked.includes('source/input_video.mp4') ? 'PASS' : 'FAIL';
  results['tracked-audit'] = {status, detail: bad.length ? `forbidden tracked files: ${bad.join(', ')}` : `${tracked.length} tracked files, none forbidden`, seconds: 0};
  console.log(`\n=== tracked-audit: ${status} — ${results['tracked-audit'].detail} ===`);
}

// 14. Cleanup regenerable sequences ONLY after render+frame verification AND
// fidelity scoring succeeded (contract: never delete evidence of a failure).
if (!keepFrames && results.render?.status === 'PASS' && results.fidelity?.status === 'PASS') {
  for (const seq of ['celframes', 'celloopframes', 'puppetframes', 'compareframes']) {
    fs.rmSync(path.join(REMOTION, 'out', seq), {recursive: true, force: true});
  }
  console.log('\ncleaned regenerable PNG sequences (render + fidelity both PASS)');
} else if (results.render?.status === 'PASS') {
  console.log('\nPNG sequences kept (fidelity not PASS or --keep-frames)');
}

// Summary + acceptance-criteria matrix (automatable criteria; documentation
// review criteria A15/A16 are completed in reports/REPRODUCIBILITY_REPORT.md)
const s = (n) => results[n]?.status ?? 'NOT RUN';
const all = (...ns) => ns.every((n) => s(n) === 'PASS') ? 'PASS' : ns.some((n) => s(n) === 'FAIL') ? 'FAIL' : ns.some((n) => s(n) === 'BLOCKED') ? 'BLOCKED' : 'NOT RUN';
const matrix = {
  A1: {criterion: 'Source media metadata verified', status: s('source'), evidence: 'reports/source-media.json'},
  A2: {criterion: 'All 94 source frames extractable', status: s('source'), evidence: 'reports/source-frame-validation.json'},
  A3: {criterion: '94 unique exact SVG cels exist and validate', status: s('assets'), evidence: 'reports/svg-asset-validation.json'},
  A4: {criterion: '26 loop cels intact', status: s('assets'), evidence: 'reports/svg-asset-validation.json'},
  A5: {criterion: 'Exact/loop compositions distinct, mapping correct', status: all('unit-remotion', 'compositions'), evidence: 'reports/logs/unit-remotion.log + reports/composition-validation.json'},
  A6: {criterion: 'Every advertised render job registered', status: s('compositions'), evidence: 'reports/composition-validation.json'},
  A7: {criterion: 'Low-RAM script works from documented invocation', status: s('render'), evidence: 'reports/render-validation.json + reports/logs/render.log'},
  A8: {criterion: 'Puppet present, design unchanged', status: all('motion', 'stills'), evidence: 'git diff (puppet files untouched) + reports/motion-validation.json'},
  A9: {criterion: 'All required stills render correctly', status: s('stills'), evidence: 'reports/still-render-validation.json + verify/contact-sheet.png'},
  A10: {criterion: 'All compositions render 94 frames @24fps 1920x1080', status: s('render'), evidence: 'reports/render-validation.json'},
  A11: {criterion: 'Exact-cel all-frame fidelity measured', status: s('fidelity'), evidence: 'reports/fidelity-all-frames.json'},
  A12: {criterion: '26-loop drift measured, described as expected', status: s('fidelity'), evidence: 'reports/fidelity-all-frames.json + reports/FIDELITY.md'},
  A13: {criterion: 'Puppet metrics diagnostic-only', status: s('fidelity'), evidence: 'reports/fidelity-all-frames.json (objective field)'},
  A14: {criterion: 'Comparison composition + proof sheet work', status: all('stills', 'render'), evidence: 'verify/comparison-contact-sheet.png + remotion/out/comparison-source-vs-2d.mp4'},
  A17: {criterion: 'Clean install + typecheck succeed', status: all('typecheck', 'unit-tools'), evidence: 'reports/logs/typecheck.log + npm ci logs'},
  A18: {criterion: 'No MP4s/node_modules/temp sequences committed', status: s('tracked-audit'), evidence: 'reports/test-matrix.json (tracked-audit)'},
};
const out = {generatedAt: new Date().toISOString(), steps: results, acceptanceMatrix: matrix};
fs.writeFileSync(path.join(ROOT, 'reports', 'test-matrix.json'), JSON.stringify(out, null, 2));
console.log('\n=== verification summary ===');
for (const [n, r] of Object.entries(results)) console.log(`${n.padEnd(16)} ${r.status}${r.reason ? ' — ' + r.reason : ''}`);
const failed = Object.values(results).some((r) => r.status === 'FAIL' || r.status === 'BLOCKED');
console.log(`\nmatrix: reports/test-matrix.json — overall ${failed ? 'FAIL/BLOCKED present' : 'PASS'}`);
process.exit(failed ? 1 : 0);
