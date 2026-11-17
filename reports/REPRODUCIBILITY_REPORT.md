# REPRODUCIBILITY REPORT — video2d repository reconciliation

**Contract:** `VIDEO2D_REPOSITORY_RECONCILIATION_TEST.md` (owner-supplied acceptance contract; referenced for provenance, not a deliverable of the experiment).
**Repository:** `Ambitious513/video2d`, branch `main`.
**Scope:** verification and reconciliation only. No redesign, no new character, no animation engine, no YouTube pipeline.

---

## 1. Commits

| Role | SHA | Subject |
|---|---|---|
| Pre-reconciliation baseline | `5ab3d64` | Add render-lowram.mjs, STATUS.md, METHOD.md, fidelity.json |
| Reconciliation step 1 | `472090f` | Reconcile compositions: CelRun=exact 94-cel variant, add CelLoop (26) and Comparison |
| Reconciliation step 2 | `8e8a300` | Repair low-RAM renderer, make flatrace debug PNG opt-in, real tools tests |
| Reconciliation step 3 | `ed2b7ff` | Add verification tooling: orchestrator + Tests A–J implementation |
| Reconciliation step 4 | `4a01b9c` | Regenerate 94 unique exact cels; verification evidence (Tests A–F PASS) |
| Defect fixes | `b9d0c03` | Fix three defects found at the end of the previous session |
| **Start of the final session** | **`7fab95f`** | Complete Tests G/H/I evidence from a clean checkout (16/17 steps PASS) |
| Reconciliation completion | `PENDING_COMMIT` | Commit the post-push documentation tail, wire in the A15/A16 doc test, add this report |

The session that produced `7fab95f` ended after pushing the measurement evidence but **before** committing the rewritten `METHOD.md` / `STATUS.md`, the new `tools/verify-docs.js`, or this report. Those three files were recovered from the owner's upload and are committed by the completion commit above. Everything else in the acceptance matrix was already reproducible from `7fab95f`.

## 2. Files changed in the completion commit, and why

| File | Change | Why |
|---|---|---|
| `METHOD.md` | Rewritten reproduction/verification sections | The committed version still quoted the **16-sample 960×540** figures (2.71 / 4.25 / 7.24) as if they were the deliverable's accuracy, described `out/` paths without stating they are gitignored, and omitted the `verify.mjs` entry point. Now documents the all-94-frame native-1080p measurement, the historical figures as explicitly superseded, and every command with its working directory. |
| `STATUS.md` | Rewritten as a current handoff | The committed version mixed pre-restore and post-completion claims. Now separated into current state / not-in-GitHub / known limitations / labelled History / how-to-resume. |
| `tools/verify-docs.js` | **New** — automated A15/A16 test | A15/A16 were previously "documentation review", i.e. unautomated and absent from the matrix. This checks every documented path, npm script and composition ID against the tree, and checks `STATUS.md` structure. |
| `tools/verify-docs.js` | Bug fix vs the uploaded draft | The uploaded draft's `REGENERABLE` list only had `remotion/public/srcframes/`, but `METHOD.md` §5 documents the remotion subtree from inside it and writes `public/srcframes/` → false FAIL. Both spellings accepted. Also added a check that every excused regenerable location is **really gitignored**, so the allowlist cannot be used to explain away a genuinely missing file. |
| `tools/package.json` | Add `verify:docs` script | Makes the new test runnable as documented (`npm run verify:docs` in `tools/`). |
| `verify.mjs` | Add `docs` step + `A15`/`A16` matrix rows | The acceptance matrix jumped A14 → A17. A15/A16 are now mechanically gated instead of deferred to prose. |
| `reports/REPRODUCIBILITY_REPORT.md` | **New** — this file | Contract §11 deliverable; referenced by `verify.mjs`, `METHOD.md` and `STATUS.md` but never written. |
| `reports/doc-validation.json`, `reports/logs/docs.log` | **New** — generated evidence | Output of the new test. |
| `reports/*.json`, `reports/logs/*` | Regenerated | Full suite re-run from a clean clone of `7fab95f` in a fresh 1 GB / 2-core sandbox; see §13. |
| `verify/contact-sheet.png`, `verify/comparison-contact-sheet.png` | Regenerated, **byte-identical** | Re-rendered from the new stills and reproduced exactly, so they do not appear as changed files. Listed here because they are re-derived evidence, not carried-over artifacts. |

**Not changed, deliberately:** `remotion/src/puppet/Runner.tsx`, `remotion/src/puppet/keys.ts`, `remotion/src/RunCycle.tsx`, the 26 legacy cels in `remotion/public/cel/`, the palette, the VTracer parameters, and the Test I tolerance. See §15.

## 3. Final composition IDs and precise semantics

All four are registered in `remotion/src/Root.tsx`, all **1920×1080, 24 fps, 94 frames**, each with the original audio attached **exactly once** at the composition root.

| ID | Semantics | Asset source | Selection logic |
|---|---|---|---|
| `CelRun` | **Exact reconstruction — the fidelity deliverable.** 94 unique traced cels, each played once, strictly monotonic, never repeats or skips. | `remotion/public/cel94/f_001.svg` … `f_094.svg` | `exactCelIndex(frame) = frame + 1` |
| `CelLoop` | **Lightweight control, NOT the fidelity deliverable.** 26 cels repeated over the 94-frame timeline; phase drift is expected and measured. | `remotion/public/cel/f_001.svg` … `f_026.svg` | `loopCelIndex(frame) = (frame % 26) + 1` |
| `RunCycle` | Procedural puppet. No traced artwork; skeleton keys + math generate every frame. Editable. | `remotion/src/puppet/Runner.tsx` + `keys.ts` | n/a |
| `Comparison` | Four labelled panels — source / exact cel / puppet / 50 % overlay — same frame in every panel. Labels are HTML, never ffmpeg `drawtext`. | `remotion/public/srcframes/` + the above components | n/a |

The legacy IDs were kept for compatibility with **corrected semantics**: `CelRun` used to silently loop 26 cels while the docs claimed a 94-frame exact reconstruction. That defect is fixed and is now guarded by a regression check in `tools/verify-docs.js` ("no document describes CelRun as the 26-cel loop").

Selection logic is pure and lives in `remotion/src/cels.ts`; out-of-range or non-integer frames **throw** instead of silently wrapping. Contract §4.1 mapping, verified by unit test:

| Timeline frame | Exact cel | 26-loop cel |
|---:|---:|---:|
| 0 | 1 | 1 |
| 12 | 13 | 13 |
| 25 | 26 | 26 |
| 26 | 27 | 1 |
| 72 | 73 | 21 |
| 93 | 94 | 16 |

## 4. Asset and frame counts

| Item | Count | Notes |
|---|---:|---|
| Source frames in `source/input_video.mp4` | 94 | ffprobe `nb_frames=94`, 3.92 s @ 24/1 |
| Half-resolution reference PNGs `frames/` | 94 (+1 contact sheet) | committed; proven pixel-identical to a fresh 960×540 extraction |
| Full-resolution extraction `fullres/` | 94 | `f_001..f_026` committed (historical, byte-identical to fresh extraction); `f_027..f_094` regenerable + gitignored |
| Exact traced cels `remotion/public/cel94/` | **94** | 6,041,171 bytes; 94 distinct sha256; all `viewBox="0 0 1920 1080"` |
| Loop cels `remotion/public/cel/` | **26** | 1,614,448 bytes; untouched legacy assets |
| Comparison source panels `remotion/public/srcframes/` | 94 | 960×540, regenerable + gitignored |
| Rendered frames per composition | **94** | ×4 compositions = 376 frames |
| Still renders | 24 | 4 compositions × frames 0, 12, 25, 26, 72, 93 |
| Fidelity-scored frame pairs | 94 × 3 variants = 282 | native 1920×1080 both sides, no resampling |

## 5. Exact install commands

```bash
git clone https://github.com/Ambitious513/video2d.git && cd video2d

# Chrome-headless-shell system libraries (Debian 12)
apt-get update && apt-get install -y libx11-6 libxcomposite1 libxdamage1 libxext6 \
  libxfixes3 libxrandr2 libasound2 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
  libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libxcb1 libxkbcommon0 \
  libcups2 libpango-1.0-0 libcairo2 fonts-dejavu-core

# Dependencies + browser, run and logged by the orchestrator
node verify.mjs --install --force-trace
```

`--install` executes and logs, in order: `npm ci --no-audit --no-fund` in `tools/`, the same in `remotion/`, then `npx remotion browser ensure` in `remotion/`. Both `package-lock.json` files are committed. Logs: `reports/logs/install-tools.log`, `reports/logs/install-remotion.log`, `reports/logs/browser.log`.

## 6. Exact test command

```bash
node verify.mjs --install --force-trace     # full suite, Tests A–J + A15/A16 doc test
```

Individual steps (each also an npm script):

```bash
node tools/extract-frames.js                # 94 fullres + 94 srcframes PNGs
node tools/trace-all.js                     # 94 cels -> remotion/public/cel94/
node tools/verify-source.js                 # Tests A + B
node tools/verify-assets.js                 # Test C
node tools/verify-docs.js                   # A15 + A16  (npm run verify:docs in tools/)
cd remotion && npm test && npm run typecheck && cd ..    # Test E + types
node remotion/scripts/verify-compositions.mjs            # Test D
node remotion/scripts/render-stills.mjs                  # Tests F + J sheets
node tools/score-fidelity.js --cel94 remotion/out/celframes \
  --celLoop remotion/out/celloopframes --puppet remotion/out/puppetframes   # Test H
cd remotion && npm run verify:motion && cd ..            # Test I
```

## 7. Exact render command

```bash
node render-lowram.mjs                      # all four registered compositions
KEEP_FRAMES=1 node render-lowram.mjs        # keep PNG sequences (needed for scoring)
node render-lowram.mjs CelRun               # a single composition
cd remotion && npm run render:all:lowram    # equivalent, from remotion/
```

The script resolves the repository root from its own location, so it works from **any** current directory. It runs Remotion with an explicit `cwd` of `remotion/`, resolves ffmpeg/ffprobe from `tools/node_modules`, renders `--sequence --concurrency=1`, detects the sequence prefix/padding/start index, validates the PNG sequence **before** encoding, ffprobe-validates the MP4 **after** encoding, and deletes frames only after all verification passed. Encodes with `-threads 1`.

## 8. Actual MP4 metadata

Measured by ffprobe after encoding (`reports/render-validation.json`). MP4s are **local only** in `remotion/out/` (gitignored) — contract rule 7.

| Composition | Output | Frames | W×H | FPS | Duration | Video | Audio | Size | Render time |
|---|---|---:|---|---|---|---|---|---:|---:|
| `CelRun` | `run-2d-cel.mp4` | 94/94 | 1920×1080 | 24/1 | 3.917 s | h264 | **1** × aac, 3.904 s | 1,390,475 B | 17.2 s |
| `CelLoop` | `run-2d-cel-loop.mp4` | 94/94 | 1920×1080 | 24/1 | 3.917 s | h264 | **1** × aac, 3.904 s | 1,382,406 B | 17.7 s |
| `RunCycle` | `run-2d-puppet.mp4` | 94/94 | 1920×1080 | 24/1 | 3.917 s | h264 | **1** × aac, 3.904 s | 654,591 B | 15.0 s |
| `Comparison` | `comparison-source-vs-2d.mp4` | 94/94 | 1920×1080 | 24/1 | 3.917 s | h264 | **1** × aac, 3.904 s | 1,912,189 B | 23.1 s |

Exactly one audio stream per file — no duplication from nested components. Reference track `remotion/public/audio.m4a` is 3.926 s; the encoded audio is 3.904 s, i.e. not truncated beyond the encoder's frame-quantisation (checked against the reference by the renderer).

## 9. Full 94-frame fidelity — exact traced cels (`CelRun`)

All **94** frames, rendered frames vs `fullres/` source frames, **both native 1920×1080, no resampling anywhere**. Aggregates weighted by evaluated channel/pixel counts. Source: `reports/fidelity-all-frames.json`, human-readable `reports/FIDELITY.md`.

| Metric | Aggregate | Min | Median | p95 | Max |
|---|---:|---:|---:|---:|---:|
| MAE (0–255) | **1.046** | 0.9012 | 1.0484 | 1.1197 | 1.2085 |
| `pct_pixels_any_channel_gt_40` | **0.8006 %** | 0.7111 | 0.8019 | 0.8495 | 0.8769 |
| `iou_foreground` (incl. shadow) | **0.9756** | 0.9708 | 0.9754 | 0.9788 | 0.9812 |
| `iou_character` (shadow excluded) | **0.9577** | 0.9479 | 0.9575 | 0.9637 | 0.9669 |
| `palette_exact_pct` | 99.143 % | — | — | — | — |
| `palette_near_pct` (±2/ch, AA) | 99.298 % | — | — | — | — |

Metric definitions, exactly as implemented in `tools/score-fidelity.js`:

- **MAE** = `sum(|render_channel − source_channel|) / (width × height × 3 × frames)` over R, G, B. Range 0–255, lower is closer.
- **`pct_pixels_any_channel_gt_40`** = a pixel counts **once** iff `max(|dR|,|dG|,|dB|) > 40`; divided by total pixels × 100. Channels are never counted as separate pixels.
- **`iou_foreground`** = silhouette IoU **including** the ground shadow. Mask: `max(255−R, 255−G, 255−B) > 12`, which captures the `#DCDBDE` shadow and every character colour while excluding white background.
- **`iou_character`** = the same masks **minus** shadow-classified pixels (`|R−220|≤14 && |G−219|≤14 && |B−222|≤14`). Soft source shadow gradients make some boundary pixels ambiguous; this documented approximation is applied identically to both sides.
- **`palette_exact_pct` / `palette_near_pct`** = rendered pixels exactly equal to one of the 11 locked palette colours, or within ±2 per channel. Cel variants only.

1.046 is essentially the **posterization floor** — the difference between the source's soft shading and flat 2D fills, not a pose or timing error. Per-frame MAE stays inside a 0.9012…1.2085 band across the whole clip, i.e. there is no drift.

**Historical figures are superseded, not comparable.** `fidelity.json` is preserved verbatim with `_meta.samplingMode = "every_6_frames"`: **16 samples at six-frame intervals at 960×540**, giving 2.71 / 4.25 / 7.24 and pct 0.54 / 1.67 / 3.85. The original scorer was never committed, so its exact `pct` formula cannot be re-derived and must not be mixed with the defined metric above.

## 10. Loop and puppet metrics — different objectives

| Variant | Objective | MAE | % px any ch > 40 | IoU fg | IoU char | MAE min / median / p95 / max |
|---|---|---:|---:|---:|---:|---|
| `CelRun` (exact 94) | **fidelity deliverable** | 1.046 | 0.8006 | 0.9756 | 0.9577 | 0.9012 / 1.0484 / 1.1197 / 1.2085 |
| `CelLoop` (26 loop) | **control — drift EXPECTED, not a failure** | 2.5423 | 1.8057 | 0.8791 | 0.8582 | 0.972 / 2.238 / 4.8647 / 6.1712 |
| `RunCycle` (puppet) | **diagnostic only — editability, not pixel equality** | 5.6307 | 4.3798 | 0.6158 | 0.6116 | 4.0723 / 5.533 / 7.2916 / 7.6782 |

- **`CelLoop` drift is the reason the variant exists.** The source stride is *almost* but not exactly 26 frames. Early frames are still in phase (MAE 0.972, comparable to the exact variant); error grows through the clip to 6.1712. This is measured, expected behaviour of a lightweight control — **not** a fidelity failure and not a bug to fix.
- **`RunCycle` numbers are a diagnostic.** The puppet's objective is editable geometry and plausible motion. Its gap is a known stylisation difference (thinner torso/limbs, straighter scarf tail, flatter backpack, cruder feet), recorded as future work. It is **not** reported as a pixel-fidelity pass, and the puppet was not tuned to improve this number.

## 11. Worst five frames by MAE

| Rank | `CelRun` (exact) | `CelLoop` (control) | `RunCycle` (diagnostic) |
|---:|---|---|---|
| 1 | f41 — 1.2085 | f34 — 6.1712 | f38 — 7.6782 |
| 2 | f12 — 1.1374 | f74 — 5.5073 | f90 — 7.5798 |
| 3 | f14 — 1.1306 | f73 — 5.4313 | f12 — 7.5146 |
| 4 | f26 — 1.1286 | f33 — 5.0052 | f64 — 7.5064 |
| 5 | f27 — 1.1260 | f75 — 4.8821 | f25 — 7.4309 |

Frame numbers are 1-based source frames (`timelineFrame = frame − 1`). The loop's worst cluster f73–f75 is exactly the historically problematic late-clip region; the exact variant's spread is only 0.08 MAE wide. Every per-frame value for all three variants is in `reports/fidelity-all-frames.json`.

## 12. Visual proof for human review

Generated from **actual rendered and extracted frames** — never from an image-generation model.

- `verify/comparison-contact-sheet.png` — the full 4-panel labelled `Comparison` at frames 0, 12, 25, 26, 72, 93 (Test J).
- `verify/contact-sheet.png` — 4 compositions × the same six frames, labelled (Test F).
- `verify/compare.png` — the older 3-row reference sheet from the original session, kept for the record.

Review checkpoints (contract §9): frame 0 silhouette/colours/scarf/backpack/face/shadow; frame 12 representative pose; frames 25/26 loop boundary and exact-vs-loop divergence; frame 72 worst loop-drift point; frame 93 final-frame alignment.

## 13. Test matrix — every acceptance criterion

Statuses: `PASS` / `FAIL` / `BLOCKED` / `NOT RUN`. Machine-readable: `reports/test-matrix.json`. Per-step logs: `reports/logs/<step>.log`.

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| A1 | Source media metadata verified | PASS | `reports/source-media.json` — 1920×1080, `24/1`, 94 frames, 3.92 s, aac stereo 48 kHz |
| A2 | All 94 source frames extractable | PASS | `reports/source-frame-validation.json` — 94 full-res + 94 half-res, contiguous, order-verified |
| A3 | 94 unique exact SVG cels exist and validate | PASS | `reports/svg-asset-validation.json` — 94 files, 94 distinct sha256, all rasterize |
| A4 | 26 loop cels intact | PASS | `reports/svg-asset-validation.json` — 26 files, byte-identical to baseline |
| A5 | Exact/loop compositions distinct, mapping correct | PASS | `reports/logs/unit-remotion.log` (11/11) + `reports/composition-validation.json` |
| A6 | Every advertised render job registered | PASS | `reports/composition-validation.json` — registry == manifest == METHOD.md, 4 IDs, no collisions |
| A7 | Low-RAM script works from documented invocation | PASS | `reports/render-validation.json` + `reports/logs/render.log` |
| A8 | Puppet present, design unchanged | PASS | `puppet-unchanged`: `git diff 5ab3d64` empty for `Runner.tsx`/`keys.ts`/`RunCycle.tsx` + stills |
| A9 | All required stills render correctly | PASS | `reports/still-render-validation.json` — 24 stills, 1920×1080, non-blank, content present |
| A10 | All compositions render 94 frames @ 24 fps 1920×1080 | PASS | `reports/render-validation.json` — 4 × 94/94 |
| A11 | Exact-cel all-frame fidelity measured | PASS | `reports/fidelity-all-frames.json` — 94 frames, explicit metrics |
| A12 | 26-loop drift measured, described as expected | PASS | `reports/fidelity-all-frames.json` + `reports/FIDELITY.md` + §10 |
| A13 | Puppet metrics diagnostic-only | PASS | `reports/fidelity-all-frames.json` (`objective` field) + §10 |
| A14 | Comparison composition + proof sheet work | PASS | `verify/comparison-contact-sheet.png` + local `remotion/out/comparison-source-vs-2d.mp4` |
| A15 | METHOD.md commands and paths match the implementation | PASS | `reports/doc-validation.json` (74 path references checked) + `reports/logs/docs.log` |
| A16 | STATUS.md has no contradictory historical/current status | PASS | `reports/doc-validation.json` — required handoff sections present, stale claims confined to History |
| A17 | Clean install + typecheck succeed | PASS | `reports/logs/install-tools.log`, `install-remotion.log`, `browser.log`, `typecheck.log` |
| A18 | No MP4s / node_modules / temp sequences committed | PASS | `reports/test-matrix.json` → `tracked-audit`: 356 tracked files, 31 allowed historical binaries, all 216 required assets tracked |

**Required test that is not an A-gate:**

| Test | Status | Detail |
|---|---|---|
| Test I — motion & continuity | **FAIL (1 of 8 checks)** | 7/8 PASS. The limb-segment-length check fails: max/min **2.891×** (knee→ankle) against a documented 2.0 tolerance. Classified as a **pre-existing design limitation, not a regression** — see §14. |

Test I is deliberately **not** folded into A8. A8 gates the puppet's *design being unchanged*, not its motion quality. Reporting the limb-length finding as a FAIL rather than widening the tolerance to make it green is required by contract rule 3.

### Verification runs

| Run | Tree | Environment | Result |
|---|---|---|---|
| Previous session | clean clone of `4a01b9c` | fresh ~1 GB / 2-core sandbox | 16/17 steps PASS, Test I FAIL → committed as `7fab95f` |
| **This session** | clean clone of `7fab95f` | Debian 12, 2 cores, 1.09 GB RAM, Node v20.20.2 | **17/18 steps PASS, A1–A18 all PASS**, Test I FAIL (7/8 checks). Run at 2026-11-17T23:07:11Z; `reports/test-matrix.json` regenerated. |

Reproducibility proofs established by **this** run, independent of the earlier workspace:

- all 94 re-traced `cel94/` SVGs are **byte-identical** to the committed ones — `git diff HEAD -- remotion/public/cel94` is empty after `--force-trace` (74.4 s);
- the 26 legacy `cel/` SVGs are untouched — same diff empty;
- 94/94 committed `frames/` PNGs **pixel-identical** to a fresh 960×540 extraction;
- 26/26 committed `fullres/` PNGs **byte-identical** to a fresh extraction;
- bulk tracing emitted **zero** debug `_flat.png` files (`cel94 complete: 94 SVGs, debug PNGs: none`), and the opt-in behaviour is unit-tested;
- fidelity aggregates reproduce **exactly**: 1.046 / 2.5423 / 5.6307 MAE, to all reported decimal places;
- all four MP4s reproduce with **identical byte sizes** (1,390,475 / 1,382,406 / 654,591 / 1,912,189 B);
- both generated contact sheets reproduce **byte-identically** (`git status` shows no change to `verify/contact-sheet.png` or `verify/comparison-contact-sheet.png`).

Step timings this run (2 cores / 1.09 GB): install 6.1 + 5.8 s, browser 10.3 s, extract 7.7 s, source 2.8 s, trace 74.4 s, assets 1.4 s, units 0.5 + 0.7 s, typecheck 3.7 s, compositions 6.4 s, stills 20.5 s, render 73.1 s, fidelity 36.9 s, motion 1.2 s, docs 0.1 s.

## 14. Remaining limitations and recommended next task

1. **Test I limb-length FAIL — pre-existing, measured, not tuned away.** Segment lengths vary up to **2.891×** (knee→ankle) against a 2.0 tolerance. The origin is measured at three separate levels, not guessed: the raw hand-measured keys already vary **1.958×**, build-time Catmull-Rom resampling into the 26-sample `LEG_CYCLE` amplifies that to **2.891×**, and per-frame interpolation adds **no** further overshoot on the maximum (`interpolationOvershoot = 1.0`). Continuity itself is clean: no joint pop (17.18 px at the wrap vs 276.13 px p95) and no pixel pop (MAD 1.278 vs 5.082 p95) at the 26-frame boundary. Details: `reports/motion-validation.json`.
2. **No IK stance-locking, no measured foot-contact solver, no bone-length constraints** exist in `Runner.tsx` / `keys.ts`. Future work — never claimed as passing tests.
3. **The puppet is visibly more stylized than the source.** Torso and limbs need more mass, the scarf tail is too ribbon-straight, the backpack sits flatter, the feet are cruder. All are tuning constants; improving them is a separate animation task.
4. **The 26-cel loop drifts by design.** Use `CelRun` when frame accuracy matters.
5. **Traced cels are not editable artwork.** Paths are per-frame; a design change means re-tracing new source frames.
6. **The legacy 26 cels carry no `viewBox`** (width/height only, as vtracer emitted them). Left byte-identical on purpose and recorded as a deviation in the asset report, not silently "fixed".
7. **Pixel fidelity ≠ generalization.** Nothing here proves rig reusability, new actions, or storyboard automation. Frame fidelity, motion plausibility, editability, generalization and production repeatability remain separate claims.
8. **MP4s are not committed** (contract rule 7). They must be regenerated locally; `remotion/out/` is gitignored.

**Recommended next task (separate from this reconciliation):** improve puppet mass / scarf / backpack fidelity and add bone-length constraints or IK, using `reports/motion-validation.json` and the puppet fidelity diagnostics as the baseline. Do **not** change the traced-cel pipeline or the character design to chase a pixel score.

## 15. Confirmation — artwork and animation design unchanged

The character artwork and animation design were **not** intentionally changed by this reconciliation.

- `remotion/src/puppet/Runner.tsx`, `remotion/src/puppet/keys.ts` and `remotion/src/RunCycle.tsx` are **byte-identical** to the pre-reconciliation baseline `5ab3d64` — verified for both the committed tree and the working tree by the `puppet-unchanged` step in `verify.mjs`.
- The 26 legacy cels in `remotion/public/cel/` are untouched.
- The locked 11-colour palette and every VTracer parameter are unchanged. The only tracer behaviour change is that the debug `_flat.png` is now **opt-in** (`--flat` / `FLAT_PNG=1`), which does not alter SVG output — proven by the byte-identical re-trace.
- The `cel94/` assets received a `viewBox="0 0 1920 1080"` metadata normalization that does not alter paths or rendering.
- The Test I tolerance was **not** widened, and the puppet was **not** re-tuned to make any score look better.
- No generative AI image or video was used anywhere. Every proof sheet is assembled from the actual source video, extracted frames and real renders.
