# ROADMAP — Video2D Procedural Puppet Upgrade

**Repository:** https://github.com/Ambitious513/video2d
**Shared branch:** feat/constrained-puppet-rig
**Current status:** IN PROGRESS
**Last updated:** 2026-11-17T23:55Z (UTC)
**Last verified remote commit:** 5d4d13ab92ac38be0397bd2b8feb27e19eefdf98 (`origin/main` at bootstrap; feature branch did not exist on the remote yet)
**Latest pushed roadmap checkpoint:** 182dc4d9f4214d2418176fb7dc7cfde4801f929a (bootstrap; verified via `git ls-remote`)
**Current agent:** Qwen session 2026-11-18 (bootstrap agent, Arena)

## 1. Mission
Upgrade only the existing procedural puppet into a constrained, reusable 2D character rig. Preserve the reconciled exact-cel and loop experiments. A new Qwen session must be able to continue from this file without prior chat history. Master requirements: owner-supplied `QWEN_VIDEO2D_MULTI_AGENT_HANDOFF_AND_ROADMAP.md` (not committed; this file + `reports/` carry the durable state).

## 2. Current state — read this first
- **Active phase:** Phase 0 (bootstrap/baseline)
- **Phase status:** IN PROGRESS
- **What is already complete:**
  - Remote state verified: `origin/main` = `5d4d13ab92ac38be0397bd2b8feb27e19eefdf98` (the documented reconciled baseline; not advanced). `feat/constrained-puppet-rig` did not exist remotely; created locally from that commit.
  - Repository context read: `STATUS.md`, `METHOD.md`, `SKILL.md` (§8 rig contract, §11 gates), `reports/REPRODUCIBILITY_REPORT.md`, `reports/motion-validation.json`, puppet sources, `verify.mjs`, tests.
  - This roadmap created (bootstrap deliverable).
- **What is currently being changed:** nothing yet beyond `ROADMAP.md`. Next: run `node verify.mjs --install --force-trace` in this sandbox (2 cores / ~1 GB, Debian, root, apt available) and write `reports/puppet-upgrade-baseline.json`.
- **What is not yet done:** Phase 0 baseline reproduction + baseline report; Phases 1–5 entirely.
- **Current blocker:** NONE (GitHub push access confirmed working for this session via owner-provided token; token is stored outside the repo, never committed).

### NEXT AGENT START HERE
1. Fetch `origin` and switch to `feat/constrained-puppet-rig`.
2. Confirm remote HEAD with `git ls-remote origin refs/heads/feat/constrained-puppet-rig` and inspect commits after the bootstrap checkpoint recorded in §10.
3. Read this file, then `reports/puppet-upgrade-baseline.json` (if present) and `reports/motion-validation.json`.
4. Run `node verify.mjs --install --force-trace` (needs the apt libs in `METHOD.md` §6; expect Test I FAIL 7/8 — pre-existing, see §5).
5. Continue only with: finish Phase 0 (baseline report + preserved baseline evidence + pushed checkpoint), then Milestone 1 per master plan §5 (rig definition + fixed-length two-bone IK + raw-vs-solved separation + Test I split). Acceptance: every constrained bone within ±0.5 px of its configured length on all 94 frames; IK edge-case unit tests pass.

Do not redo: repository reconciliation (A1–A18 all PASS at `5d4d13a`); cel tracing; composition semantics.
Do not modify: `remotion/public/cel94/`, `remotion/public/cel/`, `tools/flatrace.js`, locked palette/VTracer params, `source/input_video.mp4`, `remotion/public/audio.m4a`, committed `frames/` + `fullres/f_001..f_026.png`, `remotion/src/cels.ts` semantics, CelRun/CelLoop/Comparison behavior, Test I historical evidence.

## 3. Phase roadmap

| Phase | Objective | Status | Completion commit | Evidence | Next gate |
|---|---|---|---|---|---|
| 0. Bootstrap/baseline | Initialize this roadmap; confirm remote baseline and reproduce existing state | IN PROGRESS | — | this file; suite run pending | Roadmap pushed; baseline reproduced + `reports/puppet-upgrade-baseline.json` |
| 1. Fixed-length skeleton + IK | Rig definitions, generic two-bone solver, raw vs solved targets | NOT STARTED | — | — | All configured bones within ±0.5 px; IK edge tests pass |
| 2. Foot contacts + stance locking | Contact track, world-space anchors, root modes, foot-slip tests | NOT STARTED | — | — | Stance velocity <0.5 px/frame; drift ≤1.5 px |
| 3. Visual construction + secondary motion | Cohesive silhouettes, torso/feet, backpack, deterministic scarf | NOT STARTED | — | — | Visual review + no regressions; IoU ≥0.68 target, MAE ≤5.6307 |
| 4. Reusable second character | Second appearance/rig profile uses shared solver and motion | NOT STARTED | — | — | Both variants pass same tests without duplicated gait |
| 5. Final verification + docs | Clean clone suite, reports, final technical handoff | NOT STARTED | — | — | All acceptance tests PASS or explicitly approved exceptions |

## 4. Protected baseline and invariants
- Reconciled baseline commit: `5d4d13ab92ac38be0397bd2b8feb27e19eefdf98` (verified equal to `origin/main` at bootstrap, 2026-11-17T23:52Z).
- Preserve `remotion/public/cel94/`, `remotion/public/cel/`, source video/audio, source frames, palette, VTracer settings, and CelRun/CelLoop semantics.
- Do not widen tests to hide a failure. The historical Test I failure (2.891×) stays in the record; the new constrained-length check replaces it as the primary gate (master plan §9.7).
- Deterministic evaluation: a frame is a pure function of rig + motion + parameters + frame index.
- `main` is not modified directly; no force-push. Owner reviews the branch/PR before merge.
- `verify.mjs`'s `puppet-unchanged` gate (byte-identity vs `5ab3d64`) must be replaced — not deleted — by a reconciliation-assets-protected scope audit vs `5d4d13a` when puppet files first change (master plan §10). Until then it stays as-is.

## 5. Baseline metrics

| Metric | Baseline | Latest | Target / interpretation |
|---|---:|---:|---|
| Puppet MAE | 5.6307 | — | Diagnostic only; do not optimize blindly |
| Puppet character IoU | 0.6116 | — | Initial visual target ≥0.68 after Phase 3, subject to human review |
| Worst bone max/min ratio | 2.891× | — | Historical failure (knee→ankle); replace with configured-length error for solved rig |
| Foot slip | Not currently measured | — | <0.5 px/frame during verified stance |
| Stance anchor drift | Not currently measured | — | ≤1.5 px over stance interval |

Source baseline report: `reports/motion-validation.json`, `reports/fidelity-all-frames.json`, `reports/REPRODUCIBILITY_REPORT.md` (all at `5d4d13a`).
Raw-key variation already present in measurements: hip→knee 1.958×, knee→ankle 1.890×; build-time Catmull-Rom amplifies knee→ankle to 2.891×; frame interpolation overshoot ≤1.192× (arms).

## 6. Latest test state

| Test / command | Status | Exact result | Evidence |
|---|---|---|---|
| Existing reconciliation suite (`node verify.mjs --install --force-trace`) | NOT RUN | pending in this sandbox; last committed run at `5d4d13a`: A1–A18 PASS, Test I FAIL (7/8) | `reports/test-matrix.json` (committed baseline) |
| IK unit tests | NOT RUN | — | — |
| Bone-length validation | NOT RUN | — | — |
| Foot-contact validation | NOT RUN | — | — |
| Determinism / continuity | NOT RUN | baseline committed: PASS except segment-length check | `reports/motion-validation.json` |
| Visual stills/contact sheet | NOT RUN | baseline committed sheets exist | `verify/contact-sheet.png`, `verify/comparison-contact-sheet.png` |
| Variant reuse | NOT RUN | — | — |

## 7. Latest checkpoint
- Session date/time (UTC): 2026-11-17T23:55Z
- Commit(s) pushed: `182dc4d9` docs: initialize procedural puppet upgrade roadmap (+ this SHA-recording follow-up)
- Files changed: `ROADMAP.md` (new)
- Tests run: none yet this session
- Evidence added: this file
- Remote verified: yes — `git ls-remote` returned `182dc4d9f4214d2418176fb7dc7cfde4801f929a`
- Worktree clean after push: yes (after follow-up)

## 8. Decisions and conventions (append when established)
- Coordinate spaces / units: current puppet coordinates are 1920×1080 canvas pixels, y down, 24 fps; character faces +x (right). Root currently fixed (run-in-place); world/root contract formalized in Phase 2.
- Rig and joint conventions: to be established in Phase 1 (planned: knee pole toward +x/front, elbow pole toward −x/back; explicit bend-side hint per limb).
- Bone calibration method: to be established in Phase 1 from the 14 raw leg keys + 2 arm extremes in `keys.ts` (robust statistic, documented; raw keys are never overwritten).
- Contact track representation: Phase 2.
- Secondary-motion evaluation method: Phase 3 (must be deterministic for arbitrary frame access).
- Character variant schema: Phase 4.
- Dependencies and licensing decisions: no new dependencies so far; existing toolchain only (TypeScript/React/SVG/Remotion, sharp/pngjs/ffmpeg-static in tools/).

Do not silently change a decision. Record rationale and migration impact first.

## 9. Known limitations and blockers
- Pre-existing Test I FAIL: limb segment length max/min 2.891× (knee→ankle) vs 2.0 tolerance; 6 segments over tolerance. Cause measured at three levels (raw keys 1.958× → stored track 2.891× → interpolation ≤1.192× overshoot). This is the defect Phase 1 fixes; not a regression.
- No IK, no stance locking, no bone constraints exist yet (never claimed as passing).
- Puppet visual fidelity gap (MAE 5.6307, char IoU 0.6116) is diagnostic; Phase 3 addresses construction quality.
- Sandbox has ~1 GB RAM / 2 cores: use `render-lowram.mjs` patterns; never multi-threaded Remotion stitch.

## 10. Session history (append-only)

| Date (UTC) | Agent/session | Phase | Commit(s) pushed | Outcome | Tests | Next agent action |
|---|---|---|---|---|---|---|
| 2026-11-17T23:55Z | Qwen bootstrap (Arena) | 0 | 182dc4d9f4214d2418176fb7dc7cfde4801f929a | Roadmap initialized; remote baseline verified = `5d4d13a`; feature branch created; push access confirmed | none yet | Run full suite, write baseline report, then Milestone 1 |

Never delete earlier rows. If an earlier statement is found to be wrong, append a correction row and update the current state above.
