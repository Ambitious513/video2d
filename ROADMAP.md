# ROADMAP — Video2D Procedural Puppet Upgrade

**Repository:** https://github.com/Ambitious513/video2d
**Shared branch:** feat/constrained-puppet-rig
**Current status:** IN PROGRESS (Phase 0 COMPLETE; Phase 1 next)
**Last updated:** 2026-11-18T00:10Z (UTC)
**Last verified remote commit:** see §7 (verified via `git ls-remote` after every push)
**Latest pushed roadmap checkpoint:** Phase 0 completion commit — completion SHA: record in follow-up checkpoint
**Current agent:** Qwen session 2026-11-18 (bootstrap agent, Arena)

## 1. Mission
Upgrade only the existing procedural puppet into a constrained, reusable 2D character rig. Preserve the reconciled exact-cel and loop experiments. A new Qwen session must be able to continue from this file without prior chat history. Master requirements: owner-supplied `QWEN_VIDEO2D_MULTI_AGENT_HANDOFF_AND_ROADMAP.md` (not committed; this file + `reports/` carry the durable state).

## 2. Current state — read this first
- **Active phase:** Phase 1 (fixed-length skeleton + two-bone IK) — NOT STARTED yet
- **Phase status:** Phase 0 COMPLETE; Phases 1–5 NOT STARTED
- **What is already complete:**
  - Remote baseline verified: `origin/main` = `5d4d13ab92ac38be0397bd2b8feb27e19eefdf98` (documented reconciled baseline, not advanced). Feature branch created from it and pushed.
  - Full suite reproduced in a fresh sandbox (Debian 12, 2 cores, 1.09 GB, Node v20.20.2): `node verify.mjs --install --force-trace` → **A1–A18 all PASS; Test I FAIL 7/8 (pre-existing segment-length defect, exit code 1)**. All 94 re-traced cel94 SVGs byte-identical; cel/ untouched; both committed contact sheets byte-identical; fidelity aggregates reproduce exactly (1.046 / 2.5423 / 5.6307 MAE).
  - Pre-change baseline frozen: `reports/puppet-upgrade-baseline.json` (per-frame segment lengths ×94, lowest-point trajectories, ankle/toe velocities, contact candidates, palette/geometry, SSR hashes) + `reports/puppet-upgrade-baseline-contact-sheet.png` (actual Remotion renders at 0,12,25,26,34,72,93) + verbatim committed-report copies in `reports/baseline/`.
- **What is currently being changed:** nothing in the puppet yet. Phase 1 will add `remotion/src/puppet/rig.ts`, `ik.ts`, `pose.ts`, unit tests, and rewire `Runner.tsx` to solved joints (geometry/draw order unchanged until Phase 3).
- **What is not yet done:** Phases 1–5 entirely.
- **Current blocker:** NONE. Push access works (owner-provided token stored outside the repo, never committed).

### NEXT AGENT START HERE
1. Fetch `origin`, switch to `feat/constrained-puppet-rig`, confirm remote HEAD via `git ls-remote origin refs/heads/feat/constrained-puppet-rig` (should be the Phase 0 SHA-recording follow-up or later).
2. Read this file, `reports/puppet-upgrade-baseline.json`, `reports/baseline/motion-validation.json`, then `remotion/src/puppet/keys.ts`, `Runner.tsx`, `remotion/scripts/motion-check.tsx`, `verify.mjs` (§13b puppet-unchanged gate).
3. First command: `cd remotion && npm test && npm run typecheck` (deps already installed in this workspace; from a clean clone run `node verify.mjs --install` first).
4. Continue only with **Milestone 1** (master plan §5): explicit rig definition + calibrated fixed bone lengths; generic analytic two-bone IK (reachable/unreachable/too-close/mirrored/degenerate cases, explicit bend-side hint); raw targets kept separate from solved joints with per-frame error reporting; Runner.tsx consumes solved joints; Test I split into raw-variation diagnostic + solved configured-length gate (±0.5 px) + IK residual; replace `verify.mjs` `puppet-unchanged` with the §10 scope-audit vs `5d4d13a` (A8 = puppet exists, renders, tests pass).
5. Acceptance: every constrained bone within ±0.5 px of configured length on all 94 frames; no NaN/out-of-bounds; bend side stable incl. wrap; deterministic out-of-order evaluation; IK unit cases pass; before/after contact sheet shows the same character design.

Do not redo: reconciliation (A1–A18 PASS at `5d4d13a`), Phase 0 baseline capture (frozen — `puppet-baseline.ts` refuses overwrite without `--force`).
Do not modify: `remotion/public/cel94/`, `remotion/public/cel/`, `tools/flatrace.js`, locked palette/VTracer params, `source/input_video.mp4`, `remotion/public/audio.m4a`, committed `frames/` + `fullres/f_001..f_026.png`, `remotion/src/cels.ts` semantics, CelRun/CelLoop/Comparison behavior, `reports/baseline/*`, historical Test I evidence.

## 3. Phase roadmap

| Phase | Objective | Status | Completion commit | Evidence | Next gate |
|---|---|---|---|---|---|
| 0. Bootstrap/baseline | Initialize this roadmap; confirm remote baseline and reproduce existing state | COMPLETE | completion SHA: record in follow-up checkpoint | `reports/puppet-upgrade-baseline.json`, `reports/puppet-upgrade-baseline-contact-sheet.png`, `reports/baseline/`, regenerated `reports/test-matrix.json` + logs | done |
| 1. Fixed-length skeleton + IK | Rig definitions, generic two-bone solver, raw vs solved targets | NOT STARTED | — | — | All configured bones within ±0.5 px; IK edge tests pass |
| 2. Foot contacts + stance locking | Contact track, world-space anchors, root modes, foot-slip tests | NOT STARTED | — | — | Stance velocity <0.5 px/frame; drift ≤1.5 px |
| 3. Visual construction + secondary motion | Cohesive silhouettes, torso/feet, backpack, deterministic scarf | NOT STARTED | — | — | Visual review + no regressions; IoU ≥0.68 target, MAE ≤5.6307 |
| 4. Reusable second character | Second appearance/rig profile uses shared solver and motion | NOT STARTED | — | — | Both variants pass same tests without duplicated gait |
| 5. Final verification + docs | Clean clone suite, reports, final technical handoff | NOT STARTED | — | — | All acceptance tests PASS or explicitly approved exceptions |

## 4. Protected baseline and invariants
- Reconciled baseline commit: `5d4d13ab92ac38be0397bd2b8feb27e19eefdf98` (verified equal to `origin/main` at bootstrap, 2026-11-17T23:52Z).
- Preserve `remotion/public/cel94/`, `remotion/public/cel/`, source video/audio, source frames, palette, VTracer settings, and CelRun/CelLoop semantics.
- Do not widen tests to hide a failure. The historical Test I failure (2.891×) stays in the record (`reports/baseline/motion-validation.json`); the new constrained-length check replaces it as the primary gate (master plan §9.7).
- Deterministic evaluation: a frame is a pure function of rig + motion + parameters + frame index.
- `main` is not modified directly; no force-push. Owner reviews the branch/PR before merge.
- `verify.mjs`'s `puppet-unchanged` gate (byte-identity vs `5ab3d64`) must be replaced — not deleted — by a reconciliation-assets-protected scope audit vs `5d4d13a` when puppet files first change (master plan §10, Phase 1). Until then it stays as-is.

## 5. Baseline metrics

| Metric | Baseline | Latest (Phase 0 re-run) | Target / interpretation |
|---|---:|---:|---|
| Puppet MAE | 5.6307 | 5.6307 (reproduced exactly) | Diagnostic only; do not optimize blindly |
| Puppet character IoU | 0.6116 | 0.6116 (reproduced exactly) | Initial visual target ≥0.68 after Phase 3, subject to human review |
| Worst bone max/min ratio | 2.891× | 2.891× (reproduced exactly) | Historical failure (knee→ankle); replace with configured-length error for solved rig |
| Foot slip | Not measured before | 27–74 px/frame ankle vx at deepest ground-proximity frames (baseline characterization) | <0.5 px/frame during verified stance (Phase 2) |
| Stance anchor drift | Not measured before | no unambiguous stance exists in current track (strict candidate rule: 0 frames) | ≤1.5 px over stance interval (Phase 2) |

Source baseline report: `reports/baseline/motion-validation.json`, `reports/baseline/fidelity-all-frames.json`, `reports/REPRODUCIBILITY_REPORT.md` (all at `5d4d13a`).
Raw-key variation already present in measurements: hip→knee 1.958×, knee→ankle 1.890×; build-time Catmull-Rom amplifies knee→ankle to 2.891×; frame interpolation overshoot ≤1.192× (arms).
Contact candidates (UNCERTAIN, for Phase 2 review): near foot ~frames 17–19/43–45/69–71; far foot ~frames 4–6/30–32/56–58/82–84; 13-frame alternation; ground reference y≈972 (shadow ellipse center).

## 6. Latest test state

| Test / command | Status | Exact result | Evidence |
|---|---|---|---|
| Full suite `node verify.mjs --install --force-trace` | PASS except Test I | 17/18 steps PASS; A1–A18 all PASS; suite exit 1 solely due to pre-existing Test I FAIL; cel94 re-trace byte-identical; sheets byte-identical; fidelity exact | `reports/test-matrix.json`, `reports/logs/*.log` (this session's run, 2026-11-18T00:0xZ) |
| Test I `cd remotion && npm run verify:motion` | FAIL (pre-existing) | 7/8 checks PASS; segment-length max/min FAIL: 6 segments >2.0, worst 2.891× knee→ankle; exit 1 | `reports/motion-validation.json`, `reports/logs/motion.log` |
| IK unit tests | NOT RUN | Phase 1 deliverable | — |
| Bone-length validation (solved) | NOT RUN | Phase 1 deliverable | — |
| Foot-contact validation | NOT RUN | Phase 2 deliverable; baseline candidates captured | `reports/puppet-upgrade-baseline.json` |
| Determinism / continuity | PASS | 94/94 identical SSR; no joint/pixel pop at 25→26 wrap (17.18 px vs 276.13 p95; MAD 1.278 vs 5.082 p95) | `reports/motion-validation.json` |
| Visual stills/contact sheet | PASS | 24 stills + 7-frame puppet baseline sheet, all 1920×1080 non-blank | `reports/still-render-validation.json`, `reports/puppet-upgrade-baseline-contact-sheet.png` |
| Variant reuse | NOT RUN | Phase 4 deliverable | — |

## 7. Latest checkpoint
- Session date/time (UTC): 2026-11-18T00:10Z
- Commit(s) pushed: `182dc4d9` roadmap bootstrap; `1efc953f` bootstrap SHA record; (baseline-preservation commit); Phase 0 completion commit (SHA in follow-up)
- Files changed (Phase 0): `ROADMAP.md`, `reports/baseline/*` (new), `reports/puppet-upgrade-baseline.json` (new), `reports/puppet-upgrade-baseline-contact-sheet.png` (new), `remotion/scripts/puppet-baseline.ts` (new), `remotion/scripts/puppet-contact-sheet.mjs` (new), `remotion/package.json` (2 new scripts), regenerated `reports/*.json` + `reports/logs/*` + `reports/FIDELITY.md`
- Tests run: full suite (above); `npx tsx scripts/puppet-baseline.ts`; `node scripts/puppet-contact-sheet.mjs` (7 actual stills)
- Evidence added: listed above
- Remote verified: yes for bootstrap commits; Phase 0 completion verified at push time (see history)
- Worktree clean after push: yes (verified at each checkpoint)

## 8. Decisions and conventions (append when established)
- Coordinate spaces / units: current puppet coordinates are 1920×1080 canvas pixels, y down, 24 fps; character faces +x (right). Root currently fixed (run-in-place); world/root contract formalized in Phase 2. Ground visual reference: shadow ellipse center y=972.
- Rig and joint conventions: to be established in Phase 1 (planned: knee pole toward +x/front, elbow pole toward −x/back; explicit bend-side hint per limb).
- Bone calibration method: to be established in Phase 1 from the 14 raw leg keys + 2 arm extremes in `keys.ts` (robust statistic, documented; raw keys are never overwritten).
- Contact track representation: Phase 2. Baseline candidates are heuristic and labelled UNCERTAIN (`reports/puppet-upgrade-baseline.json` → `measuredNow.feet.*.proximityCandidates`).
- Secondary-motion evaluation method: Phase 3 (must be deterministic for arbitrary frame access).
- Character variant schema: Phase 4.
- Baseline freeze rule: `reports/puppet-upgrade-baseline.json` and `reports/baseline/*` are frozen records; `puppet-baseline.ts` refuses to overwrite without `--force`.
- New tooling: `remotion/scripts/puppet-baseline.ts` (read-only baseline capture), `remotion/scripts/puppet-contact-sheet.mjs` (actual Remotion stills → labelled sheet; reusable for before/after and variants). npm scripts `puppet:baseline`, `puppet:sheet` in `remotion/package.json`.
- Dependencies and licensing decisions: no new dependencies; existing toolchain only (TypeScript/React/SVG/Remotion, sharp/pngjs/ffmpeg-static in tools/).

Do not silently change a decision. Record rationale and migration impact first.

## 9. Known limitations and blockers
- Pre-existing Test I FAIL: limb segment length max/min 2.891× (knee→ankle) vs 2.0 tolerance; 6 segments over tolerance. Cause measured at three levels (raw keys 1.958× → stored track 2.891× → interpolation ≤1.192× overshoot). This is the defect Phase 1 fixes; not a regression.
- No IK, no stance locking, no bone constraints exist yet (never claimed as passing). Baseline characterization shows 27–74 px/frame ankle slip at ground proximity and zero frames satisfying a strict stance candidate rule.
- Puppet visual fidelity gap (MAE 5.6307, char IoU 0.6116) is diagnostic; Phase 3 addresses construction quality.
- Sandbox has ~1 GB RAM / 2 cores: use `render-lowram.mjs` patterns; never multi-threaded Remotion stitch.

## 10. Session history (append-only)

| Date (UTC) | Agent/session | Phase | Commit(s) pushed | Outcome | Tests | Next agent action |
|---|---|---|---|---|---|---|
| 2026-11-17T23:55Z | Qwen bootstrap (Arena) | 0 | 182dc4d9f4214d2418176fb7dc7cfde4801f929a | Roadmap initialized; remote baseline verified = `5d4d13a`; feature branch created; push access confirmed | none yet | Run full suite, write baseline report, then Milestone 1 |
| 2026-11-18T00:10Z | Qwen bootstrap (Arena) | 0 | completion SHA: record in follow-up checkpoint | Phase 0 COMPLETE: suite reproduced (A1–A18 PASS, Test I pre-existing FAIL 7/8), baseline frozen (JSON + contact sheet + preserved reports), cel94/sheets byte-identical after force-trace | `node verify.mjs --install --force-trace` (exit 1, Test I only); baseline capture scripts PASS | Begin Milestone 1 per §2 NEXT AGENT START HERE |

Never delete earlier rows. If an earlier statement is found to be wrong, append a correction row and update the current state above.
