# How the video was recreated in 2D — method, tooling, and reproduction

Source: `source/input_video.mp4` — **3.92 s, 1920×1080, 24 fps, 94 frames + audio** (soft footstep thuds ≈ every 0.54 s). A slate-gray stylized runner with a cream scarf and a light backpack, running in place on white with a soft ground shadow.

Everything below is reproducible from a clean clone of this repository. Two independent recreations were built, both driven by **Remotion** compositions, so the animation is code, not a baked video.

All four compositions share one timeline: **94 frames @ 24 fps, 1920×1080**, with the original audio attached exactly once at each composition root. MP4s are **not committed** — they are regenerated into `remotion/out/` (gitignored).

| Deliverable (local, regenerated) | Composition | What it is |
|---|---|---|
| `out/run-2d-cel.mp4` | `CelRun` | **Exact flat-2D replica — the fidelity deliverable.** One unique vectorized SVG cel per source frame, 94 cels in `public/cel94/`, each played once. All-94-frame MAE vs source **1.046 / 255** at native 1920×1080. |
| `out/run-2d-cel-loop.mp4` | `CelLoop` | **Lightweight control, NOT the fidelity deliverable.** Only **26** cels in `public/cel/`, selected `(frame % 26) + 1`. All-frame MAE **2.5423** — the source stride is not exactly 26 frames, so the loop drifts out of phase. That drift is expected and measured. |
| `out/run-2d-puppet.mp4` | `RunCycle` | **Parametric vector puppet (procedural rig).** No traced artwork: a constrained skeleton + two-bone IK generate every frame. Fully editable/reusable. All-frame MAE **5.849** (Phase 3 cohesive geometry) — a *diagnostic*, not a fidelity target. |
| `out/comparison-source-vs-2d.mp4` | `Comparison` | Four-panel proof: source / exact cel / puppet / 50 % overlay, HTML-labelled, original audio. |

Fidelity figures above come from `reports/fidelity-all-frames.json` (all 94 frames, no resampling). The older **2.71 / 4.25 / 7.24** numbers were computed on **16 sampled frames at six-frame intervals at 960×540** and are kept only as a labelled historical reference in `fidelity.json` — see §7.

---

## 1. Measure first, animate second

Before drawing anything, the clip was reduced to numbers (`tools/analyze.js`, `tools/sample.js`, `tools/grid.js`, all plain Node + `pngjs`):

- **Loop period** — every frame downsampled to 96×54 grayscale, then mean-absolute-difference against itself shifted by *p* frames, for *p* = 4…30. Minimum at **p = 13** (one step / vertical bounce) and **p = 26** (full left+right stride).
- **Run in place** — dark-pixel bounding box + centroid per frame: center x stays ≈ 880/1920, hip bounces ≈ 56 px at 1080p. So no camera or translation to model.
- **Palette** — exact-color histogram over non-white pixels: body `#686D75`, far-side limbs `#4E5561`, scarf `#F3E9D3`, pack `#C6BAB0`, outline `#30303A`, eye `#272A3E`, shadow `#DCDBDE`.
- **Skeleton** — `tools/grid.js` burns a 40 px measurement grid (major lines + coordinate labels every 200 px, drawn with a hand-rolled 3×5 bitmap font, no font dependency) onto full-res keyposes; hip/knee/ankle/toe/shoulder/elbow/fist were then read off those grids into `remotion/src/puppet/keys.ts`.
- **Audio** — periodic thuds every ≈ 0.54 s = 13 frames, i.e. one per footfall. The original audio is carried over untouched (`public/audio.m4a`), so sync is exact by construction.

**Symmetry shortcut:** the far (darker) limb at frame *f* matches the near (lighter) limb at *f + 13*. Only one 13-frame half-stride had to be measured per leg; the other half is the same track phase-shifted by 13. That halves the hand-measurement work.

## 2. Open-source survey — what was used, what was rejected

| Project | License | Verdict |
|---|---|---|
| **[vtracer](https://github.com/visioncortex/vtracer)** (`@visioncortex/vtracer`, WASM) | MIT / Apache-2.0 | **Used.** Raster→SVG with color clustering *and* a lockable fixed palette — the single most useful tool here. ⚠️ the unscoped `vtracer` npm package is a different, unrelated project. |
| **ffmpeg / ffprobe** (`ffmpeg-static`, `ffprobe-static`) | GPL-3.0-or-later (binaries) | **Used.** Frame extraction, audio extraction, final encode. npm-distributed binaries — no apt wait. |
| **pngjs** | MIT | **Used.** Pixel-level analysis, palette posterization, grid overlay. |
| **sharp** (libvips) | Apache-2.0 | **Used.** Rasterizing SVGs for visual checks and contact sheets. |
| **Remotion** | ⚠️ **source-available, not OSI open source** — free for individuals and small companies, paid company license above that ([license FAQ](https://www.remotion.dev/docs/license/faq)) | **Used**, because it was an explicit requirement of the brief. Worth knowing if this ships commercially. |
| potrace / autotrace | GPL | Rejected: black-and-white bitmap tracing only; would need one pass per color layer and loses vtracer's palette control. |
| Lottie (`lottie-web`), Rive | MIT / runtime MIT | Rejected: both need an authored animation document (After Effects / Rive editor). Nothing here exports that; Remotion already *is* the code-driven renderer. |
| DragonBones / Spriter / Synfig / OpenToonz | MIT / GPL / BSD | Rejected: full 2D skeletal-animation DCCs. Overkill for a 4-second loop, and their runtimes are not Remotion-native. |
| EbSynth, DiffVG / LIVE (differentiable vectorization) | free binary / research code | Rejected: EbSynth is example-based texture propagation (not vector, not open source); DiffVG-style fitting needs GPU training time far beyond this clip's budget. |

Net result: **four small libraries** did all the work. No rotoscoping by hand, no ML training.

## 3. Pipeline A — flat-2D cel tracing (`tools/flatrace.js`)

The source is a *shaded* render: soft gradients and anti-aliasing. Feeding that straight into vtracer produced 113 fragmented paths and a mushy result. The fix is to **flatten before tracing**:

1. **5-tap cross blur** (center weight 2) — suppresses gradient/AA noise without eating small features.
2. **Nearest-palette quantization** in RGB against the 11 sampled colors — every pixel becomes exactly one flat color.
3. **Despeckle** — only *fully isolated* pixels (0 of 4 neighbors matching) adopt the neighbor majority. An earlier, more aggressive version (≥2 neighbors) erased the eye and smile; softening it preserved the face.
4. **vtracer** on the flattened pixels, with `palette:` locked to the same hex list:
   ```js
   {mode:'spline', hierarchical:'stacked', clustering:'color-cluster',
    filterSpeckle:7, colorPrecision:6, cornerThreshold:75, lengthThreshold:5,
    spliceThreshold:45, simplify:2, pathPrecision:2, optimize:2, palette:hex}
   ```
   → ~55–77 KB and 130–170 clean spline paths per 1080p frame.

The result is genuine vector artwork with flat 2D fills — not a filtered raster.

**Why 94 cels and not 26.** The 26-frame loop was the original plan and it looks right, but measurement showed the source stride is *almost* — not exactly — 26 frames: playing 26 cels on repeat drifts out of phase, and the error grows through the clip. Measured over **all 94 frames at 1920×1080**, the loop's per-frame MAE runs from **0.972** (still in phase, early frames) to **6.1712** at frame 34, with the late-clip cluster f73–f75 at 5.43 / 5.51 / 4.88 — the historically worst region. The exact variant stays inside **0.9012 … 1.2085** across the whole clip. A "pick the closest cel per frame" remap was tried and rejected: it only improved the error 12 % and produced non-monotonic jumps (frame 46 → cel 7, frame 48 → cel 22) that read as popping. Tracing all 94 frames removes the assumption entirely and costs 6 MB instead of 1.7 MB. Both variants are kept as **separate compositions**: `CelRun` (exact, monotonic, never repeats) and `CelLoop` (lightweight control, wraps every 26 frames by design).

Bulk tracing writes the debug `_flat.png` only with `--flat` / `FLAT_PNG=1`, so 94 traces don't dump 94 extra 1080p PNGs.

## 4. Pipeline B — parametric puppet (`src/puppet/`)

`keys.ts` holds every measured constant; `Runner.tsx` turns them into one SVG per frame. Nothing is traced, so every proportion, color and timing is editable. The puppet was upgraded (Phases 0–4) into a constrained, reusable 2D character rig; the original measured gait still drives the motion intent.

- **Constrained skeleton + two-bone IK (Phase 1)** — `rig.ts` defines fixed rest bone lengths (thigh 186.00 / calf 177.82 / upper arm 115.91 / forearm 91.97 / foot artwork 87.30 px, calibrated from the raw keys); `ik.ts` is a generic analytic law-of-cosines two-bone solver (reach annulus clamp, explicit bend-side hint); `pose.ts` evaluates a pose as a **pure function of (rig, motion, frame)** with fixed bone lengths (solved error ~1e-13 px) and raw-vs-solved targets preserved for diagnostics. Knees bend −1 (front), elbows +1 (trailing); mirroring flips x and the bend sign.
- **Legs** — 7 measured keys per half-stride (hip/knee/ankle/toe), stored hip-relative, resampled with **Catmull-Rom** into a cyclic 26-sample track. Near leg samples at *f*, far leg at *f + 13* — the symmetry trick, in code.
- **Bounce** — hip Y and head Y are independent 7-key periodic tracks over the 13-frame step, also Catmull-Rom, so the motion is smooth at non-integer frames.
- **Arms** — 2 measured extremes (forward / back) blended by `cos(2πf/26)`, plus a `1 − cos²` "bulge" term that drops the elbow and fist through the middle of the swing.
- **Cohesive geometry (Phase 3a)** — each limb (thigh+calf, upper arm+forearm) is ONE closed tapered outline drawn once (no exposed knee/elbow balls, no joint gaps); the torso has a shoulder taper, chest, waist and pelvis; the foot is a designed heel/sole/toe silhouette oriented along the ankle→toe control vector with a stable ankle pivot.
- **Scarf (Phase 3b)** — a deterministic fixed-length chain (knot + 6 tail nodes, each segment exactly 72 px) whose shape at frame *f* is a pure closed-form traveling wave with per-node phase lag + gravity droop, heading clamped so it never flips (`secondary.ts`). Pure for any frame — no simulation state.
- **Backpack (Phase 3b)** — torso attachment with a small deterministic bob/lag; the strap's backpack-side endpoint is derived from the same `translate+rotate` transform as the pack (no slide/detach).
- **Foot contacts / stance (Phase 2, data model + diagnostic)** — a reviewed contact track (`motion/contacts.ts`) and a belt-locked stance/anchor **diagnostic** (`motion/stance.ts`, `reports/stance-locking-validation.json`) describe the treadmill ground contract. **Note:** `Runner.tsx` evaluates `solvePose(frame)` directly; continuous stance-constrained pose integration in the rendered puppet is a follow-up (see §9).
- **Shadow** — ellipse whose radius and opacity follow `|cos(2πf/26)|`: wide and dark on contact, narrow and light at passing pose.
- **Reusable variants (Phase 4)** — the puppet component takes `{frame, rig?, appearance?}`; a second character (teal body / maroon scarf / gold pack, distinct proportions) uses the SAME solver/motion with no duplicated gait (`VARIANT_RIG` / `VARIANT_APPEARANCE` / `PuppetVariant`).
- **Draw order** — far limbs → scarf tail → backpack + strap → torso → near leg → scarf knot → head → near arm.

## 5. Remotion wiring

```
src/index.ts        registerRoot
src/Root.tsx        4 compositions, all 1920×1080 @ 24 fps, 94 frames
src/cels.ts         pure cel-index helpers (exactCelIndex / loopCelIndex) + range validation
src/CelRun.tsx      <Img> cel94/f_{frame+1}.svg          (exact, 94 unique cels)
src/CelLoop.tsx     <Img> cel/f_{(frame%26)+1}.svg       (lightweight control, wraps)
src/RunCycle.tsx    <Runner> frame (parametric, runner rig/appearance)
public/audio.m4a    original audio, ONE <Audio> per composition root (never nested)
public/cel94/       94 unique traced cels — committed
public/cel/         26 loop cels — committed, unchanged legacy assets
public/srcframes/   94 source PNGs at 960×540 — regenerated, gitignored
src/Comparison.tsx  4 labelled panels + 50% overlay
src/puppet/         rig.ts (fixed bones), ik.ts (two-bone solver), pose.ts (pure evaluator),
                    keys.ts (measured motion), Runner.tsx (appearance + variants),
                    secondary.ts (scarf chain + backpack bob/lag), motion/ (contacts + stance)
```

**Composition IDs are the legacy names with corrected semantics.** `CelRun` used to loop 26 cels while the docs claimed 94; it is now genuinely the exact 94-cel variant, and the loop behaviour lives in its own composition `CelLoop`. The mapping is pure logic in `src/cels.ts`, unit-tested at the start, middle, wrap and final frames (`remotion/test/cels.test.ts`), so it is verified without rendering video. Out-of-range or non-integer frames throw instead of silently wrapping.

The comparison panels are 960×540 = exactly the extracted source-frame size, so the reference is never resampled. The puppet panel is the same 1920×1080 SVG under `transform: scale(0.5)`, so all four panels share one coordinate system. `public/srcframes/` is regenerable (`tools/extract-frames.js`) and gitignored, so it must exist before rendering `Comparison`.

**Labels are HTML, not ffmpeg `drawtext`.** The static ffmpeg build ships without libfreetype (`ffmpeg -filters | grep drawtext` → nothing), which is precisely why the previous session's comparison command was never going to work. Doing the labels as Remotion `<div>`s is both a workaround and an improvement: the comparison video is now itself a Remotion composition, fully re-renderable and editable.

## 6. Rendering inside a ~1 GB sandbox

Remotion's built-in multi-threaded ffmpeg stitch gets OOM-killed here. `render-lowram.mjs` (repository root) splits the job and **works from any current directory** — it resolves the repo root from its own location, runs Remotion with an explicit `cwd` of `remotion/`, and resolves ffmpeg/ffprobe from `tools/node_modules`:

```bash
node render-lowram.mjs                # all four registered compositions
node render-lowram.mjs CelRun         # just one
KEEP_FRAMES=1 node render-lowram.mjs  # keep PNG sequences (needed for scoring)
# equivalent, from remotion/:
npm run render:all:lowram
```

Per job it runs:

```bash
npx remotion render <Comp> out/<name>frames --sequence --concurrency=1 --log=error
ffmpeg -framerate 24 -start_number <detected> -i out/<name>frames/<detected>-%0Nd.png \
       -i public/audio.m4a -c:v libx264 -pix_fmt yuv420p -threads 1 -crf 18 \
       -preset medium -c:a aac -b:a 128k -shortest out/<name>.mp4
```

Safety rules it enforces (contract §4.3):

- the sequence filename prefix, zero-padding and start index are **detected**, not assumed;
- the PNG sequence is validated **before** encoding: exactly 94 frames, contiguous indexes, consistent naming, valid non-empty PNGs, all 1920×1080;
- the MP4 is ffprobe-validated **after** encoding: 1 video + **exactly 1** audio stream, 1920×1080, `24/1` fps, 94 frames, duration within 0.1 s of 3.9167 s, audio not truncated vs the reference track;
- every child exit status is checked; a failure keeps its frames and partial MP4 as evidence;
- PNG frames are deleted **only after all verification passed** (`KEEP_FRAMES=1` overrides). `verify.mjs` additionally keeps them until fidelity scoring has also passed;
- it writes `reports/render-validation.json` and a summary table (frames, dims, fps, duration, size, render time, status).

Measured timings on 2 cores / 1 GB: **15.7–18.6 s** per single-layer 94-frame 1080p composition, **23.5 s** for the 4-panel comparison, **77 s** to trace all 94 frames.

Chrome-headless-shell needs system libs that aren't in the base image; `apt-get update` first, then:
`libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libasound2 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libxcb1 libxkbcommon0` (+ `fonts-dejavu-core` for the panel labels, `libcups2 libpango-1.0-0 libcairo2` on Debian 12).

## 7. Verification

One entry point runs the whole suite from a clean checkout and writes a report per test:

```bash
node verify.mjs --install            # npm ci x2 + browser ensure, then Tests A-J
node verify.mjs                      # same, assuming deps are already installed
node verify.mjs --force-trace        # also re-trace all 94 cels (determinism proof)
node verify.mjs --only=stills,render # subset
node verify.mjs --keep-frames        # keep PNG sequences after scoring
```

Statuses are `PASS` / `FAIL` / `BLOCKED` (a dependency failed) / `NOT RUN` (skipped). Every step's full output goes to `reports/logs/<step>.log`, and the acceptance matrix to `reports/test-matrix.json`. A failed step never deletes its own evidence.

| Test | What it checks | Report |
|---|---|---|
| A | ffprobe source metadata: 1920x1080, 24/1, 94 frames, 3.92 s, audio present | `reports/source-media.json` |
| B | Deterministic extraction: 94 contiguous full-res + 94 half-res PNGs, order proofs, byte/pixel identity vs committed assets, audio preserved | `reports/source-frame-validation.json` |
| C | 94 cel94 + 26 cel SVGs: naming, non-empty, XML parses, root `<svg>`, dimensions/viewBox, no embedded rasters, rasterizes, sha256 uniqueness | `reports/svg-asset-validation.json` |
| D | Registry vs render manifest vs this document (3-way ID cross-check), dims/fps/duration, documented npm scripts exist, typecheck | `reports/composition-validation.json` |
| E | Pure frame-index unit tests (11): contract mapping table, monotonic exact, 26-frame period, rejection of out-of-range | `reports/logs/unit-remotion.log` |
| F | 24 stills (4 compositions x frames 0, 12, 25, 26, 72, 93): renders, 1920x1080, not blank, content present | `reports/still-render-validation.json` |
| G | Full low-RAM renders: 94 frames each, sequence integrity, MP4 metadata, exactly one audio stream | `reports/render-validation.json` |
| H | All-94-frame fidelity at native 1920x1080 | `reports/fidelity-all-frames.json`, `reports/FIDELITY.md` |
| I | Puppet motion: determinism, no NaN, bounds, segment lengths, wrap continuity, pixel continuity | `reports/motion-validation.json` |
| J | Labelled 4-panel Comparison + proof sheet from real renders | `verify/comparison-contact-sheet.png` |
| A15/A16 | Docs vs implementation: every documented path resolves (or is gitignored+regenerable), every `npm run` script exists, every composition ID is registered, STATUS.md is a current handoff with stale claims quarantined in History | `reports/doc-validation.json` |

### 7.1 All-frame fidelity (the current measurement)

All **94** frames, rendered frames vs `fullres/` source frames, **both native 1920x1080, no resampling anywhere**. Aggregates are weighted by evaluated channel/pixel counts.

| Variant | Objective | MAE (0-255) | % px any channel > 40 | IoU incl. shadow | IoU character only | Palette exact % |
|---|---|---|---|---|---|---|
| cel94 (`CelRun`) | fidelity deliverable | **1.046** | **0.8006** | **0.9756** | **0.9577** | 99.143 |
| celLoop (`CelLoop`) | control - drift expected | 2.5423 | 1.8057 | 0.8791 | 0.8582 | 99.156 |
| puppet (`RunCycle`) | diagnostic only | 5.849 | 4.5846 | 0.6167 | 0.583 | n/a |

The puppet figures are the **Phase 3 cohesive-geometry** values (pre-upgrade baseline was 5.6307 / 0.6116). The cohesive redesign intentionally trades IoU for cohesion — it fills the knee/elbow/gap regions the thin source leaves white — so the metric is a documented diagnostic, not a regression (master plan §7.8).

Metric definitions (exactly as implemented in `tools/score-fidelity.js`):

- **MAE** = `sum(|render_channel - source_channel|) / (width x height x 3 x frames)` over R, G, B. Range 0-255, lower is closer.
- **pct_pixels_any_channel_gt_40** = a pixel counts **once** iff `max(|dR|,|dG|,|dB|) > 40`, divided by total pixels, x100. Channels are never counted as separate pixels.
- **iou_foreground** = silhouette IoU **including** the ground shadow. Foreground mask: `max(255-R, 255-G, 255-B) > 12`, which captures the `#DCDBDE` shadow and every character colour while excluding white background.
- **iou_character** = the same masks **minus** shadow-classified pixels (`|R-220|<=14 && |G-219|<=14 && |B-222|<=14`). Soft source shadow gradients make some boundary pixels ambiguous; this is a documented approximation applied identically to both sides.
- **palette_exact_pct / palette_near_pct** = rendered pixels exactly equal to one of the 11 locked palette colours, or within +/-2 per channel (anti-aliased boundary tolerance). Cel variants only.

Per-frame distribution (min / median / p95 / max MAE): cel94 **0.9012 / 1.0484 / 1.1197 / 1.2085**; celLoop 0.972 / 2.238 / 4.8647 / 6.1712; puppet 4.0723 / 5.533 / 7.2916 / 7.6782. Worst five frames by MAE: cel94 **f41, f12, f14, f26, f27**; celLoop **f34, f74, f73, f33, f75**; puppet f38, f90, f12, f64, f25. Every per-frame value is in `reports/fidelity-all-frames.json`.

1.046 is essentially the posterization floor - the difference between the source's soft shading and flat 2D fills, not a pose or timing error. The 50 % overlay panel shows a single crisp figure with only faint scarf ghosting, including at frame 73 where the 26-frame loop is worst.

### 7.2 Historical reference (a different, weaker measurement)

`fidelity.json` is preserved verbatim with `_meta.samplingMode = "every_6_frames"`: **16 samples at six-frame intervals at 960x540**, giving MAE 2.71 / 4.25 / 7.24 and pct 0.54 / 1.67 / 3.85. The original scorer was never committed, so its exact `pct` formula cannot be re-derived - it must not be mixed with the defined metric above. These figures are a historical reference only and are **superseded** by §7.1.

### 7.3 What the scores do not prove

Pixel agreement measures visual similarity for this one known clip. It does not prove the rig is reusable, that the motion generalizes to new actions, or that a storyboard can be animated automatically. Frame fidelity, motion plausibility, editability, generalization and production repeatability are separate claims.

### 7.4 Visual proof for human review

- `verify/contact-sheet.png` - 4 compositions x frames 0, 12, 25, 26, 72, 93, labelled.
- `verify/comparison-contact-sheet.png` - the full 4-panel Comparison at the same six frames (Test J).
- `verify/compare.png` - the older 3-row reference sheet, kept for the record.

Both generated sheets are assembled from **actual rendered and extracted frames** - never from image-generation models.

## 8. Reproduce from a clean clone

Run everything from the **repository root** (the directory containing `METHOD.md`). The scripts resolve their own paths, so no `cd` gymnastics are required.

```bash
git clone https://github.com/Ambitious513/video2d.git
cd video2d

# 1. system libraries for chrome-headless-shell (Debian 12; see §6 for the list)
apt-get update && apt-get install -y libx11-6 libxcomposite1 libxdamage1 libxext6 \
  libxfixes3 libxrandr2 libasound2 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
  libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libxcb1 libxkbcommon0 \
  libcups2 libpango-1.0-0 libcairo2 fonts-dejavu-core

# 2. dependencies + browser + the whole test suite, in one command
node verify.mjs --install --force-trace
```

`--install` runs and logs `npm ci` in `tools/` and `remotion/` plus `npx remotion browser ensure`. `--force-trace` re-traces all 94 cels from freshly extracted frames; on a correct checkout the regenerated SVGs are **byte-identical** to the committed ones, so `git status` stays clean. Drop `--force-trace` to reuse the committed cels.

Equivalent explicit steps (each is also an npm script):

```bash
cd tools && npm ci && cd ..                 # ffmpeg/ffprobe/pngjs/sharp/vtracer
cd remotion && npm ci && npx remotion browser ensure && cd ..

node tools/extract-frames.js                # 94 fullres + 94 srcframes PNGs (npm run extract in tools/)
node tools/trace-all.js                     # 94 cels -> remotion/public/cel94/ (npm run trace:all)
node tools/verify-source.js                 # Tests A + B  (npm run verify:source)
node tools/verify-assets.js                 # Test C       (npm run verify:assets)
node tools/verify-docs.js                   # A15 + A16    (npm run verify:docs)
cd remotion && npm test && npm run typecheck && cd ..   # Test E + types
node remotion/scripts/verify-compositions.mjs           # Test D
node remotion/scripts/render-stills.mjs                 # Tests F + J sheets
KEEP_FRAMES=1 node render-lowram.mjs                    # Test G, all four MP4s
node tools/score-fidelity.js --cel94 remotion/out/celframes \
  --celLoop remotion/out/celloopframes --puppet remotion/out/puppetframes   # Test H
cd remotion && npm run verify:motion && cd ..           # Test I

cd remotion && npm run studio               # interactive editing, 0.0.0.0:3000
```

Notes:

- `tools/extract-frames.js` writes `fullres/` (1920x1080) and `remotion/public/srcframes/` (960x540). It **never overwrites** the committed half-resolution `frames/` directory; `tools/verify-source.js` instead proves those 94 PNGs are pixel-identical to a fresh extraction.
- `public/audio.m4a` is committed, so no audio re-extraction is needed. Its duration (3.926 s) is checked against the source track (3.920 s).
- Only `fullres/f_001..f_026.png` are tracked (historical assets, verified byte-identical to a fresh extraction). `f_027..f_094.png` are regenerable and gitignored, as are `remotion/public/srcframes/`, `verify/stills/` and `remotion/out/`.
- MP4 deliverables are intentionally **not committed**; render them locally.

## 9. Known limits / next steps

- **The puppet's bone-length constraint (RESOLVED Phase 1).** The historical Test I FAIL (limb segment max/min 2.891× knee→ankle) was a property of the *unconstrained* hand-measured keys. Phase 1 replaced it with a constrained rig: solved bone-length error **1.421e-13 px**, and Test I was rewritten to gate the constrained rig (12/12). The raw-track variation (1.958× keys → 2.891× stored track → ≤1.192× interp overshoot) remains a reported non-gating diagnostic; the historical 7/8 FAIL is preserved in `reports/baseline/`.
- **Contact/stance is a DATA MODEL + DIAGNOSTIC, not integrated rendered foot locking.** `Runner.tsx` evaluates `solvePose(frame)` directly; the belt-lock slip/drift figures in `reports/stance-locking-validation.json` are a diagnostic contract, not a measured multi-frame planted interval in the rendered puppet. **Continuous stance-constrained pose integration + rendered multi-frame foot-slip verification is a follow-up.**
- **The puppet is cohesive but approximate.** The cohesive redesign (tapered limbs, fuller torso, designed feet, deterministic scarf) reads as one character; it does NOT match the traced cels' fidelity (IoU 0.583 vs 0.9577). Closing that gap is a much larger animation-engine effort (weighted meshes, foot roll, cloth), not a parameter tweak. Its fidelity numbers are diagnostic only.
- **Reusable variants (Phase 4).** A second character (teal) uses the same rig/solver/motion with no duplicated gait; adding more variants is data (rig + appearance), not new solver code.
- **The 26-cel loop drifts by design.** It is a lightweight control, not a fidelity deliverable; use `CelRun` when frame accuracy matters.
- **The cel version is not editable artwork.** It is faithful vector output, but the paths are per-frame; changing the character means re-tracing new source frames. The puppet is the version to edit.
- **The legacy 26 cels have no `viewBox`** (vtracer emitted width/height only). They are left byte-identical on purpose; the new cel94 set gets a `viewBox="0 0 1920 1080"` metadata normalization that does not alter paths or rendering.
- **Audio is the original track**, not synthesized. Footsteps are already frame-aligned (13-frame period), so it stays in sync for any 26- or 94-frame playback, but a longer loop would need the audio looped too.
- **Licensing**: vtracer/pngjs/sharp are permissive; the ffmpeg static binaries are GPL-3.0 (fine for rendering, relevant if you redistribute the binaries); **Remotion is source-available, not open source** - free for individuals and small companies, otherwise a company license.
