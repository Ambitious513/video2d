# ROADMAP — Video2D Procedural Puppet Upgrade

**Repository:** https://github.com/Ambitious513/video2d
**Shared branch:** feat/constrained-puppet-rig
**Current status:** IN PROGRESS (Phase 0 COMPLETE; Phase 1 implementation verified, gate evidence being finalized)
**Last updated:** 2026-11-18T09:30Z (UTC)
**Last verified remote commit:** see §7 (verified via `git ls-remote` after every push)
**Latest pushed roadmap checkpoint:** 2303f94d1ee94f6b329ac949b916d5374f17370b (Phase 0 SHA-recording follow-up; verified via `git ls-remote` 2026-11-18T09:10Z). Correction: the previous header named `1dd5600d` as the latest checkpoint, but `2303f94d` was pushed after it — see History.
**Current agent:** Qwen session 2026-11-18 (Phase 1 recovery + completion agent, Arena)

## 1. Mission
Upgrade only the existing procedural puppet into a constrained, reusable 2D character rig. Preserve the reconciled exact-cel and loop experiments. A new Qwen session must be able to continue from this file without prior chat history. Master requirements: owner-supplied `QWEN_VIDEO2D_MULTI_AGENT_HANDOFF_AND_ROADMAP.md` (not committed; this file + `reports/` carry the durable state).

## 2. Current state — read this first
- **Active phase:** Phase 1 (fixed-length skeleton + two-bone IK) — IN PROGRESS
- **Phase status:** Phase 0 COMPLETE; Phase 1 IN PROGRESS; Phases 2–5 NOT STARTED
- **What is already complete:**
  - Remote baseline verified: `origin/main` = `5d4d13ab92ac38be0397bd2b8feb27e19eefdf98` (documented reconciled baseline, not advanced). Feature branch created from it and pushed.
  - Full suite reproduced in a fresh sandbox (Debian 12, 2 cores, 1.09 GB, Node v20.20.2): `node verify.mjs --install --force-trace` → **A1–A18 all PASS; Test I FAIL 7/8 (pre-existing segment-length defect, exit code 1)**. All 94 re-traced cel94 SVGs byte-identical; cel/ untouched; both committed contact sheets byte-identical; fidelity aggregates reproduce exactly (1.046 / 2.5423 / 5.6307 MAE).
  - Pre-change baseline frozen: `reports/puppet-upgrade-baseline.json` (per-frame segment lengths ×94, lowest-point trajectories, ankle/toe velocities, contact candidates, palette/geometry, SSR hashes) + `reports/puppet-upgrade-baseline-contact-sheet.png` (actual Remotion renders at 0,12,25,26,34,72,93) + verbatim committed-report copies in `reports/baseline/`.
- **What is currently being changed (Phase 1, IN PROGRESS):** new `remotion/src/puppet/rig.ts` (rig definition + calibrated bone lengths), `remotion/src/puppet/ik.ts` (generic two-bone solver), `remotion/src/puppet/pose.ts` (raw targets vs solved joints + diagnostics); `Runner.tsx` rewired to solved joints (geometry/draw order unchanged until Phase 3); `remotion/test/ik.test.ts` + `rig.test.ts` + `pose.test.ts`; `motion-check.tsx` Test I split; `verify.mjs` §10 scope-audit replacing puppet-unchanged. Test commands: `cd remotion && npm test && npm run typecheck && npm run verify:motion && npm run verify:ik`, then `node verify.mjs --install --force-trace`.
- **Phase 1 implementation state (this session):** the previous session implemented all of the above but reached its usage limit before pushing. Its worktree was recovered from the owner-supplied Drive snapshot (19 changed/new files; all 365 tracked files present, unchanged files verified byte-identical to the clone). Every gate was then **independently re-run in a fresh sandbox and reproduces exactly**: `npm test` 45/45 PASS, `typecheck` clean, `verify:motion` 12/12 PASS, `verify:ik` 7/7 gates + 14/14 solver cases PASS. Regenerated `reports/motion-validation.json` and `reports/ik-validation.json` are byte-identical to the recovered ones apart from `generatedAt`.
- **What is not yet done:** Phase 1 completion evidence — full `node verify.mjs --install --force-trace` re-run with the changed puppet, Phase 1 rendered contact sheet + before/after comparison, `reports/PROCEDURAL_RIG_UPGRADE_REPORT.md`, final roadmap flip to COMPLETE. Phases 2–5 entirely.
- **Current blocker:** NONE. Push access works (owner-provided token stored outside the repo, never committed).

### NEXT AGENT START HERE
1. Fetch `origin`, switch to `feat/constrained-puppet-rig`, confirm remote HEAD via `git ls-remote origin refs/heads/feat/constrained-puppet-rig`.
2. Read this file, then `remotion/src/puppet/{rig,ik,pose}.ts`, `reports/ik-validation.json`, `reports/motion-validation.json`, and `verify.mjs` §13b (`scope-audit`, which replaced `puppet-unchanged`).
3. First command: `cd remotion && npm test && npm run typecheck && npm run verify:motion && npm run verify:ik` (from a clean clone run `node verify.mjs --install` first; ~1 GB RAM sandbox — see `setup-deps` notes in §9).
4. **Phase 1 implementation is DONE and its focused gates PASS** (45/45 unit, 12/12 motion, 7/7 IK gates, 14/14 solver cases). Do NOT re-implement rig/ik/pose or re-calibrate the bone lengths. Remaining Phase 1 completion evidence only:
   a. `node verify.mjs --install --force-trace` from the repo root — full suite with the changed puppet; confirm A1–A18 PASS, cel94 re-trace byte-identical, and record the new `RunCycle` MAE/IoU honestly (they are expected to move; Phase 1 does not target visual fidelity).
   b. `node remotion/scripts/puppet-contact-sheet.mjs --comp RunCycle --frames 0,12,25,26,34,72,93 --out reports/puppet-phase1-contact-sheet.png --label "Phase 1 constrained puppet"` and compare against the frozen `reports/puppet-upgrade-baseline-contact-sheet.png` (same character design must be recognizable).
   c. Write `reports/PROCEDURAL_RIG_UPGRADE_REPORT.md` (Phase 1 section: design decisions, calibration, measured results, limitations, exact reproduction commands).
   d. Flip Phase 1 to COMPLETE in §3 only if all of the above pass; commit, push, verify remote SHA, then record the SHA in a follow-up commit.
5. Then stop at the phase boundary. Phase 2 (foot contacts / stance locking) is the next phase, not part of this checkpoint.

Do not redo: reconciliation (A1–A18 PASS at `5d4d13a`), Phase 0 baseline capture (frozen — `puppet-baseline.ts` refuses overwrite without `--force`).
Do not modify: `remotion/public/cel94/`, `remotion/public/cel/`, `tools/flatrace.js`, locked palette/VTracer params, `source/input_video.mp4`, `remotion/public/audio.m4a`, committed `frames/` + `fullres/f_001..f_026.png`, `remotion/src/cels.ts` semantics, CelRun/CelLoop/Comparison behavior, `reports/baseline/*`, historical Test I evidence.

## 3. Phase roadmap

| Phase | Objective | Status | Completion commit | Evidence | Next gate |
|---|---|---|---|---|---|
| 0. Bootstrap/baseline | Initialize this roadmap; confirm remote baseline and reproduce existing state | COMPLETE | 1dd5600dd2503942aca43fe24ae01fc222fb9f50 | `reports/puppet-upgrade-baseline.json`, `reports/puppet-upgrade-baseline-contact-sheet.png`, `reports/baseline/`, regenerated `reports/test-matrix.json` + logs | done |
| 1. Fixed-length skeleton + IK | Rig definitions, generic two-bone solver, raw vs solved targets | IN PROGRESS | — | — | All configured bones within ±0.5 px; IK edge tests pass |
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
| Worst bone max/min ratio | 2.891× | 2.891× raw track (unchanged reference data, now a non-gating diagnostic) | Historical failure (knee→ankle); replaced as the primary gate by the row below |
| Solved bone-length error (max over 94 frames × 8 bones) | unconstrained (no bones existed) | **1.421e-13 px** | Gate ±0.5 px — PASS by ~13 orders of magnitude (analytic solve) |
| IK reachable end-effector residual | n/a | **0 px**, 0 clamped frames | Gate ≤1 px — every measured ankle/fist target is reachable |
| Foot slip | Not measured before | 27–74 px/frame ankle vx at deepest ground-proximity frames (baseline characterization) | <0.5 px/frame during verified stance (Phase 2) |
| Stance anchor drift | Not measured before | no unambiguous stance exists in current track (strict candidate rule: 0 frames) | ≤1.5 px over stance interval (Phase 2) |

Source baseline report: `reports/baseline/motion-validation.json`, `reports/baseline/fidelity-all-frames.json`, `reports/REPRODUCIBILITY_REPORT.md` (all at `5d4d13a`).
Raw-key variation already present in measurements: hip→knee 1.958×, knee→ankle 1.890×; build-time Catmull-Rom amplifies knee→ankle to 2.891×; frame interpolation overshoot ≤1.192× (arms).
Contact candidates (UNCERTAIN, for Phase 2 review): near foot ~frames 17–19/43–45/69–71; far foot ~frames 4–6/30–32/56–58/82–84; 13-frame alternation; ground reference y≈972 (shadow ellipse center).

## 6. Latest test state

| Test / command | Status | Exact result | Evidence |
|---|---|---|---|
| Full suite `node verify.mjs --install --force-trace` | PASS except Test I (at Phase 0) | Phase 0 run: 17/18 steps PASS; A1–A18 all PASS; suite exit 1 solely due to pre-existing Test I FAIL; cel94 re-trace byte-identical; sheets byte-identical; fidelity exact. **Phase 1 re-run with the changed puppet: PENDING this session** | `reports/test-matrix.json`, `reports/logs/*.log` |
| Test I `cd remotion && npm run verify:motion` | PASS (Phase 1, rewritten) | 12/12 checks PASS; historical pre-upgrade result (7/8 FAIL, 2.891× knee→ankle) preserved verbatim in `reports/baseline/motion-validation.json` | `reports/motion-validation.json`, `reports/logs/motion.log` |
| IK unit tests | PASS | `cd remotion && npm test` → 45/45 PASS (cels 12 + ik 13 + rig 10 + pose 10); exit 0. Includes reachable/max/beyond-max/too-close/coincident, both pole hints, mirrored facing, near-straight/folded, purity, invalid-rig throws, equal-length bones, seeded 500-target sweep | `reports/logs/unit-remotion.log` |
| Bone-length validation (solved) | PASS | `npm run verify:ik` → 7/7 gates, 14/14 solver cases; worst configured-length error **1.421e-13 px** over 94 frames × 8 bones (gate ±0.5); reachable residual 0 px, 0 clamped frames; bend sides constant (knees −1, elbows +1) incl. 25→26 wrap; out-of-order determinism identical | `reports/ik-validation.json` |
| Test I (rewritten, constrained) | PASS | `npm run verify:motion` → **12/12 PASS** (was 7/8 FAIL). Raw-track variation retained as a non-gating diagnostic: raw keys 1.958×, stored track 2.891×, frame-interp overshoot 1.192× | `reports/motion-validation.json` |
| Foot-contact validation | NOT RUN | Phase 2 deliverable; baseline candidates captured | `reports/puppet-upgrade-baseline.json` |
| Determinism / continuity | PASS | 94/94 identical SSR; no joint/pixel pop at 25→26 wrap (17.18 px vs 276.13 p95; MAD 1.278 vs 5.082 p95) | `reports/motion-validation.json` |
| Visual stills/contact sheet | PASS | 24 stills + 7-frame puppet baseline sheet, all 1920×1080 non-blank | `reports/still-render-validation.json`, `reports/puppet-upgrade-baseline-contact-sheet.png` |
| Variant reuse | NOT RUN | Phase 4 deliverable | — |

## 7. Latest checkpoint
- Session date/time (UTC): 2026-11-18T09:30Z
- Recovery: previous session's unpushed Phase 1 worktree restored from the owner-supplied Drive snapshot (`18nBGm3soSLspThDrhReHhWEfVpsK_ina`). Method: recursive folder manifest via `embeddedfolderview`; the 19 files whose mtime differed from the 4:19 pm clone time were downloaded; two unchanged control files (`ROADMAP.md`, `reports/puppet-upgrade-baseline.json`) were verified byte-identical to the GitHub clone, confirming the heuristic. All 365 tracked files were present; nothing was discarded.
- Files changed (Phase 1): NEW `remotion/src/puppet/{rig,ik,pose}.ts`, `remotion/test/{ik,rig,pose}.test.ts`, `remotion/scripts/ik-validate.ts`, `reports/ik-validation.json`; MODIFIED `remotion/src/puppet/{Runner.tsx,keys.ts}`, `remotion/scripts/motion-check.tsx`, `remotion/package.json` (test glob + `verify:ik`), `verify.mjs` (Test I note, new `ik` step, `puppet-unchanged` → `scope-audit`, A8 redefinition), `reports/motion-validation.json`, `reports/test-matrix.json`, `reports/logs/*`, `ROADMAP.md`.
- Tests run this session (all re-run from scratch, not inherited): `npm test` 45/45 PASS; `npm run typecheck` clean; `npm run verify:motion` 12/12 PASS; `npm run verify:ik` 7/7 gates + 14/14 cases PASS; `node verify.mjs --only=unit-remotion,typecheck` → `scope-audit` PASS, `tracked-audit` PASS.
- Evidence added: `reports/ik-validation.json` (new), regenerated `reports/motion-validation.json`.
- Remote verified: pending at the time of writing this checkpoint; recorded in History after push.
- Worktree clean after push: verified at each checkpoint.

## 8. Decisions and conventions (append when established)
- Coordinate spaces / units: current puppet coordinates are 1920×1080 canvas pixels, y down, 24 fps; character faces +x (right). Root currently fixed (run-in-place); world/root contract formalized in Phase 2. Ground visual reference: shadow ellipse center y=972.
- Rig and joint conventions (ESTABLISHED Phase 1 — do not silently change): joints `hip/knee/ankle/toe` per leg, `shoulder/elbow/fist` per arm; near/far sides. `bendSign` = sign of `cross(root→target, root→mid)` in screen coords (y down): **knees −1 (toward +x/front), elbows +1 (trailing)**. Mirroring a character mirrors x AND flips `bendSign`. Solver clamps target distance into `[|l1−l2|+EPS, l1+l2−EPS]`, `IK_EPS = 1e-6`; zero-distance direction fallback is deterministically `+x`. `end` is the point actually reached; `residual = |target − end|` is always reported. Feet are **geometry, not bones**: `ankle→toe` keeps constant artwork length `rig.footLen` along the raw foot direction, applied at the solved ankle.
- Bone calibration method (ESTABLISHED Phase 1, reproducible via `calibrateRunnerRig()` in `rig.ts`, asserted by `test/rig.test.ts`): legs — total `T = max measured hip→ankle span (363.3235) + 0.5 px reach margin = 363.8235`, thigh/calf split by least-squares fit of the IK knee to the 14 raw measured knees (scan l1 ∈ [140,220] step 0.25, bend −1) → **thigh 186.00 / calf 177.82 px**. Arms — upper = mean of the two extreme readings → **115.91 px**; forearm = the reliable near-straight back-extreme reading → **91.97 px** (the fwd reading 131.1 would force a bend into a measured straight arm; reachability guard raises it if the 26-frame fist span ever exceeds reach). Foot artwork = median of 14 ankle→toe readings → **87.30 px**. Raw keys are never overwritten (`NEAR_LEG_RAW`/`FAR_LEG_RAW` exported read-only from `keys.ts`).
- Raw-vs-solved deviation (Phase 1, reported not hidden): the solver prioritizes exact end-effector reach + fixed bones, so the noisy raw mid targets are NOT hard constraints. Over 94 frames the knee deviates from its raw reading by max **141.05 px** (rms ≈63), elbow max **45.18 px** (rms ≈34). Over the 14 raw calibration poses the knee fit is rms 54.64 / max 73.90 px. Per-frame values live in `reports/ik-validation.json` → `frameSweep.perFrame`. This is a consequence of constraining bones against hand-measured noise, not a solver defect; Phase 2 stance anchors will re-derive foot placement from world contacts.
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
| 2026-11-18T00:10Z | Qwen bootstrap (Arena) | 0 | 1dd5600dd2503942aca43fe24ae01fc222fb9f50 | Phase 0 COMPLETE: suite reproduced (A1–A18 PASS, Test I pre-existing FAIL 7/8), baseline frozen (JSON + contact sheet + preserved reports), cel94/sheets byte-identical after force-trace | `node verify.mjs --install --force-trace` (exit 1, Test I only); baseline capture scripts PASS | Begin Milestone 1 per §2 NEXT AGENT START HERE |

| 2026-11-18T00:34Z | Qwen Phase 1 (Arena, session A) | 1 | NONE — usage limit hit before push | Implemented rig/ik/pose + 45 unit tests + Test I rewrite + ik-validate + verify.mjs scope-audit; local gates passed (45/45, 12/12, 7/7) but work was never pushed. Worktree preserved by the owner to Drive. | local `npm test`, `verify:motion`, `verify:ik`, partial `verify.mjs` | Recover the worktree and finish the Phase 1 gate |
| 2026-11-18T09:30Z | Qwen Phase 1 recovery (Arena, session B) | 1 | (this checkpoint; SHA recorded in the follow-up row) | Recovered all 19 changed/new files from Drive; verified unchanged files byte-identical; re-ran every Phase 1 gate in a fresh sandbox — all reproduce exactly (reports byte-identical apart from `generatedAt`). Corrected the header's "latest pushed checkpoint" from `1dd5600d` to `2303f94d`. | `npm test` 45/45 PASS; `typecheck` clean; `verify:motion` 12/12 PASS; `verify:ik` 7/7 + 14/14 PASS; partial `verify.mjs` scope-audit PASS | Run full `node verify.mjs --install --force-trace`, render the Phase 1 contact sheet, write `reports/PROCEDURAL_RIG_UPGRADE_REPORT.md`, then flip Phase 1 to COMPLETE |

Never delete earlier rows. If an earlier statement is found to be wrong, append a correction row and update the current state above.
