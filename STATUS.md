# STATUS — current handoff

**Repository:** `Ambitious513/video2d`
**Active branch:** `feat/constrained-puppet-rig` (the upgraded procedural-puppet work)
**Baseline branch:** `main` @ `5d4d13ab92ac38be0397bd2b8feb27e19eefdf98` — the unchanged reconciliation experiment (do not modify directly)
**Current phase:** **ALL PHASES COMPLETE (0–5)** — Phases 0–5 done; Phase 3 owner-approved; ready for owner merge/PR review (not merged to main)
**Single source of truth:** `ROADMAP.md` (this file is a concise pointer/summary only)
**Detailed technical history:** `reports/PROCEDURAL_RIG_UPGRADE_REPORT.md`
**Machine-readable evidence:** `reports/test-matrix.json` (A1–A18), `reports/fidelity-all-frames.json`

This file is the **current** state. Historical facts are quarantined in §5 and are clearly labelled as history — they are not claims about the present tree.

---

## 1. What this project is

A short reference clip (`source/input_video.mp4`, **3.92 s, 1920×1080, 24 fps, 94 frames, with audio**) of a slate-gray stylized character with a cream scarf and a light backpack running in place on white, recreated in 2D three different ways to expose the trade-offs:

| Output | Composition | Trade-off |
|---|---|---|
| Exact traced cels | `CelRun` | Visual fidelity. 94 unique SVGs, one per source frame. Frame-specific, not a reusable rig. |
| 26-cel loop | `CelLoop` | Small asset footprint. Known, measured phase drift. A control. |
| Procedural puppet | `RunCycle` | Editable geometry and motion. The reusable rig under upgrade. |
| Labelled proof | `Comparison` | Source / exact / puppet / 50 % overlay, same frame in every panel. |

All four are **94 frames @ 24 fps, 1920×1080**, with the original audio attached exactly once per composition. Method and reproduction commands: `METHOD.md`.

## 2. Completed and verified (reconciled baseline on `main`; phases 0–3 on the feature branch)

The reconciled baseline (`main` @ `5d4d13a`) was verified A1–A18 PASS. The feature branch (`feat/constrained-puppet-rig`) then completed Phases 0–3 (see §2.1). The full A1–A18 suite passes on the feature branch too (`reports/test-matrix.json`). Evidence: `reports/test-matrix.json`, `reports/fidelity-all-frames.json`, `reports/logs/*`.

### 2.1 Upgrade progress (Phases 0–3, feature branch)

The `feat/constrained-puppet-rig` branch upgrades **only** the procedural puppet into a constrained, reusable 2D character rig. Full phase detail and evidence are in `ROADMAP.md` and `reports/PROCEDURAL_RIG_UPGRADE_REPORT.md`.

| Phase | Objective | Status |
|---|---|---|
| 0 | Bootstrap + freeze the reconciled baseline | **COMPLETE** (`1dd5600`) |
| 1 | Fixed-length skeleton + generic two-bone IK | **COMPLETE** (`aacdb61`) — solved bone-length error 1.42e-13 px; Test I rewritten 12/12 |
| 2 | Foot contacts + stance locking | **COMPLETE (data model + diagnostics)** — reviewed contact track, ground/treadmill contract, stance/anchor diagnostics. **Rendered continuous foot locking is NOT integrated into `RunCycle` yet** (see §4) |
| 3a | Cohesive geometry | **COMPLETE** — tapered limb silhouettes, fuller torso, designed feet |
| 3b | Deterministic scarf + backpack | **COMPLETE** — fixed-length scarf chain, backpack bob/lag |
| 3c | Visual comparison evidence + closeout | **COMPLETE** — `reports/phase3-final-polish-sheet.png`; **owner-approved 2026-11-18** |
| 4 | Reusable second character variant | **COMPLETE** — teal variant on the shared rig/solver/motion; `reports/phase4-variant-comparison.png` |
| 5 | Final verification + docs | **COMPLETE** — clean gate A1–A18 PASS, 84/84 unit, METHOD/STATUS/report updated |

**ALL PHASES (0–5) COMPLETE.** Phases 0–4 done (Phase 3 owner-approved); Phase 5 final verification + docs complete. The branch `feat/constrained-puppet-rig` is ready for owner merge/PR review (not merged to main). The owner reviews visual evidence (contact sheets) — the agent cannot view images.

### 2.2 Reconciled baseline detail (main)

| Area | State | Evidence |
|---|---|---|
| Source media metadata | PASS | `reports/source-media.json` |
| 94-frame extraction | PASS | `reports/source-frame-validation.json` |
| 94 exact cels | PASS | `remotion/public/cel94/`, re-trace byte-identical |
| 26 loop cels | PASS | `remotion/public/cel/` |
| Composition registry | PASS | `reports/composition-validation.json` |
| Low-RAM renderer | PASS | `reports/render-validation.json` |
| All-frame fidelity | PASS | `reports/fidelity-all-frames.json`, `reports/FIDELITY.md` |
| Tracked-file hygiene | PASS | `reports/test-matrix.json` → `tracked-audit` |
| Docs match implementation (A15/A16) | PASS | `reports/doc-validation.json` |

**All-frame fidelity** (94 frames, native 1920×1080): `CelRun` MAE 1.046 / IoU 0.9756; `CelLoop` 2.5423 / 0.8791; `RunCycle` 5.849 / 0.583 (Phase 3 cohesive; diagnostic). The older 16-sample 960×540 figures in `fidelity.json` are superseded.

## 3. Not in GitHub — regenerate locally

- **All MP4 deliverables.** `remotion/out/` is gitignored. Regenerate with `node render-lowram.mjs` (or `npm run render:all:lowram` from `remotion/`). The final closeout rendered `remotion/out/run-2d-puppet.mp4` and `remotion/out/comparison-source-vs-2d.mp4` (both 94/94 frames, 1920×1080, 24 fps, 3.917 s, 1 audio stream). Provide the owner the MP4 path or an agreed delivery method.
- **`node_modules/`** for `tools/` and `remotion/` — both `package-lock.json` files are committed; `npm ci` reproduces them exactly.
- **`fullres/f_027..f_094.png`**, **`remotion/public/srcframes/`**, **`verify/stills/`**, and **`reports/p3f-new/`** — regenerable; the committed contact sheets built from them are the evidence.
- **Chrome headless shell** — `npx remotion browser ensure`, plus the browser system libraries listed in `METHOD.md` §6.

## 4. Known limitations / open findings

1. **Contact/stance is a data model + diagnostic, not integrated rendered foot locking.** `Runner.tsx` evaluates `solvePose(frame)` directly; it does not consume a stance-constrained pose. `reports/stance-locking-validation.json` reports belt-lock slip/drift/penetration as a **diagnostic contract** (the stance "slip 0" is derived from the declared belt/anchor, not measured over a multi-frame planted interval in the rendered puppet). **Continuous stance-constrained pose integration + rendered multi-frame foot-slip verification is a future locomotion-engine follow-up.** Do not claim production-ready continuous foot locking.
2. **Puppet fidelity is diagnostic.** The cohesive redesign intentionally trades IoU for cohesion (filled joints/gaps the thin source leaves white): Phase 3 MAE 5.849 / char IoU 0.583 vs the pre-upgrade 5.671 / 0.6126. This is a documented metric/perception mismatch (master plan §7.8), not a correctness regression. Final sign-off is the owner's visual review.
3. **Test I (motion) is PASS (12/12)** after the Phase 1 constrained rig; the historical pre-upgrade 7/8 FAIL (2.891× segment variation) is preserved in `reports/baseline/`.
4. **The 26-cel loop drifts by design** (a control variant).
5. **Traced cels are not editable artwork** — per-frame paths.
6. **Pixel fidelity ≠ generalization.** Nothing here proves rig reusability or new actions; Phase 4 (second variant) is the reusability proof and is not started.

## 5. History (context only — not current claims)

- The repository began as a restored 210-file experiment and was reconciled to a reproducible baseline (`main` @ `5d4d13a`, A1–A18 PASS). That reconciliation is the protected baseline for the puppet upgrade.
- The puppet upgrade (`feat/constrained-puppet-rig`) was carried across multiple agent sessions (Qwen + OpenCode), each checkpointing to GitHub; the cross-session memory is `ROADMAP.md` §10.
- `verify/compare.png` is the older 3-row reference sheet, kept for the record. Current proof sheets are `verify/contact-sheet.png`, `verify/comparison-contact-sheet.png`, and `reports/phase3-final-polish-sheet.png`.

## 6. How to resume

```bash
git clone https://github.com/Ambitious513/video2d.git && cd video2d
git checkout feat/constrained-puppet-rig
cd remotion && npm ci && cd ../tools && npm ci
node verify.mjs --install --force-trace     # full A1–A18 suite + all reports
cd remotion && npm run studio               # interactive editing
```

Recommended next task: **only after the owner visually approves Phase 3** — Phase 4 (reusable second character variant on the shared rig/solver/motion), then Phase 5 (final verification + docs). Do not start Phase 4 without separate owner authorization.