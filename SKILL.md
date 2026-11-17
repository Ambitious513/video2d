---
name: storyboard-to-2d-animation
description: Compile a storyboard into frame-accurate, flat-2D vector animation rendered as code (Remotion), then verify it against numeric gates before it is allowed to ship. Use for explainer/motion-graphics/character-lite content that must be reproducible, editable, and consistent across many episodes.
version: 1.0
owner: animation-system
requires: [style-bible@>=1, shot-ir@>=1, rig-registry@>=1, module-library@>=1]
---

# SKILL: Storyboard → verified 2D animation

> **Core thesis.** Quality does not come from describing how to draw. It comes from a
> **closed loop: author → render → measure → repair**, with numeric acceptance gates.
> Every rule below exists because skipping it produced a specific, observed defect.
> Evidence from the reference build (`video2d/`): traced-cel replica scored **2.71/255**
> mean per-channel error vs source; a 26-frame loop of the same art drifted to **4.25**;
> a hand-keyed parametric puppet scored **7.24**. The gap between 7.24 and 2.71 was
> *representation and measurement*, not talent. This skill encodes how to close it.

---

## 0. When to use / when to refuse

**Use when:** flat/vector 2D, limited palette, rigid-or-semi-rigid forms, deterministic
replay required, many episodes sharing one look, notes must be fixable by changing a number.

**Refuse or renegotiate when asked for:** painterly/hand-drawn line quality, hair/cloth
beyond a short chain sim, facial acting/lip-sync performance, photoreal shading,
3D camera parallax with occlusion, or "match this arbitrary video exactly" without a
reference clip to measure against. Say so explicitly and offer the fallback in §15.

---

## 1. Non-negotiables (hard rules)

1. **No final frame is produced by a generative video/image model.** Generative models may
   be used for *reference exploration* and *semantic QC*, never for shipped pixels.
2. **No hardcoded colors, durations, stroke widths, or easings anywhere downstream of the
   style bible.** Tokens only. A lint rule enforces this.
3. **No motion key may be invented by eye when a reference exists.** Measure it, fit it,
   report the residual.
4. **Nothing ships without gate results attached.** A shot with no score file is a failed shot.
5. **Never fake, estimate, or hand-wave a score.** If a measurement cannot run, the gate
   status is `BLOCKED`, not `PASS`.
6. **Audio is the timeline master** when voiceover exists. Visual timing derives from
   word-level alignment, never from guessed durations.
7. **Human approval at animatic stage is mandatory** before any final-resolution render.
8. **Determinism:** same inputs + same seed → byte-identical frames. All randomness seeded
   from the shot ID.
9. **Bounded repair:** max 3 automatic repair iterations per shot, then escalate with
   evidence. Never loop silently.
10. **Every fixed defect becomes a permanent check** (§16). The floor must rise monotonically.

---

## 2. Scope: what is IN, what is OUT

| IN (build these) | OUT (explicitly excluded) |
|---|---|
| Flat fills, ≤12-color palette, 2–3 tone bands per material | Gradients-as-shading, textures, noise, film grain |
| Closed silhouette shapes, unioned per depth layer | Per-segment outlined "stick" limbs |
| Skeletal IK with stance lock, spring-lag secondary motion | Free-floating hand-keyed feet, rubber limbs |
| Short chain sim (5–8 nodes) for scarf/strap/tail | Full cloth/hair simulation, collisions with environment |
| Typographic + diagram + icon + chart modules | Hand-lettering, calligraphic line variation |
| Camera: pan/zoom/rotate in 2D, cut/wipe/push transitions | 3D parallax, depth-of-field, motion blur |
| Deterministic seeded variation | Stochastic generative fills |
| Remotion (or equivalent code renderer) | After Effects-only pipelines, proprietary DCC dependencies |
| Numeric + VLM verification | "Looks good to me" review |

**Style-family rule:** one skill instance = one style family. Do not let a single run mix
two looks. New look → new style bible version → new golden tests.

---

## 3. Toolchain (install, purpose, license, gotchas)

### 3.1 Required

| Tool | Version pin | Purpose | License | Gotcha |
|---|---|---|---|---|
| Node | 20.x | renderer host | MIT | — |
| Remotion + @remotion/cli | 4.0.240 | code→frames | **source-available, NOT OSI open source**; free for individuals/small companies, paid company license above threshold | Budget/license decision must be made before scale |
| react / react-dom | 18.3.1 | composition UI | MIT | — |
| ffmpeg-static | 5.3.0 | extract/encode | GPL-3.0-or-later (binaries) | **Static build has NO `drawtext` (no libfreetype).** All text must be renderer HTML/SVG. Redistributing binaries carries GPL obligations |
| ffprobe-static | 3.1.0 | probe | MIT | — |
| pngjs | 7.0.0 | pixel analysis | MIT | — |
| sharp | 0.35.5 | rasterize SVG, resize, contact sheets | Apache-2.0 | SVG text needs system fonts installed |
| @visioncortex/vtracer | 1.0.0-alpha.4 | raster→SVG with **lockable palette** | MIT OR Apache-2.0 | **The unscoped `vtracer` npm package is a different, unrelated project.** Always use the scoped name |
| Python | 3.11 | gates, fitting, alignment glue | PSF | — |
| numpy, pillow, scipy | latest | scoring, fitting | BSD | — |
| whisperX *or* stable-ts | latest | word-level forced alignment | BSD/MIT | needs torch; CPU-only fine for short VO; cache aggressively |
| a TTS provider | — | voiceover | provider terms | see Launch Engine §7 for voice licensing |

### 3.2 System packages (headless Chrome for Remotion)

```bash
apt-get update   # REQUIRED FIRST — stale lists cause "Unable to locate package"
apt-get install -y --no-install-recommends \
  libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libasound2 \
  libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 libdrm2 libgbm1 \
  libglib2.0-0 libnspr4 libnss3 libxcb1 libxkbcommon0 \
  libcairo2 libpango-1.0-0 libpangocairo-1.0-0 fonts-dejavu-core
npx remotion browser ensure
ldd node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell | grep "not found"   # must be empty
```

### 3.3 Optional / situational

- `opencv-python` — silhouette IoU, contour extraction, optical-flow foot-slip checks.
- `scipy.optimize` — parameter fitting against a reference oracle (§12).
- `potrace`/`autotrace` — **rejected**: B/W only, no palette control. Do not add.
- Lottie/Rive/DragonBones/Synfig/OpenToonz — **rejected**: require authored documents from
  external DCCs; not code-native. Do not add.
- EbSynth, DiffVG/LIVE — **rejected**: not vector/not open source, or GPU-training cost
  disproportionate to short clips.

### 3.4 Environment constraints to design around

- Small workers (observed: **~1 GB RAM, 2 cores**). Remotion's built-in multi-threaded
  ffmpeg stitch gets **OOM-killed**. Always: render `--sequence --concurrency=1`, then
  stitch with static ffmpeg `-threads 1`.
- PNG sequences cost 13–32 MB per 94-frame 1080p composition. Delete after stitch
  (`KEEP_FRAMES=1` to retain for gates that need pixels — gates run *before* cleanup).
- Snapshot/disk caps are real. Keep workspace under ~100 MB of persisted artifacts;
  intermediates are regenerable and must not be committed.

---

## 4. Artifact & directory contract

```
project/
  style/
    bible.json            # tokens, versioned. SINGLE SOURCE OF TRUTH
    bible.md              # human-readable rationale + reference sheet
    golden/               # approved reference frames per module/rig
  ir/
    episode.json          # shot list IR (see §6)
    beatmap.json          # word-level alignment → frames
  rigs/
    <rig>/rig.json        # skeleton, shapes, attachment points, tone bands
    <rig>/preview.png
  modules/
    <module>/module.tsx   # parameterized animation module
    <module>/schema.json  # allowed params + ranges
    <module>/golden.png
  src/                    # renderer compositions
  public/                 # audio, reference frames, traced cels (if any)
  out/
    animatic/             # low-res approval renders
    final/                # shipped mp4
    frames/               # transient, deleted after gates+stitch
  gates/
    <shot>/geometry.json
    <shot>/motion.json
    <shot>/semantic.json
    <shot>/defects.json
    <shot>/verdict.json   # PASS | REPAIR | BLOCKED | ESCALATE
  scripts/                # the python utilities in §13
  ledger/
    defects.jsonl         # every defect ever found, with fix + rule added
    costs.jsonl           # render seconds, iterations, human touches
```

**Rule:** every stage writes an artifact to disk and is independently re-runnable. No stage
may depend on in-memory state from a previous agent turn.

---

## 5. Stage 0 — Style bible (lock before anything else)

Schema (fields, not code — implement as JSON):

- `version`, `name`, `fps` (24 or 30; pick one and never mix), `resolution`, `aspect_variants`
- `palette`: ≤12 entries, each `{token, hex, role}`. Roles: bg, ink/outline, body, body_lt,
  body_dk, accent, accent_dk, prop, prop_lt, prop_dk, shadow, highlight.
- `materials`: per material `{base_token, shadow_token, highlight_token, band_count: 2|3}`
- `line`: `{outline_px, join: round, cap: round, min_gap_px}`
- `proportions`: in **head-units** (e.g. total height 6.5 heads, limb taper ratio 0.72,
  joint radius factors). Never absolute pixels for character proportions.
- `light`: `{azimuth_deg, elevation_deg}` — one global light direction; all tone bands derive from it.
- `shadow`: ground ellipse rules `{rx_range, ry_range, opacity_range, contact_rule}`
- `easing`: named vocabulary only — `settle`, `snap`, `drift`, `anticipate`, `overshoot`.
  Each maps to one approved curve. **Linear is banned for organic motion.**
- `camera`: allowed moves + max speed (px/s) + safe areas
- `text`: font stack (must exist in the render image), size scale, caption style, safe margins
- `motion_rules`: `{stance_lock: true, secondary_lag_frames: 2..4, loop_seam_max_delta}`

Reference values proven to work (from the analyzed source clip — reuse as a starting point):
body `#686D75`, far-side limbs `#4E5561`, outline `#30303A`, cream cloth `#F3E9D3`,
cloth shade `#E3D9C6`, prop `#C6BAB0`, prop light `#D9CEC4`, prop dark `#36374C`,
eye `#272A3E`, ground shadow `#DCDBDE`, bg `#FFFFFF`.

**Gate 0 (style lint):** every downstream file references tokens; palette purity of rendered
frames must be ≥99.5% of non-antialiased pixels within ΔE 2 of a token color.

---

## 6. Stage 1 — Storyboard → Shot IR (never storyboard → pixels)

Compile prose/boards into a typed shot list. Required fields per shot:

`id`, `episode_id`, `intent` (one sentence, testable), `beat` (hook|setup|payoff|transition|outro),
`start_frame`, `end_frame`, `module_id`, `params` (validated against module schema),
`rigs[]` with `{rig_id, position, facing, scale}`, `props[]`, `camera`, `text_track[]`,
`vo_segment` (word indices), `sfx_events[]`, `aspect_layout` (16:9 and 9:16 placements),
`seed` (derived from id), `notes`.

### 6.1 Closed action vocabulary (extend only by authoring + golden-testing a module)

| Verb | Module | Key params | Notes |
|---|---|---|---|
| `enter` / `exit` | char_move | direction, distance, easing | must respect safe area |
| `walk` / `run` | gait_cycle | speed, stride_frames, bounce_px | stance lock mandatory |
| `idle` | idle_breathe | amplitude, period | never fully static |
| `point` / `reach` / `pickup` | arm_ik | target, hold_frames | IK, not keyed rotation |
| `look_at` | head_aim | target, lag_frames | head lags torso |
| `react` | react_pose | kind (surprise/nod/shrug), intensity | from approved pose set |
| `reveal` / `mask_wipe` | reveal | direction, duration | diagram workhorse |
| `draw_line` / `trace_path` | stroke_grow | path, speed | line-draw explainer |
| `chart_grow` | chart | data, kind, stagger | data must be sourced |
| `count_up` | number_roll | from, to, format | ties to VO word timing |
| `label_pop` / `caption` | type_kinetic | text, anchor, emphasis | word-synced |
| `compare` / `split` | layout_compare | items, divider | aspect-agnostic |
| `camera_push` / `pan` | camera | target, speed | ≤ bible max speed |
| `transition` | transition | kind (cut/wipe/push/match), frames | ≤8 kinds total |

**Validation:** unknown verb → `BLOCKED` with a request to author a module. Never improvise
a verb inline. Never let a module accept a free-form color or duration.

### 6.2 Pacing rules

- Average shot length: hook 0.8–1.5 s, body 2–4 s, payoff 1.5–3 s.
- No shot >6 s without an internal event (camera move, label pop, prop change).
- Every cut lands on a beat-map boundary (§7), quantized to whole frames.
- Transitions consume frames from the *outgoing* shot's tail, never added on top.

---

## 7. Stage 2 — Audio-first timing

1. Produce VO from the locked script with the channel's single voice.
2. Force-align to **word-level** timestamps (whisperX / stable-ts). Cache by audio hash.
3. Build `beatmap.json`: words → `{start_frame, end_frame}`, sentence boundaries, emphasis
   candidates (nouns/numbers/contrast words), silence gaps >250 ms.
4. Derive shot boundaries from sentence/clause boundaries + the pacing rules. Snap to frames.
5. Emit `sfx_events` from animation events (foot contact, impact, transition start) — the
   animation drives SFX placement, not a human guessing offsets.

**Observed precedent:** in the reference clip, footfalls occurred every 13 frames
(≈0.54 s at 24 fps) and the original audio was carried over untouched, making sync exact by
construction. Generalize: keep audio and motion derived from one clock.

**Forbidden:** guessing durations from word counts; retiming VO to fit animation; time-stretching
VO more than ±3% to fix a timing problem (fix the shot instead).

---

## 8. Stage 3 — Rig contract (this is where quality is won)

Every rig must implement, in code, all of the following. These are the five fixes that
separate a 7.24-error puppet from a ~3-error one:

1. **Silhouette union, not stroked segments.** Build each depth layer (far limbs / body /
   near limbs) as tapered closed shapes, union them, then stroke the *union outline once*.
   Per-segment outlines create seams and the "stick figure" read. Taper ratio from bible.
2. **Measured, error-bounded motion tracks.** If a reference exists: extract per-frame
   contours, fit skeleton, then compress to spline keys with a **max deviation ≤2 px** at
   1080p. If no reference: use the module's vetted procedural gait, never eyeballed keys.
3. **Tone bands.** Base fill + 1–2 shadow shapes offset along the global light direction,
   plus optional rim highlight. Bands are functions of the same skeleton, so they move
   with the form. Flat single-fill parts are a defect, not a style.
4. **Secondary motion as simulation, not sine.** Short chain (5–8 nodes) with gravity, drag,
   and a follow constraint on the anchor; deterministic seed; clamp max node speed. Spring-lag
   for head/props off the hip track (2–4 frames). A single travelling sine is too regular and
   reads mechanical.
5. **Stance lock + IK.** During stance the contact point velocity must be ≈0 (gate: <0.5 px/frame).
   Solve limb IK from the locked foot, not from free-floating keys. Foot rolls about the
   contact point; feet are wedges oriented along ankle→toe.

Also required: draw order declaration; attachment points (hands, head top, back, hips) named
and stable; loop-seam continuity (first/last frame delta below bible threshold); no
interpenetration of near/far layers beyond tolerance.

**Gait math that works:** periodic hip/head bounce tracks (independent, Catmull-Rom over the
step period), leg track cyclic with left/right symmetry (far limb = near limb phase-shifted by
half a stride), arm swing blended between two measured extremes with a mid-swing downward
bulge term, ground shadow radius/opacity following |cos| of stride phase.

---

## 9. Stage 4 — Module library

- Each module: parameter schema with ranges, one golden frame, one golden 12-frame clip,
  and a documented failure list.
- Version modules semver-style. A param range change is a minor bump; a visual change is major
  and requires re-approving goldens.
- **Target composition of an episode: ~80% existing modules, ~20% new.** Track this ratio;
  if new-module share stays >40% after episode 5, the library is under-built — stop and build.
- Modules must be aspect-agnostic: layout expressed in relative anchors so 9:16 is a re-layout.

---

## 10. Stage 5 — Deterministic rendering

Compositions: one per deliverable variant (final 16:9, animatic, 9:16 cutdown, proof sheet).
All read the same IR + beatmap + tokens.

**Low-RAM render recipe (mandatory on small workers):**

```bash
npx remotion render <Comp> out/frames/<shot> --sequence --concurrency=1 --log=error
ffmpeg -v error -y -framerate <fps> -start_number 0 -i out/frames/<shot>/element-%02d.png \
  -i public/vo.m4a -c:v libx264 -pix_fmt yuv420p -threads 1 -crf 18 -preset medium \
  -c:a aac -b:a 128k -shortest out/final/<shot>.mp4
```

- Detect sequence filename/padding instead of assuming it.
- Shard **per shot**, never per episode. One shot's failure must not kill an episode.
- Cache key = hash(module_id + version + params + tokens_version + rig_versions + audio_slice_hash + seed).
  Unchanged shots are never re-rendered.
- Animatic path: 480p, no tone bands, no chain sim, `--concurrency=1`; ~10× faster. Approvals
  happen here.
- Observed throughput on 2 cores/1 GB: ~18 s per 94-frame 1080p cel composition; ~24 s for a
  4-panel proof composition; ~95 s to vectorize 94 frames at 1080p.
- **Text is never ffmpeg `drawtext`** (static build lacks it). Labels/captions are renderer text.

---

## 11. Stage 6 — THE GATES (the actual source of "perfectness")

Run all four gate families on every shot. Each writes JSON with measured values, thresholds,
and a defect list. Verdict = worst status across families.

### 11.1 Geometry gate

| Check | Threshold (1080p) | Notes |
|---|---|---|
| Reference mean abs channel error | ≤ **3.0** if reference exists | **Floor awareness:** flat-vs-shaded posterization floor measured at **2.71**. Do not chase 0 |
| Reference silhouette IoU | ≥ **0.97** | per sampled frame |
| % pixels Δ>40 vs reference | ≤ **1.0%** | reference build achieved 0.54% |
| Palette purity | ≥ **99.5%** within ΔE 2 of tokens | catches rogue colors/gradients |
| Outline weight consistency | σ ≤ 0.5 px | catches mixed stroke widths |
| Proportion check | within ±3% of head-unit spec | catches drift across episodes |
| Joint seam artifacts | 0 detected | union-outline rule |
| Safe area / overflow | 0 violations | text and limbs |

Sample every 6th frame minimum; **always include the frames at loop boundaries and the
worst-drift region** (the reference build's error peaked around frame 73 of 94 — uniform
sampling alone hid it).

### 11.2 Motion gate

| Check | Threshold | Why |
|---|---|---|
| Foot slip during stance | < **0.5 px/frame** | strongest "puppet on strings" tell |
| Limb length variance | < **1.5%** across cycle | rubber limbs |
| Interpenetration | 0 beyond 2 px | layering errors |
| Per-frame silhouette delta spikes | no frame > **3× median** | pops/jumps |
| Loop seam delta (first vs last) | ≤ bible `loop_seam_max_delta` | seamless loops |
| Easing sanity | 0 linear organic moves | robotic motion |
| Secondary motion present | lag 2–4 frames, non-zero | stiffness |
| Camera speed | ≤ bible max | nausea/whip |
| Monotonic playback index | strictly non-decreasing | **see §11.5** |

### 11.3 Semantic gate (VLM)

Feed 3–5 sampled frames + the shot's `intent` sentence. Ask for strict JSON:
`{matches_intent: bool, facing_correct: bool, props_correct: bool, text_legible: bool, defects: [...], confidence: 0..1}`.
Threshold: `matches_intent && facing_correct && props_correct` true, confidence ≥0.7.
Low confidence → human review, not auto-pass. **Never let the VLM see its own render prompt** —
it will agree with itself.

### 11.4 AV / delivery gate

Loudness −14 LUFS ±1 (platform target), true peak ≤ −1 dBTP, no silence >1.5 s where VO expected,
no black frames, caption overflow 0, duration matches IR ±1 frame, fps/resolution exact,
audio present and aligned (offset <40 ms), first frame legible as a thumbnail at 320 px wide.

### 11.5 Defect taxonomy → repair mapping (deterministic, not vibes)

| Defect | Likely cause | Repair action |
|---|---|---|
| High error late in clip, low early | loop assumption on non-exact period | **trace/author all frames** or re-measure true period; do NOT remap to nearest cel |
| Popping between frames | non-monotonic asset index | force monotonic playback; reject nearest-match remaps |
| Stick-figure read | stroked segments, no union | rebuild layer as union + single outline |
| Flat/cardboard look | missing tone bands | add shadow shapes from light direction |
| Mechanical cloth | single sine | replace with seeded chain sim |
| Sliding feet | no stance lock | enable IK stance constraint |
| Robotic limbs | linear easing / too few keys | approved easing + error-bounded key fit |
| Rogue colors | hardcoded hex | token lint + palette purity re-run |
| Text missing in output | ffmpeg drawtext reliance | move text into renderer |
| Render killed | multi-thread stitch on low RAM | sequence + `-threads 1` |
| Wrong prop/facing | IR or module param error | fix IR, not pixels |

**Iteration policy:** max 3 repair passes/shot. Each pass must change a *named parameter or
module version* and re-run the failing gate only. After 3 → `ESCALATE` with: failing metrics,
diff of what was tried, and a proposed scope reduction.

---

## 12. Reference-oracle fitting (how to reach source-level quality with pure code)

When a reference clip exists, do **not** hand-tune the puppet. Use the trace as an instrument:

1. Extract all frames at full resolution; also half-res for fast scoring.
2. Detect true period by mean-absolute-difference of downsampled grayscale across candidate
   shifts (the reference build found 13-frame step / 26-frame stride this way).
3. Posterize to the locked palette (gentle 5-tap cross blur → nearest-token quantize →
   despeckle **only fully isolated pixels**; aggressive despeckle erases eyes/smile), then
   vectorize with a **locked palette**, spline mode, stacked hierarchy, speckle filter ~7,
   corner threshold ~75. Result: clean flat cels, ~55–77 KB and 130–170 paths per 1080p frame.
4. Treat those cels as **ground truth**. Fit the code-only rig's parameters (shape constants,
   taper, tone-band offsets, gait keys, sim coefficients) by minimizing
   `w1·(1−IoU) + w2·tone_error + w3·motion_penalty`. Coordinate descent or CMA-ES over
   ~50–100 parameters; 200–600 evaluations is usually enough; score on every 6th frame.
5. Report the residual honestly. Expect to land near the posterization floor (~3), not 0.
6. **Keep both artifacts:** the traced cels (oracle/verification) and the fitted rig
   (production, editable). The oracle is not the deliverable.

---

## 13. Reference implementations (Python — adapt, then validate on a known-good shot)

> These are starting points for the implementing agent. Each must be run against a golden
> shot and its output sanity-checked before being trusted as a gate.

### 13.1 `scripts/score_frames.py` — geometry gate

```python
#!/usr/bin/env python3
"""Geometry gate: mean |delta|, %>40, silhouette IoU, palette purity.
Usage: score_frames.py REF_DIR RENDER_DIR PALETTE_JSON [--stride 6] [--extra 73,94]
Frames must be matched by index; renders are resized to reference size.
"""
import sys, json, glob, os
import numpy as np
from PIL import Image

def load(p, size=None):
    im = Image.open(p).convert("RGB")
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im).astype(np.int16)

def palette_purity(a, tokens):
    tok = np.array(tokens, dtype=np.int16)          # N x 3
    flat = a.reshape(-1, 3)
    d = np.abs(flat[:, None, :] - tok[None, :, :]).sum(axis=2).min(axis=1)
    return float((d <= 6).mean())                   # ~DeltaE2 proxy in RGB L1

def silhouette(a, bg=(255, 255, 255), tol=12):
    return (np.abs(a - np.array(bg)).sum(axis=2) > tol)

def main():
    ref_dir, ren_dir, pal = sys.argv[1:4]
    stride = 6
    extra = set()
    if "--stride" in sys.argv: stride = int(sys.argv[sys.argv.index("--stride") + 1])
    if "--extra" in sys.argv:
        extra = {int(x) for x in sys.argv[sys.argv.index("--extra") + 1].split(",")}
    tokens = [tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
              for h in json.load(open(pal))["palette_hex"]]
    refs = sorted(glob.glob(os.path.join(ref_dir, "*.png")))
    rens = sorted(glob.glob(os.path.join(ren_dir, "*.png")))
    assert len(refs) == len(rens), f"frame count mismatch {len(refs)} vs {len(rens)}"
    idxs = sorted({i for i in range(len(refs)) if i % stride == 0} |
                  {i - 1 for i in extra if 1 <= i <= len(refs)} | {0, len(refs) - 1})
    per, defects = [], []
    for i in idxs:
        r = load(refs[i]); q = load(rens[i], (r.shape[1], r.shape[0]))
        d = np.abs(q - r)
        mad = float(d.mean()); big = float((d > 40).mean())
        sr, sq = silhouette(r), silhouette(q)
        iou = float((sr & sq).sum() / max(1, (sr | sq).sum()))
        pur = palette_purity(q, tokens)
        per.append(dict(frame=i + 1, mad=round(mad, 3), pct_gt40=round(100 * big, 3),
                        iou=round(iou, 4), purity=round(pur, 5)))
        if mad > 3.0: defects.append({"frame": i + 1, "code": "GEO_MAD", "value": mad, "limit": 3.0})
        if iou < 0.97: defects.append({"frame": i + 1, "code": "GEO_IOU", "value": iou, "limit": 0.97})
        if pur < 0.995: defects.append({"frame": i + 1, "code": "GEO_PALETTE", "value": pur, "limit": 0.995})
    out = {"sampled": per,
           "mean": {k: round(float(np.mean([p[k] for p in per])), 4)
                    for k in ("mad", "pct_gt40", "iou", "purity")},
           "defects": defects, "status": "PASS" if not defects else "REPAIR"}
    print(json.dumps(out, indent=1))

if __name__ == "__main__":
    main()
```

### 13.2 `scripts/motion_lint.py` — motion gate

```python
#!/usr/bin/env python3
"""Motion gate on a rendered PNG sequence: pops, loop seam, palette drift,
and (optionally) foot-slip via lowest-silhouette-point tracking during stance.
Usage: motion_lint.py FRAMES_DIR [--stance 0-6,13-19] [--fps 24]
"""
import sys, glob, json
import numpy as np
from PIL import Image

def masks(d):
    for p in sorted(glob.glob(d + "/*.png")):
        a = np.asarray(Image.open(p).convert("RGB")).astype(np.int16)
        yield p, a, (np.abs(a - 255).sum(axis=2) > 36)

def main():
    d = sys.argv[1]
    stance = []
    if "--stance" in sys.argv:
        for chunk in sys.argv[sys.argv.index("--stance") + 1].split(","):
            a, b = chunk.split("-"); stance += list(range(int(a), int(b) + 1))
    frames = list(masks(d))
    sig = [m.sum() for _, _, m in frames]
    deltas = [float(np.abs(frames[i][2].astype(np.int16) - frames[i-1][2]).sum())
              for i in range(1, len(frames))]
    med = float(np.median(deltas)) or 1.0
    pops = [{"frame": i + 2, "ratio": round(v / med, 2)} for i, v in enumerate(deltas) if v > 3 * med]
    seam = float(np.abs(frames[0][2].astype(np.int16) - frames[-1][2]).sum()) / max(1, sig[0])
    # crude contact-point tracker: lowest non-bg pixel centroid x per frame
    contact = []
    for _, _, m in frames:
        ys, xs = np.nonzero(m)
        if len(ys) == 0: contact.append(None); continue
        low = ys > (ys.max() - 6)
        contact.append(float(xs[low].mean()))
    slip = []
    for i in stance:
        if 0 < i < len(contact) and contact[i] is not None and contact[i-1] is not None:
            v = abs(contact[i] - contact[i-1])
            if v > 0.5: slip.append({"frame": i + 1, "px_per_frame": round(v, 2)})
    defects = ([{"code": "MOT_POP", **p} for p in pops] +
               [{"code": "MOT_SLIP", **s} for s in slip] +
               ([{"code": "MOT_SEAM", "value": round(seam, 4)}] if seam > 0.02 else []))
    print(json.dumps({"frames": len(frames), "median_delta": med,
                      "loop_seam_rel": round(seam, 4), "pops": pops, "slip": slip,
                      "defects": defects, "status": "PASS" if not defects else "REPAIR"}, indent=1))

if __name__ == "__main__":
    main()
```

> Replace the crude contact tracker with contour/flow-based tracking (opencv) once the
> pipeline is stable; treat its output as advisory until validated against a golden clip.

### 13.3 `scripts/beatmap.py` — audio → frames

```python
#!/usr/bin/env python3
"""Word timestamps -> frame-accurate beat map. Input: whisperX/stable-ts JSON.
Usage: beatmap.py WORDS_JSON FPS OUT_JSON
"""
import sys, json, math

def main():
    words = json.load(open(sys.argv[1]))
    fps = float(sys.argv[2]); out = sys.argv[3]
    segs = words.get("word_segments") or [w for s in words["segments"] for w in s["words"]]
    items, sentences, cur = [], [], []
    for w in segs:
        if "start" not in w or "end" not in w: continue
        s, e = math.floor(w["start"] * fps), math.ceil(w["end"] * fps)
        items.append({"word": w["word"].strip(), "start_frame": s, "end_frame": e})
        cur.append(len(items) - 1)
        if w["word"].strip().endswith((".", "?", "!")):
            sentences.append({"words": cur, "start_frame": items[cur[0]]["start_frame"],
                              "end_frame": items[cur[-1]]["end_frame"]}); cur = []
    if cur:
        sentences.append({"words": cur, "start_frame": items[cur[0]]["start_frame"],
                          "end_frame": items[cur[-1]]["end_frame"]})
    gaps = [{"after_word": i, "gap_frames": items[i+1]["start_frame"] - items[i]["end_frame"]}
            for i in range(len(items) - 1)
            if items[i+1]["start_frame"] - items[i]["end_frame"] > fps * 0.25]
    json.dump({"fps": fps, "words": items, "sentences": sentences, "gaps": gaps},
              open(out, "w"), indent=1)
    print(f"{len(items)} words, {len(sentences)} sentences, {len(gaps)} gaps -> {out}")

if __name__ == "__main__":
    main()
```

### 13.4 `scripts/fit_params.py` — oracle fitting skeleton

```python
#!/usr/bin/env python3
"""Fit rig parameters against traced-cel oracle. The agent supplies render_fn:
render_fn(params) -> list of PNG paths for the sampled frames.
Objective: w1*(1-IoU) + w2*tone_error + w3*motion_penalty. Coordinate descent.
"""
import json, numpy as np
from PIL import Image

def load(p, size=None):
    im = Image.open(p).convert("RGB")
    if size and im.size != size: im = im.resize(size, Image.LANCZOS)
    return np.asarray(im).astype(np.int16)

def score(ref_paths, ren_paths):
    ious, mads = [], []
    for r, q in zip(ref_paths, ren_paths):
        a = load(r); b = load(q, (a.shape[1], a.shape[0]))
        ma = np.abs(a - 255).sum(2) > 36; mb = np.abs(b - 255).sum(2) > 36
        ious.append((ma & mb).sum() / max(1, (ma | mb).sum()))
        mads.append(np.abs(a - b).mean() / 255.0)
    return 0.6 * (1 - float(np.mean(ious))) + 0.4 * float(np.mean(mads))

def fit(p0, bounds, steps, render_fn, refs, budget=400):
    p = dict(p0); best = score(refs, render_fn(p)); calls = 1
    history = [{"iter": 0, "loss": best}]
    for it in range(1, 13):
        improved = False
        for k in p:
            for sgn in (+1, -1):
                if calls >= budget: return p, best, history
                trial = dict(p)
                trial[k] = float(np.clip(p[k] + sgn * steps[k] * (0.6 ** it), *bounds[k]))
                if trial[k] == p[k]: continue
                l = score(refs, render_fn(trial)); calls += 1
                if l < best - 1e-5:
                    p, best, improved = trial, l, True
                    history.append({"iter": it, "param": k, "loss": best, "calls": calls})
                    break
        if not improved and it > 3: break
    return p, best, history

if __name__ == "__main__":
    print("Import fit() and supply render_fn + oracle frame paths. See SKILL §12.")
```

### 13.5 `scripts/qc_av.py` — delivery gate

```python
#!/usr/bin/env python3
"""Loudness/peak/silence/black-frame/duration checks via ffmpeg.
Usage: qc_av.py FILE MP4 FPS EXPECTED_SECONDS
"""
import subprocess, sys, json, re

def run(args):
    return subprocess.run(args, capture_output=True, text=True).stderr

def main():
    f, fps, exp = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    log = run(["ffmpeg", "-hide_banner", "-nostats", "-i", f,
               "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"])
    m = re.search(r"\{[^{}]*\"input_i\"[\s\S]*?\}", log)
    loud = json.loads(m.group(0)) if m else {}
    black = run(["ffmpeg", "-hide_banner", "-i", f, "-vf", "blackdetect=d=0.08:pix_th=0.10",
                 "-an", "-f", "null", "-"])
    sil = run(["ffmpeg", "-hide_banner", "-i", f, "-af", "silencedetect=n=-45dB:d=1.5",
               "-vn", "-f", "null", "-"])
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                            "format=duration:stream=codec_type,width,height,r_frame_rate",
                            "-of", "json", f], capture_output=True, text=True).stdout
    meta = json.loads(probe or "{}")
    dur = float(meta.get("format", {}).get("duration", 0))
    defects = []
    if loud and abs(float(loud["input_i"]) + 14) > 1: defects.append({"code": "AV_LOUDNESS", "value": loud["input_i"]})
    if loud and float(loud["input_tp"]) > -1: defects.append({"code": "AV_PEAK", "value": loud["input_tp"]})
    if "black_start" in black: defects.append({"code": "AV_BLACK"})
    if "silence_start" in sil: defects.append({"code": "AV_SILENCE"})
    if abs(dur - exp) > 1.0 / fps + 0.05: defects.append({"code": "AV_DURATION", "value": dur, "expected": exp})
    print(json.dumps({"loudness": loud, "duration": dur, "meta": meta,
                      "defects": defects, "status": "PASS" if not defects else "REPAIR"}, indent=1))

if __name__ == "__main__":
    main()
```

### 13.6 `scripts/cache_key.py` — shot cache identity

```python
#!/usr/bin/env python3
"""Stable cache key for a shot. Re-render only when this changes."""
import hashlib, json, sys

def key(shot, tokens_version, rig_versions, module_version, audio_slice_sha):
    payload = {"m": shot["module_id"], "mv": module_version, "p": shot["params"],
               "t": tokens_version, "r": rig_versions, "a": audio_slice_sha,
               "s": shot["seed"], "f": [shot["start_frame"], shot["end_frame"]],
               "lay": shot.get("aspect_layout")}
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()[:20]

if __name__ == "__main__":
    print(key(json.load(open(sys.argv[1])), sys.argv[2], json.loads(sys.argv[3]),
              sys.argv[4], sys.argv[5]))
```

---

## 14. Agent runbook (execute in order, do not skip)

1. Load style bible; verify version + token lint. If absent → **stop and build it with the human**.
2. Compile storyboard → IR; validate every verb/param against schemas. Report unknowns.
3. Obtain VO; align; build beatmap; derive shot boundaries; write IR frames.
4. Render **animatic** (low-res). **Human checkpoint: approve timing + staging.** Do not proceed without it.
5. Resolve rigs/modules; build cache keys; render only changed shots at final resolution.
6. Run all four gate families per shot; write JSON; compute verdicts.
7. Repair loop (≤3 passes) using the defect→repair table. Re-run failing gates only.
8. Assemble episode; run AV gate on the assembled file; produce a proof sheet (source/reference
   vs output vs overlay) if a reference exists.
9. Write handoff (§17). Delete transient frame sequences. Log costs and defects.
10. Promote any new defect pattern into a permanent lint rule + golden test.

**Budgets:** per shot ≤3 render passes; per episode ≤15% of shots escalated; if exceeded,
stop and report rather than burning compute.

---

## 15. Forbidden behaviors & required fallbacks

**Never:**
- Ship generative-model pixels as final frames.
- Skip a gate, mark `PASS` without a measurement, or average away a failing frame.
- Hardcode hex/durations/easings outside the bible.
- Hand-key motion when a measurable reference exists.
- Use nearest-asset remapping to "fix" phase drift (creates non-monotonic pops — measured:
  only 12% error improvement and visible jumping).
- Assume a loop period without measuring it; the reference clip's stride was *almost* but
  not exactly 26 frames.
- Rely on ffmpeg `drawtext`, fonts not installed in the render image, or multi-threaded
  stitching on small workers.
- Silently substitute a simpler animation without recording the substitution.
- Continue past the repair budget hoping it converges.

**Required fallbacks when out of scope:** stage the action off-screen and show its consequence;
substitute a diagram/icon for an organic action; cut to a typographic beat; use a prop instead
of a performance; reduce to a held pose with camera motion. Record the fallback in the IR and
the handoff.

---

## 16. Learning loop (the compounding asset)

For every defect found: append to `ledger/defects.jsonl` with
`{shot, code, measured, limit, root_cause, fix, param_changed, rule_added, golden_added}`.
Then (a) add or tighten an automated check, (b) add a golden frame that would have caught it,
(c) note it in the module's failure list. Review the ledger weekly; the top 3 recurring codes
become the next sprint's lint work. **The system's value is the accumulated checks, not the prompts.**

---

## 17. Definition of done / handoff format

A shot is DONE when: geometry + motion + semantic + AV gates all `PASS` with attached JSON,
animatic approved, cache key recorded, and no unresolved defect. An episode is DONE when all
shots are DONE or explicitly escalated-and-accepted by a human, the assembled file passes the
AV gate, and the handoff contains:

- deliverable paths + durations/resolutions/fps
- gate summary table (worst value per family, thresholds used)
- reference comparison numbers if applicable, **with the error floor stated**
- list of fallbacks/substitutions and why
- escalations with evidence
- cost: render seconds, iterations, human touches
- what to change to iterate (named parameters, not "make it nicer")

---

## 18. Quick reference card

- Measure → author → render → **score** → repair. Never author → ship.
- Union silhouettes, tone bands, IK stance lock, seeded chain sim, error-bounded keys.
- Audio is the clock. Frames are integers. Tokens are law.
- Know your floor (flat-vs-shaded ≈2.7/255). Chase 3, not 0.
- Sample gates at loop seams and worst-drift regions, not just uniformly.
- 3 repairs then escalate. Every defect becomes a rule.
- Small worker: `--sequence --concurrency=1` + `ffmpeg -threads 1`. Text in renderer, never drawtext.