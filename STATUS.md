# STATUS — current handoff

**Last verified:** 2026-11-18 (suite run 2026-11-17T23:07Z) · **Repository:** `Ambitious513/video2d`, branch `main`
**Acceptance status:** A1–A18 **all PASS**; Test I (motion) FAIL on one pre-existing check — see §4.1
**Verification entry point:** `node verify.mjs --install --force-trace` (from the repository root)
**Full evidence:** `reports/REPRODUCIBILITY_REPORT.md` · `reports/test-matrix.json`

This file is the **current** state of the repository. Historical facts are quarantined in §5 and are clearly labelled as history — they are not claims about the present tree.

---

## 1. What this project is

A short reference clip (`source/input_video.mp4`, **3.92 s, 1920×1080, 24 fps, 94 frames, with audio**) of a slate-gray stylized character with a cream scarf and a light backpack running in place on white, recreated in 2D three different ways to expose the trade-offs:

| Output | Composition | Trade-off |
|---|---|---|
| Exact traced cels | `CelRun` | Visual fidelity. 94 unique SVGs, one per source frame. Artwork is frame-specific, not a reusable rig. |
| 26-cel loop | `CelLoop` | Small asset footprint. Known, measured phase drift. A control, not the fidelity deliverable. |
| Procedural puppet | `RunCycle` | Editable geometry and motion. Visible fidelity gap. |
| Labelled proof | `Comparison` | Source / exact / puppet / 50 % overlay, same frame in every panel. |

All four are **94 frames @ 24 fps, 1920×1080**, with the original audio attached exactly once per composition. Method and reproduction commands: `METHOD.md`.

## 2. Completed and verified in this repository

Everything below was re-run from a clean clone in a fresh ~1 GB / 2-core sandbox, not carried over from an earlier workspace.

| Area | State | Evidence |
|---|---|---|
| Source media metadata | PASS | `reports/source-media.json` — 1920×1080, `24/1`, 94 frames, 3.92 s, AAC stereo 48 kHz |
| 94-frame extraction | PASS | `reports/source-frame-validation.json` — 94 full-res + 94 half-res, contiguous, order-verified |
| Committed asset determinism | PASS | 94/94 `frames/` PNGs pixel-identical and 26/26 `fullres/` PNGs byte-identical to a fresh extraction |
| 94 exact cels | PASS | `remotion/public/cel94/f_001..f_094.svg`, 94 unique sha256; re-tracing reproduces them **byte-identically** |
| 26 loop cels | PASS | `remotion/public/cel/f_001..f_026.svg` untouched |
| Exact vs loop semantics | PASS | `remotion/src/cels.ts` + 11 unit tests (`remotion/test/cels.test.ts`) |
| Composition registry | PASS | `reports/composition-validation.json` — registry == render manifest == `METHOD.md`, 4 IDs, no collisions |
| Low-RAM renderer | PASS | `reports/render-validation.json` — 4 × 94/94 frames, 1920×1080, `24/1`, 3.917 s, exactly 1 audio stream each |
| Still renders | PASS | `reports/still-render-validation.json` — 24 stills at frames 0, 12, 25, 26, 72, 93 |
| All-frame fidelity | PASS | `reports/fidelity-all-frames.json`, `reports/FIDELITY.md` — all 94 frames, native 1920×1080 |
| Comparison proof | PASS | `verify/comparison-contact-sheet.png`, `verify/contact-sheet.png` |
| Clean install + typecheck | PASS | `reports/logs/install-tools.log`, `install-remotion.log`, `browser.log`, `typecheck.log` |
| Tracked-file hygiene | PASS | `reports/test-matrix.json` → `tracked-audit`: 356 tracked files, no MP4s / `node_modules` / temp sequences |
| Puppet design unchanged | PASS | `Runner.tsx`, `keys.ts`, `RunCycle.tsx` byte-identical to baseline `5ab3d64` |
| Docs match implementation (A15/A16) | PASS | `reports/doc-validation.json` — 74 path references, all npm scripts, all composition IDs, handoff structure |

**Current all-frame fidelity** (all 94 frames, both sides native 1920×1080, no resampling):

| Variant | MAE (0–255) | % px any channel > 40 | IoU incl. shadow | Objective |
|---|---|---|---|---|
| `CelRun` (exact 94) | **1.046** | 0.8006 | 0.9756 | fidelity deliverable |
| `CelLoop` (26 loop) | 2.5423 | 1.8057 | 0.8791 | control — drift expected |
| `RunCycle` (puppet) | 5.6307 | 4.3798 | 0.6158 | diagnostic only |

The older **2.71 / 4.25 / 7.24** figures were **16 samples at six-frame intervals at 960×540**. They are preserved verbatim in `fidelity.json` with `_meta.samplingMode = "every_6_frames"` and are superseded by the table above. Do not quote them as all-frame accuracy.

## 3. Not in GitHub — regenerate locally

These are intentionally absent, not missing work:

- **All MP4 deliverables.** `remotion/out/` is gitignored. Regenerate with `node render-lowram.mjs` (or `npm run render:all:lowram` from `remotion/`): `run-2d-cel.mp4`, `run-2d-cel-loop.mp4`, `run-2d-puppet.mp4`, `comparison-source-vs-2d.mp4`. Verified sizes in `reports/render-validation.json`.
- **`node_modules/`** for `tools/` and `remotion/` — both `package-lock.json` files are committed; `npm ci` reproduces them exactly.
- **`fullres/f_027..f_094.png`** — regenerable full-resolution extraction (`node tools/extract-frames.js`). Only the 26 historical `f_001..f_026.png` stay tracked, and they are verified byte-identical to a fresh extraction.
- **`remotion/public/srcframes/`** (94 × 960×540 PNGs for the Comparison source panel) and **`verify/stills/`** (24 full-res stills) — regenerable; the labelled contact sheets built from them *are* committed.
- **Chrome headless shell** — `npx remotion browser ensure`, plus the apt libraries listed in `METHOD.md` §6.

## 4. Known limitations / open findings

1. **Test I motion check FAILs on limb segment length variation** — max/min **2.89×** (knee→ankle) against a documented 2.0 tolerance. This is a **pre-existing property of the unchanged puppet**, not a regression: raw hand-measured keys already vary 1.96×, build-time Catmull-Rom resampling amplifies it to 2.89×, per-frame interpolation adds only 1.19× overshoot. Continuity is clean (no joint or pixel pop at the 26-frame wrap). Recorded as future work; the puppet and the threshold were deliberately **not** modified. Details: `reports/motion-validation.json`.
2. **No IK stance-locking, no foot-contact solver, no bone-length constraints** exist in the puppet. Future work, never claimed as passing.
3. **The puppet is visibly more stylized than the source** — thinner torso/limbs, straighter scarf tail, flatter backpack, cruder feet. Its metrics are diagnostic, not a fidelity failure. Improving it is a separate animation task.
4. **The 26-cel loop drifts by design** (worst frames f34, f74, f73). Expected behaviour of the control variant.
5. **Traced cels are not editable artwork** — per-frame paths; a design change means re-tracing.
6. **The legacy 26 cels carry no `viewBox`** (width/height only). Left byte-identical on purpose; documented in the asset report as a deviation, not silently "fixed".
7. **Pixel fidelity ≠ generalization.** Nothing here proves rig reusability, new actions, or storyboard automation.

## 5. History (context only — not current claims)

- The project was originally restored from a Google Drive share (12 folders / 210 files / 22.6 MB, integrity-checked). The Drive share contained **no** `remotion/out/` MP4s and no write-up.
- An earlier session produced the measurement tooling, the palette, the puppet keys, the 26-cel loop and the first `METHOD.md` / `STATUS.md`. At that point `CelRun` actually looped 26 cels while the docs described a 94-frame exact reconstruction, `CelLoop` and `Comparison` did not exist, the renderer advertised unregistered compositions, and `flatrace.js` always wrote a debug `_flat.png`.
- The reconciliation task (`VIDEO2D_REPOSITORY_RECONCILIATION_TEST.md`) fixed those mismatches across commits `472090f`, `8e8a300`, `ed2b7ff`, `4a01b9c`. That session ended at a usage limit **after** pushing `4a01b9c` but **before** committing the render/fidelity/motion reports, the comparison-sheet fix, the documentation rewrite or the final report.
- A second session re-ran the suite from a clean clone, fixed the three defects left uncommitted (comparison-sheet downscaling, tracked-audit regex, motion-finding classification) as `b9d0c03`, and pushed the Tests G/H/I evidence as `7fab95f`. It then drafted the `METHOD.md` / `STATUS.md` rewrites and `tools/verify-docs.js` locally, but ended before committing them or writing the final report.
- The current session recovered those three uncommitted files, fixed a false FAIL in `verify-docs.js` (it did not accept the remotion-relative `public/srcframes/` spelling used in `METHOD.md` §5), wired the test into `verify.mjs` and `tools/package.json` as the A15/A16 gate, wrote `reports/REPRODUCIBILITY_REPORT.md`, and re-ran the whole suite from a clean clone of `7fab95f`. Every number in §2 was measured in that run.
- `verify/compare.png` is the older 3-row reference sheet from the original session, kept for the record. The current proof sheets are `verify/contact-sheet.png` and `verify/comparison-contact-sheet.png`.

## 6. How to resume

```bash
git clone https://github.com/Ambitious513/video2d.git && cd video2d
# apt libraries for chrome-headless-shell: see METHOD.md §6
node verify.mjs --install --force-trace     # full suite + all reports
cd remotion && npm run studio               # interactive editing on 0.0.0.0:3000
```

Recommended next task (separate from this reconciliation): improve puppet mass/scarf/backpack fidelity and add bone-length constraints, using `reports/motion-validation.json` and the puppet fidelity diagnostics as the baseline. Do not change the traced-cel pipeline or the character design to chase a pixel score.