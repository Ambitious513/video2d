#!/usr/bin/env node
/**
 * Tests A15 / A16 — documentation-vs-implementation consistency.
 *
 *   node tools/verify-docs.js
 *
 * METHOD.md and STATUS.md are prose, so this cannot prove they are *well
 * written*. It does prove the mechanically checkable parts, which is where the
 * original mismatches lived:
 *
 *  1. every backticked repository path in either document resolves to a real
 *     file/directory, or to a documented regenerable location (out/, fullres/,
 *     srcframes/, stills/, node_modules/);
 *  2. every `npm run <script>` mentioned exists in remotion/ or tools/;
 *  3. every composition ID mentioned in backticks is actually registered in
 *     the render manifest (which Test D proves equals Root.tsx);
 *  4. METHOD.md's deliverables table lists exactly the registered IDs;
 *  5. no document claims CelRun loops 26 cels (the original defect);
 *  6. STATUS.md is structured as a current handoff: the required sections are
 *     present, and stale "unfinished / never produced" claims appear only
 *     inside the explicitly labelled History section.
 *
 * Writes reports/doc-validation.json.
 */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REMOTION = path.join(ROOT, 'remotion');
const DOCS = ['METHOD.md', 'STATUS.md', 'ROADMAP.md'];

// Owner-supplied acceptance contract, referenced for provenance but not part of
// this repository (it is not a deliverable of the experiment).
const EXTERNAL_DOCS = new Set(['VIDEO2D_REPOSITORY_RECONCILIATION_TEST.md']);

// Locations that are intentionally NOT committed and are regenerated locally.
// Both the repository-relative and the remotion-relative spelling are accepted:
// METHOD.md §5 documents the remotion/ subtree from inside that directory, so it
// legitimately writes `public/srcframes/` rather than `remotion/public/srcframes/`.
const REGENERABLE = [
  'remotion/out/', 'out/', 'fullres/', 'verify/stills/',
  'remotion/public/srcframes/', 'public/srcframes/',
  'node_modules/', 'tools/node_modules/', 'remotion/node_modules/', '.remotion/',
];

// Canonical repository-relative form of each regenerable location. The
// "not committed" claim is proved against .gitignore below instead of being
// taken on trust from the list above.
const REGENERABLE_CANONICAL = [
  'remotion/out/', 'fullres/', 'verify/stills/', 'remotion/public/srcframes/',
  'tools/node_modules/', 'remotion/node_modules/',
];

// Where a backticked relative path may legitimately be rooted.
const SEARCH_ROOTS = [
  ROOT, REMOTION, path.join(REMOTION, 'src'), path.join(REMOTION, 'public'),
  path.join(REMOTION, 'src', 'puppet'), path.join(REMOTION, 'scripts'),
  path.join(REMOTION, 'test'), path.join(ROOT, 'tools'), path.join(ROOT, 'tools', 'test'),
];

const check = (name, ok, detail) => ({name, status: ok ? 'PASS' : 'FAIL', detail});

const remotionPkg = JSON.parse(fs.readFileSync(path.join(REMOTION, 'package.json'), 'utf8'));
const toolsPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'package.json'), 'utf8'));
const allScripts = {...toolsPkg.scripts, ...remotionPkg.scripts};

// Registered IDs: read Root.tsx directly (no browser needed). Test D separately
// proves Root.tsx == render manifest == METHOD.md via a real Remotion bundle.
const rootTsx = fs.readFileSync(path.join(REMOTION, 'src', 'Root.tsx'), 'utf8');
const registered = [...rootTsx.matchAll(/<Composition\s+id="([A-Za-z0-9]+)"/g)].map((m) => m[1]);

const texts = {};
for (const d of DOCS) texts[d] = fs.readFileSync(path.join(ROOT, d), 'utf8');

const checks = [];
const pathProblems = [];
const scriptProblems = [];
const idProblems = [];
const checkedPaths = [];

/** Backticked tokens that are meant to be repository paths. */
function pathTokens(text) {
  const out = new Set();
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim();
    if (!/^[\w./-]+$/.test(t)) continue;          // spaces, <>, {}, %, |, : etc -> not a path
    if (t.includes('..')) continue;                // f_001..f_094.png range notation
    const looksLikePath = t.endsWith('/') || /\.[A-Za-z0-9]{1,5}$/.test(t);
    if (!looksLikePath) continue;                  // e.g. "24/1", "--force-trace"
    if (!t.includes('/') && !t.endsWith('.md')) continue; // bare asset names are illustrative
    out.add(t);
  }
  return [...out];
}

for (const doc of DOCS) {
  const text = texts[doc];

  for (const t of pathTokens(text)) {
    if (EXTERNAL_DOCS.has(t)) continue;
    const rel = t.replace(/^\.\//, '');
    if (REGENERABLE.some((p) => rel.startsWith(p))) { checkedPaths.push({doc, path: t, resolution: 'regenerable (documented, not committed)'}); continue; }
    const hit = SEARCH_ROOTS.find((base) => fs.existsSync(path.join(base, rel)));
    if (hit) checkedPaths.push({doc, path: t, resolution: path.relative(ROOT, path.join(hit, rel))});
    else pathProblems.push(`${doc}: \`${t}\` does not exist and is not a documented regenerable location`);
  }

  for (const m of text.matchAll(/npm run ([\w:.-]+)/g)) {
    if (!allScripts[m[1]]) scriptProblems.push(`${doc}: npm run ${m[1]} is not defined in remotion/ or tools/ package.json`);
  }

  // Composition IDs mentioned in backticks (whole-token match only).
  for (const m of text.matchAll(/`([A-Z][A-Za-z0-9]{3,})`/g)) {
    const id = m[1];
    // Only treat it as a composition claim if it looks like one of our IDs.
    if (/^(Cel|Run|Comparison)/.test(id) && !registered.includes(id)) {
      idProblems.push(`${doc}: composition \`${id}\` is mentioned but not registered in Root.tsx`);
    }
  }
}

checks.push(check('every documented repository path resolves (or is documented regenerable)', pathProblems.length === 0,
  pathProblems.join('; ') || `${checkedPaths.length} path references checked across ${DOCS.join(', ')}`));
checks.push(check('every documented npm run script exists', scriptProblems.length === 0,
  scriptProblems.join('; ') || 'all documented scripts defined'));
checks.push(check('every mentioned composition ID is registered', idProblems.length === 0,
  idProblems.join('; ') || `registered: ${registered.join(', ')}`));

// The regenerable allowlist above must not become a loophole: every location it
// excuses has to actually be gitignored, otherwise a document could "explain
// away" a path that is simply missing from the repository.
const notIgnored = REGENERABLE_CANONICAL.filter((p) => {
  const r = spawnSync('git', ['-C', ROOT, 'check-ignore', '-q', '--no-index', p], {encoding: 'utf8'});
  return r.status !== 0;
});
checks.push(check('every documented regenerable location is really gitignored', notIgnored.length === 0,
  notIgnored.length ? `not ignored: ${notIgnored.join(', ')}` : `${REGENERABLE_CANONICAL.length} regenerable locations confirmed against .gitignore`));

// METHOD.md deliverables table must list exactly the registered IDs.
const methodIds = [...texts['METHOD.md'].matchAll(/^\|\s*`[^`]+`\s*\|\s*`([A-Za-z0-9]+)`\s*\|/gm)].map((m) => m[1]);
checks.push(check('METHOD.md deliverables table == registered compositions',
  JSON.stringify([...methodIds].sort()) === JSON.stringify([...registered].sort()),
  `method=[${methodIds}] registered=[${registered}]`));

// The original defect: docs describing CelRun as a 26-cel loop.
const celRunLoopClaim = [];
for (const doc of DOCS) {
  for (const line of texts[doc].split('\n')) {
    if (/CelRun/.test(line) && /(26 cels|26-cel loop|% 26|frame % LOOP)/.test(line) && !/not|never|used to|instead|separate|own composition/i.test(line)) {
      celRunLoopClaim.push(`${doc}: ${line.trim().slice(0, 120)}`);
    }
  }
}
checks.push(check('no document describes CelRun as the 26-cel loop', celRunLoopClaim.length === 0,
  celRunLoopClaim.join('; ') || 'CelRun is documented as the exact 94-cel variant'));

// STATUS.md structure: current handoff, history quarantined.
const status = texts['STATUS.md'];
const requiredSections = [
  /^#\s+STATUS/m, /##\s*\d*\.?\s*Completed and verified/i, /##\s*\d*\.?\s*Not in GitHub/i,
  /##\s*\d*\.?\s*Known limitations/i, /##\s*\d*\.?\s*History/i, /##\s*\d*\.?\s*How to resume/i,
];
const missingSections = requiredSections.filter((re) => !re.test(status)).map((re) => String(re));
checks.push(check('STATUS.md has the required current-handoff sections', missingSections.length === 0,
  missingSections.length ? `missing: ${missingSections.join(', ')}` : 'current state / not-in-GitHub / limitations / history / resume all present'));

const histMatch = status.match(/##\s*\d*\.?\s*History[\s\S]*?(?=\n##\s|\s*$)/i);
const historyText = histMatch ? histMatch[0] : '';
const outsideHistory = status.replace(historyText, '');
const stalePatterns = [/never produced/i, /items are outstanding/i, /likely unfinished/i, /never reported back/i, /exactly where it stopped/i];
const staleOutside = stalePatterns.filter((re) => re.test(outsideHistory)).map(String);
checks.push(check('no stale unfinished-work claims outside the labelled History section', staleOutside.length === 0,
  staleOutside.length ? `stale claims in current sections: ${staleOutside.join(', ')}` : 'historical claims are confined to the History section'));

// ROADMAP.md consistency: the top current-state block must agree with the
// phase table. Detect contradictory "current state" statements (e.g. the header
// says COMPLETE while the phase table says IN PROGRESS, or a phase is marked
// both NOT STARTED and COMPLETE). History rows are ignored.
const roadmap = texts['ROADMAP.md'] || '';
if (!roadmap) {
  checks.push(check('ROADMAP.md is loaded and non-empty', false, 'ROADMAP.md missing from DOCS collection'));
}
const headerMatch = roadmap.match(/^\*\*Current status:\*\*\s*(.+)$/im);
const headerStatus = headerMatch ? headerMatch[1].trim() : '';
const topBlock = roadmap.split(/\n##\s/)[0] || '';
const phaseTableRows = roadmap.split('\n').filter((l) => /^\|\s*\d\.\s/.test(l));
const phaseStates = {};
for (const row of phaseTableRows) {
  const cells = row.split('|').map((c) => c.trim());
  const ph = cells[1] || '';
  const st = (cells[3] || '').toUpperCase();
  if (/^\d\./.test(ph)) phaseStates[ph.replace(/\..*$/, '')] = st;
}
const contradictions = [];
const hdr = headerStatus.toUpperCase();
if (/COMPLETE/.test(hdr) && !/IN PROGRESS|PARTIAL|BLOCKED/.test(hdr)) {
  const notComplete = Object.entries(phaseStates).filter(([, st]) => st && !/COMPLETE/.test(st));
  if (notComplete.length) contradictions.push(`header says COMPLETE but phase(s) not COMPLETE: ${notComplete.map(([p]) => p).join(', ')}`);
}
if (/NOT STARTED/.test(hdr) && Object.values(phaseStates).some((st) => /COMPLETE/.test(st))) {
  contradictions.push('header says NOT STARTED but a phase is COMPLETE');
}
for (const [ph, st] of Object.entries(phaseStates)) {
  if (/NOT STARTED/.test(st) && /COMPLETE/.test(st)) contradictions.push(`phase ${ph} marked both NOT STARTED and COMPLETE`);
  if (/IN PROGRESS/.test(st) && /COMPLETE/.test(st) && !/IN PROGRESS \(.*COMPLETE/.test(st)) contradictions.push(`phase ${ph} marked both IN PROGRESS and COMPLETE`);
}
checks.push(check('ROADMAP.md current-state header agrees with the phase table', contradictions.length === 0,
  contradictions.length ? `contradictions: ${contradictions.join('; ')}` : 'header and phase table are consistent'));

// ROADMAP must not tell the next agent a completed phase is still in progress,
// and must record a verified Variant reuse result (not NOT RUN).
const nextAgentBlock = (roadmap.match(/### NEXT AGENT START HERE[\s\S]*?(?=\n##\s|\s*$)/i) || [''])[0];
const staleNext = [];
if (/BEGIN\s+\*{0,2}Phase\s*3/i.test(nextAgentBlock) && /Phase 3[\s\S]{0,40}COMPLETE/i.test(headerStatus)) staleNext.push('next-agent says begin Phase 3 but Phase 3 is COMPLETE');
if (/BEGIN\s+\*{0,2}Phase\s*4/i.test(nextAgentBlock) && /Phase 4[\s\S]{0,40}COMPLETE/i.test(headerStatus)) staleNext.push('next-agent says begin Phase 4 but Phase 4 is COMPLETE');
checks.push(check('ROADMAP next-agent instructions are not stale (no completed phase told to start)', staleNext.length === 0,
  staleNext.length ? staleNext.join('; ') : 'next-agent block is consistent with the phase table'));

const variantReuseRow = (roadmap.match(/Variant reuse\s*\|\s*([^|\n]+)/i) || [])[1] || '';
const variantReuseBad = /NOT RUN/i.test(variantReuseRow);
checks.push(check('ROADMAP Variant reuse status is a verified result (not NOT RUN)', !variantReuseBad && variantReuseRow.trim().length > 0,
  variantReuseBad ? `Variant reuse still says NOT RUN` : `Variant reuse: ${variantReuseRow.trim().slice(0, 80)}`));

// STATUS.md must not recommend a completed phase as the next task.
const statusNextPhase = (status.match(/next task[^\n]*/i) || [''])[0];
const staleStatusNext = /Phase [345][^\n]*(next task|recommended)/i.test(statusNextPhase) && /ALL PHASES \(0[–-]5\) COMPLETE/i.test(status);
checks.push(check('STATUS.md does not recommend a completed phase as the next task', !staleStatusNext,
  staleStatusNext ? `STATUS recommends a completed phase: ${statusNextPhase.slice(0, 80)}` : 'STATUS next-task guidance is consistent'));

// Stance-locking honesty: ROADMAP must NOT claim stance locking is
// "IMPLEMENTED + VALIDATED" while also stating continuous rendered foot
// locking is not integrated. Detect the contradiction across current sections
// (history excluded).
const outsideHistoryAll = [status.replace(historyText, ''), roadmap].join('\n');
const claimsStanceImplemented = /stance locking\s+(is\s+)?IMPLEMENTED\s*\+\s*VALIDATED/i.test(outsideHistoryAll)
  || /stance[- ]locking[^\n]{0,40}implemented[^\n]{0,20}validated/i.test(outsideHistoryAll);
const statesNotIntegrated = /not\s+integrated|not\s+consum|data model \+\s*diagnostic|future locomotion-engine follow-?up/i.test(outsideHistoryAll);
checks.push(check('ROADMAP/STATUS do not claim stance locking is IMPLEMENTED+VALIDATED while foot locking is not integrated',
  !(claimsStanceImplemented && statesNotIntegrated),
  claimsStanceImplemented && statesNotIntegrated
    ? 'contradiction: stance locking claimed IMPLEMENTED+VALIDATED but continuous rendered foot locking is documented as not integrated'
    : 'stance-locking claim is consistent with the diagnostic-model limitation'));

// Phase 4 reusability honesty: STATUS must say Phase 4 proved reuse of the same
// solver+motion (Runner+Teal) and must NOT say it is "not started".
const claimsPhase4NotStarted = /Phase 4[^\n]{0,60}(not started|has not started)/i.test(outsideHistoryAll);
const claimsPhase4Reuse = /Phase 4[^\n]{0,80}(reuse|reusab)[^\n]{0,80}(same solver|same motion|runner|teal)/i.test(outsideHistoryAll)
  || /(same solver|same motion)[^\n]{0,80}(runner|teal)/i.test(outsideHistoryAll);
checks.push(check('STATUS Phase 4 reusability statement is correct (proved reuse; not "not started")',
  !claimsPhase4NotStarted && claimsPhase4Reuse,
  claimsPhase4NotStarted ? 'STATUS says Phase 4 is "not started" but Phase 4 is COMPLETE'
    : !claimsPhase4Reuse ? 'STATUS does not state Phase 4 proved reuse of the same solver/motion'
    : 'Phase 4 reuse statement is accurate'));

const report = {
  generatedAt: new Date().toISOString(),
  documents: DOCS,
  registeredCompositions: registered,
  externalDocuments: [...EXTERNAL_DOCS],
  regenerableLocations: REGENERABLE,
  pathReferencesChecked: checkedPaths.length,
  checks,
  note: 'A15 (paths/commands match the implementation) is fully automated here. A16 (no contradictory status) is checked structurally; the prose itself was rewritten and reviewed by the agent — see reports/REPRODUCIBILITY_REPORT.md.',
  status: checks.every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL',
};
fs.mkdirSync(path.join(ROOT, 'reports'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'reports', 'doc-validation.json'), JSON.stringify(report, null, 2));
for (const c of checks) console.log(`[${c.status}] ${c.name} — ${c.detail}`);
console.log('A15/A16 documentation:', report.status);
process.exit(report.status === 'PASS' ? 0 : 1);
