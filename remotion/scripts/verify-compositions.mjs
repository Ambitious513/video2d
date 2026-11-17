#!/usr/bin/env node
/**
 * Test D — composition registry & package validation.
 *
 *   node remotion/scripts/verify-compositions.mjs   (from anywhere)
 *
 * Programmatically compares THREE sources of truth:
 *   1. composition IDs actually exposed by Remotion (getCompositions on a
 *      fresh bundle of src/index.ts);
 *   2. the JOBS render manifest exported by /render-lowram.mjs;
 *   3. the deliverables table documented in METHOD.md.
 * Also checks dimensions/fps/duration, duplicate IDs, and that every
 * `npm run <script>` documented in METHOD.md exists in remotion/package.json
 * or tools/package.json. Writes reports/composition-validation.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {getCompositions} from '@remotion/renderer';
import {JOBS, EXPECTED_FRAMES, FPS, WIDTH, HEIGHT} from '../../render-lowram.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.resolve(HERE, '..');
const ROOT = path.resolve(REMOTION, '..');

const check = (name, ok, detail) => ({name, status: ok ? 'PASS' : 'FAIL', detail});

console.log('bundling remotion entry point...');
const serveUrl = await bundle({
  entryPoint: path.join(REMOTION, 'src', 'index.ts'),
  logLevel: 'error',
});
const comps = await getCompositions(serveUrl);
const registryIds = comps.map((c) => c.id);
const jobIds = JOBS.map((j) => j.id);

// METHOD.md deliverables table rows: | `out/xxx.mp4` | `CompId` | ...
const method = fs.readFileSync(path.join(ROOT, 'METHOD.md'), 'utf8');
const methodIds = [...method.matchAll(/^\|\s*`[^`]+`\s*\|\s*`([A-Za-z0-9]+)`\s*\|/gm)].map((m) => m[1]);

const remotionPkg = JSON.parse(fs.readFileSync(path.join(REMOTION, 'package.json'), 'utf8'));
const toolsPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'package.json'), 'utf8'));
const allScripts = {...toolsPkg.scripts, ...remotionPkg.scripts};
const documentedScripts = [...new Set([...method.matchAll(/npm run ([\w:.-]+)/g)].map((m) => m[1]))];

const checks = [
  check('no duplicate composition IDs', new Set(registryIds).size === registryIds.length, registryIds.join(', ')),
  check('registry IDs == render manifest IDs', JSON.stringify([...registryIds].sort()) === JSON.stringify([...jobIds].sort()), `registry=[${registryIds}] jobs=[${jobIds}]`),
  check('registry IDs == METHOD.md deliverables IDs', JSON.stringify([...registryIds].sort()) === JSON.stringify([...methodIds].sort()), `registry=[${registryIds}] method=[${methodIds}]`),
  check('every documented npm run script exists', documentedScripts.every((s) => allScripts[s]), `documented=[${documentedScripts}] missing=[${documentedScripts.filter((s) => !allScripts[s])}]`),
  check('typecheck script exists', Boolean(remotionPkg.scripts.typecheck), remotionPkg.scripts.typecheck || 'missing'),
  check('tools test script is real (not placeholder exit 1)', Boolean(toolsPkg.scripts.test) && !/exit 1/.test(toolsPkg.scripts.test), toolsPkg.scripts.test),
  check('remotion test script exists', Boolean(remotionPkg.scripts.test), remotionPkg.scripts.test || 'missing'),
];
for (const c of comps) {
  checks.push(check(`${c.id}: ${WIDTH}x${HEIGHT} @ ${FPS}fps, ${EXPECTED_FRAMES} frames`,
    c.width === WIDTH && c.height === HEIGHT && c.fps === FPS && c.durationInFrames === EXPECTED_FRAMES,
    `${c.width}x${c.height} @ ${c.fps}fps, ${c.durationInFrames} frames`));
}

const report = {
  generatedAt: new Date().toISOString(),
  remotionVersion: JSON.parse(fs.readFileSync(path.join(REMOTION, 'node_modules', 'remotion', 'package.json'), 'utf8')).version,
  registry: comps.map((c) => ({id: c.id, width: c.width, height: c.height, fps: c.fps, durationInFrames: c.durationInFrames})),
  renderManifest: JOBS,
  methodDocumentedIds: methodIds,
  documentedNpmScripts: documentedScripts,
  checks,
  status: checks.every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL',
};
fs.mkdirSync(path.join(ROOT, 'reports'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'reports', 'composition-validation.json'), JSON.stringify(report, null, 2));
for (const c of checks) console.log(`[${c.status}] ${c.name} — ${c.detail}`);
console.log('Test D compositions:', report.status);
process.exit(report.status === 'PASS' ? 0 : 1);
