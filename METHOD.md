# How the video was recreated in 2D — method, tooling, and reproduction

Source: `source/input_video.mp4` — **3.92 s, 1920×1080, 24 fps, 94 frames + audio** (soft footstep thuds ≈ every 0.54 s). A slate-gray stylized runner with a cream scarf and a light backpack, running in place on white with a soft ground shadow.

Everything below is reproducible from the files in this folder. Two independent recreations were built, both driven by **Remotion** compositions, so the animation is code, not a baked video.

| Deliverable | Composition | What it is |
|---|---|---|
| `out/run-2d-cel.mp4` | `CelRun` | **Faithful flat-2D replica.** One vectorized SVG cel per source frame (94 cels). Mean per-channel error vs source **2.71 / 255**. |
| `out/run-2d-cel-loop.mp4` | `CelLoop` | Same look, only **26** cels looped (1.7 MB of assets). Error 4.25 — the source gait drifts slightly, so the loop degrades over time. |
| `out/run-2d-puppet.mp4` | `RunCycle` | **Parametric vector puppet.** No traced artwork at all: skeleton keys + math generate every frame. Fully editable. Error 7.24 (stylized). |
| `out/comparison-source-vs-2d.mp4` | `Comparison` | Four-panel proof: source / cel / puppet / 50 % overlay, labelled, with original audio. |

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

**Why 94 cels and not 26.** The 26-frame loop was the original plan and it looks right, but measurement showed the source stride is *almost* — not exactly — 26 frames: playing 26 cels on repeat drifts out of phase, and the error grows through the clip (per-channel mean |Δ| 2.7 for frames 1–25, up to 7.2 by frame 73). A "pick the closest cel per frame" remap was tried and rejected: it only improved the error 12 % and produced non-monotonic jumps (frame 46 → cel 7, frame 48 → cel 22) that read as popping. Tracing all 94 frames removes the assumption entirely and costs 6 MB instead of 1.7 MB. Both variants are kept: `CelRun` (exact) and `CelLoop` (lightweight, loops forever).

Bulk tracing writes the debug `_flat.png` only with `--flat` / `FLAT_PNG=1`, so 94 traces don't dump 94 extra 1080p PNGs.

## 4. Pipeline B — parametric puppet (`src/puppet/`)

`keys.ts` holds every measured constant; `Runner.tsx` turns them into one SVG per frame. Nothing is traced, so every proportion, color and timing is editable.

- **Legs** — 7 measured keys per half-stride (hip/knee/ankle/toe), stored hip-relative, resampled with **Catmull-Rom** into a cyclic 26-sample track. Near leg samples at *f*, far leg at *f + 13* — the symmetry trick, in code.
- **Bounce** — hip Y and head Y are independent 7-key periodic tracks over the 13-frame step, also Catmull-Rom, so the motion is smooth at non-integer frames.
- **Arms** — 2 measured extremes (forward / back) blended by `cos(2πf/26)`, plus a `1 − cos²` "bulge" term that drops the elbow and fist through the middle of the swing. That single term is what stops the arms looking like a linear pendulum.
- **Scarf** — a 6-point centerline behind the knot, each point offset by `amp·sin(2πf/13 − i·0.85)`: a travelling wave with growing amplitude toward the tip. Ribbon edges are the centerline ± half-width along the local perpendicular, smoothed into beziers, with a shade stripe along the lower edge.
- **Feet** — filled wedges oriented along ankle→toe, so the foot rolls naturally instead of being a stub.
- **Shadow** — ellipse whose radius and opacity follow `|cos(2πf/26)|`: wide and dark on contact, narrow and light at passing pose.
- **Draw order** — far limbs → scarf tail → backpack + strap → torso → near leg → scarf knot → head → near arm. Limbs are two stacked round-capped strokes (outline width + 9, then fill width), which is what gives the flat-2D outlined look for free.

## 5. Remotion wiring

```
src/index.ts        registerRoot
src/Root.tsx        4 compositions, all 1920×1080 @ 24 fps, 94 frames
src/CelRun.tsx      <Img> cel94/f_{frame+1}.svg          (exact)
src/CelLoop.tsx     <Img> cel/f_{frame%26+1}.svg         (lightweight)
src/RunCycle.tsx    <Runner frame={frame}/>              (parametric)
src/Comparison.tsx  4 labelled panels + 50% overlay
public/audio.m4a    original audio, attached with <Audio> in every comp
public/srcframes/   94 source PNGs at 960×540 (comparison panels only)
```

The comparison panels are 960×540 = exactly the extracted source-frame size, so the reference is never resampled. The puppet panel is the same 1920×1080 SVG under `transform: scale(0.5)`, so all four panels share one coordinate system.

**Labels are HTML, not ffmpeg `drawtext`.** The static ffmpeg build ships without libfreetype (`ffmpeg -filters | grep drawtext` → nothing), which is precisely why the previous session's comparison command was never going to work. Doing the labels as Remotion `<div>`s is both a workaround and an improvement: the comparison video is now itself a Remotion composition, fully re-renderable and editable.

## 6. Rendering inside a ~1 GB sandbox

Remotion's built-in multi-threaded ffmpeg stitch gets OOM-killed here. `render-lowram.mjs` splits the job:

```bash
npx remotion render <Comp> out/<name>frames --sequence --concurrency=1
ffmpeg -framerate 24 -start_number 0 -i out/<name>frames/element-%02d.png \
       -i public/audio.m4a -c:v libx264 -pix_fmt yuv420p -threads 1 -crf 18 \
       -preset medium -c:a aac -b:a 128k -shortest out/<name>.mp4
```

It auto-detects the sequence filename/padding rather than assuming it, and deletes the PNG sequence after a successful stitch (`KEEP_FRAMES=1` to keep it) — the sequences are 13–32 MB each and fully regenerable. Timings on 2 cores / 1 GB: **~18 s per 94-frame 1080p composition** (cel), ~24 s for the 4-panel comparison, ~95 s to trace all 94 frames.

Chrome-headless-shell needs system libs that aren't in the base image; `apt-get update` first, then:
`libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libasound2 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libxcb1 libxkbcommon0` (+ `fonts-dejavu-core` for the panel labels).

## 7. Verification

Per-channel mean absolute difference against the source, sampled every 6th frame at 960×540 (`verify/fidelity.json`):

| Version | mean \|Δ\| (0–255) | % pixels with Δ > 40 |
|---|---|---|
| `CelRun` — 94 traced cels | **2.71** | **0.54 %** |
| `CelLoop` — 26 traced cels | 4.25 | 1.67 % |
| `RunCycle` — parametric puppet | 7.24 | 3.85 % |

For context, 2.71 is essentially the posterization floor — the difference between the source's soft shading and flat 2D fills, not a pose or timing error. The 50 % overlay panel in the comparison video shows a single crisp figure with only faint scarf ghosting, including at frame 73 where the old 26-frame loop was worst. Visual references: `verify/compare.png` (older 3-row sheet), `verify/comparison_f73.png`, `remotion/out/compare-still.png`.

## 8. Reproduce from scratch

```bash
cd video2d/tools   && npm ci          # ffmpeg/ffprobe/pngjs/sharp/vtracer
cd ../remotion     && npm ci          # remotion 4.0.240 + react 18
npx remotion browser ensure           # + the apt libs listed in §6

# regenerate assets from the source video (optional — all assets are committed)
FF=../tools/node_modules/ffmpeg-static/ffmpeg
$FF -i ../source/input_video.mp4 -vf scale=960:-1 ../frames/f_%03d.png
$FF -i ../source/input_video.mp4 ../fullres/f_%03d.png
$FF -i ../source/input_video.mp4 -vn -c:a aac -b:a 128k public/audio.m4a
for i in $(seq 1 94); do n=$(printf "%03d" $i); \
  node ../tools/flatrace.js ../fullres/f_$n.png public/cel94/f_$n.svg; done

npm run render:all:lowram             # all four MP4s
npm run studio                        # interactive editing, 0.0.0.0:3000
```

## 9. Known limits / next steps

- **The puppet is stylized, not exact.** Torso and limbs need more mass, the scarf tail is too ribbon-straight (the source flutters wider and curls), the backpack sits flatter, the feet are cruder. All of it is tuning constants in `keys.ts` / `Runner.tsx` — no re-measuring needed.
- **The cel version is not editable artwork.** It is faithful vector output, but the paths are per-frame; changing the character means re-tracing new source frames. The puppet is the version to edit.
- **Audio is the original track**, not synthesized. Footsteps are already frame-aligned (13-frame period), so it stays in sync for any 26- or 94-frame playback, but a longer loop would need the audio looped too.
- **Licensing**: vtracer/pngjs/sharp are permissive; the ffmpeg static binaries are GPL-3.0 (fine for rendering, relevant if you redistribute the binaries); **Remotion is source-available, not open source** — free for individuals and small companies, otherwise a company license.
