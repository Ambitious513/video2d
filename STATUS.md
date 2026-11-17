# Project restored from Google Drive — status & handoff

> **UPDATE — job finished after the restore.** Deps reinstalled, all deliverables re-rendered,
> the comparison video built, and the method write-up delivered: see **`METHOD.md`**.
> Outputs in `remotion/out/`: `run-2d-cel.mp4` (faithful, 94 traced cels), `run-2d-cel-loop.mp4`
> (26-cel loop), `run-2d-puppet.mp4` (parametric), `comparison-source-vs-2d.mp4` (4-panel labelled proof).
> Two fixes along the way: the static ffmpeg has **no `drawtext`** (the old comparison command was
> never going to work) → labels are now Remotion HTML; and the source stride **drifts** off a strict
> 26-frame loop → every frame is now traced, dropping mean error from 4.25 to **2.71/255**.
> Sections 3–6 below describe the state *as restored*, kept for the record.

**Restored:** 2026-11-18 · **Source:** [Drive folder `1s5JSUlF…`](https://drive.google.com/drive/folders/1s5JSUlF_lpXxMXdLq9ULKIMMWiEYsrk6)
**Result:** 12 folders / 210 files / 22.6 MB downloaded, 0 failures, all files integrity-checked (PNG/SVG/MP4/WAV magic bytes + non-empty).

Everything lives in `video2d/` — same layout the previous agent used. Import tooling, the full Drive file tree and a sha256 manifest are in `_drive_import/`.

---

## 1. What the job was

Recreate a Drive video as **2D**, in a way that is **reproducible in Remotion**, using open-source tooling where it speeds things up, and explain the method.

Source clip (`video2d/source/input_video.mp4`, verified after download): **3.92 s, 1920×1080, 24 fps, 94 frames, with audio** (soft footstep thuds ≈ every 0.54 s). A slate-gray stylized character with a cream scarf and a light backpack, running in place on white with a soft ground shadow.

## 2. What the previous agent finished

**Motion analysis** (`tools/analyze.js`, `tools/sample.js`, `tools/grid.js`)
- Loop detected by mean-absolute-difference over frame shifts: **26-frame full stride**, **13-frame bounce/step period**; character runs in place (center x ≈ 880/1920, ~56 px vertical bounce at 1080p). Left/right symmetry: far limb at frame *f* ≈ near limb at *f+13*.
- Palette sampled from pixels: body `#686D75`, far limbs `#4E5561`, scarf `#F3E9D3`, pack `#C6BAB0`, outline `#30303A`, eye `#272A3E`, shadow `#DCDBDE`.
- Joint positions read off 40 px measurement grids (`video2d/grid/`) → `remotion/src/puppet/keys.ts`.

**Open-source toolchain** (`video2d/tools/`, deps pinned in `tools/package.json`)
- `ffmpeg-static` / `ffprobe-static` — frame + audio extraction, encoding.
- `pngjs` — pixel analysis, palette posterization.
- **`@visioncortex/vtracer`** (WASM build of the Rust vtracer) — raster→SVG. ⚠️ The plain `vtracer` npm package is unrelated; the scoped one is the real project.
- `sharp` — rasterizing SVGs for visual checks.
- Key trick (`tools/flatrace.js`): **posterize to the fixed palette + despeckle, then vtracer with `palette:` locked** → clean flat-2D cels instead of fragmented gradient traces. Eye/smile survive after the blur/despeckle was softened.

**Two Remotion deliverables** (`video2d/remotion/`, Remotion 4.0.240, React 18)
| Composition | Files | Nature |
|---|---|---|
| `CelRun` | `src/CelRun.tsx` + `public/cel/f_001…f_026.svg` | Faithful flat-2D replica: 26 traced SVG cels looped over 94 frames, original audio (`public/audio.m4a`). Visually near-identical to source. |
| `RunCycle` | `src/RunCycle.tsx` + `src/puppet/{keys.ts,Runner.tsx}` | Parametric vector puppet — fully editable code-driven gait (Catmull-Rom leg cycle, sinusoidal arms, waving scarf ribbon, shadow that widens on contact). Gait-faithful but **more stylized** than the source. |

Both compositions were successfully rendered to MP4 in the old session, and `verify/compare.png` (row 1 source / row 2 cel / row 3 puppet) confirms the cel version matches poses, proportions and timing.

**Environment workaround worth remembering:** the sandbox has ~1 GB RAM (still true: 1.06 GB, 2 cores). Remotion's multi-threaded ffmpeg stitch gets OOM-killed. Working recipe: render `--sequence --concurrency=1`, then stitch with `ffmpeg-static -threads 1`. Chrome-headless-shell also needs a handful of X/nss/alsa system libs installed via apt.

## 3. Exactly where it stopped

The last command was building the **side-by-side "SOURCE vs 2D RECREATION" comparison video** with ffmpeg `drawtext` labels:

```
ffmpeg -i source/input_video.mp4 -i remotion/out/run-2d-cel.mp4 -filter_complex "...hstack" ... out/comparison-source-vs-2d.mp4
```

It never reported back — the session hit **"Usage limit reached"**. So two promised items are outstanding:
1. the labelled comparison video (unverified/likely unfinished), and
2. the **written explanation of the method** — never produced.

## 4. What is NOT in the Drive share

- **`remotion/out/` entirely** — `run-2d-cel.mp4`, `run-2d-puppet.mp4`, the `celframes/` + `puppetframes/` PNG sequences, and any comparison MP4. All final video deliverables must be **re-rendered** (cheap: assets + code are all here).
- `node_modules/` for both `tools/` and `remotion/` (expected — `package-lock.json` for each is present, so `npm ci` reproduces them exactly).
- No README / write-up / notes file existed.
- `fullres/` holds only the 26 loop frames (f_001–f_026) plus a few extras; `frames/` has all 94 half-res frames + `contact_sheet.png`. Nothing needed for the loop is missing.

## 5. How to resume

```bash
# 1. tool deps (ffmpeg/ffprobe binaries come from npm, not apt)
cd video2d/tools   && npm ci
# 2. remotion deps
cd ../remotion     && npm ci
# 3. chrome-headless-shell system libs (first run only)
#    libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libasound2
#    libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 libdrm2 libgbm1
#    libglib2.0-0 libnspr4 libnss3 libxcb1 libxkbcommon0
# 4. low-RAM-safe render (frames, then single-threaded stitch)
npx remotion render CelRun   out/celframes   --sequence --concurrency=1
npx remotion render RunCycle out/puppetframes --sequence --concurrency=1
FF=../tools/node_modules/ffmpeg-static/ffmpeg
$FF -y -framerate 24 -i out/celframes/element-%02d.png   -i public/audio.m4a \
    -c:v libx264 -pix_fmt yuv420p -threads 1 -crf 18 -c:a aac -b:a 128k -shortest out/run-2d-cel.mp4
# 5. interactive editing
npm run studio     # binds 0.0.0.0:3000
```

## 6. Open quality gap (if fidelity is the goal)

The **cel version is already near-exact**. The **puppet** is the editable one and still reads thinner/more stick-figure than the source: torso and limbs need more mass, the scarf tail is too ribbon-straight (source flutters wider and curls), the backpack sits flatter/smaller, and the feet wedges are cruder. `keys.ts` holds every measured constant, so this is tuning work, not re-measuring.
