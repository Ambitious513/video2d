# YOUTUBE LAUNCH ENGINE
### A deterministic, instrumented 2D content factory for a faceless channel

**Version 1.0 · companion to `SKILL.md` (storyboard-to-2d-animation)**

> **Thesis.** Animation quality is not the bottleneck. **Script, pacing, and cost per finished
> minute are.** A reference character run cycle took a full working session to reach 2.71/255
> error against its source; a diagram-driven explainer shot takes minutes and viewers do not
> punish it. Therefore: optimize the *factory*, not the puppet. Buy quality where retention is
> won (first 30 seconds, pacing, clarity) and industrialize everything else.
>
> **Second thesis.** The moat is not the renderer or the prompts. It is (a) a reusable module
> library, (b) an accumulating gate/lint suite, and (c) retention data mapped back to shot IDs.
> All three compound. None of them are visible in a single video.

---

## 0. Targets that define success (calibrate, then hold the line)

| Metric | Launch target | Scale target | Why it matters |
|---|---|---|---|
| Cost per finished minute (all-in) | < $25 | < $8 | unit economics |
| Human touches per episode | ≤ 5 | ≤ 2 | automation depth |
| Shots passing gates first try | ≥ 70% | ≥ 92% | system maturity |
| New-module share per episode | ≤ 40% | ≤ 15% | library leverage |
| 30-second retention | ≥ 70% | ≥ 80% | hook quality |
| Average view duration | ≥ 40% | ≥ 55% | pacing quality |
| CTR (impressions→views) | ≥ 4% | ≥ 7% | packaging |
| Episodes/week | 2 | 5–7 | throughput |
| Time from script-lock to publish | ≤ 48 h | ≤ 8 h | cycle time |

If cost per finished minute is not falling week over week, **stop scaling and fix the library**.

---

## 1. Channel strategy (decide before building anything)

### 1.1 Niche selection criteria — score candidates 1–5 on each, pick the highest total

1. **Visual explainability** — can the core value be shown with diagrams, charts, icons, and
   simple props? (If it needs human faces, emotion, or physical demonstration → reject.)
2. **Evergreen depth** — ≥200 topics that will still be searched in 2 years.
3. **Search + suggested demand** — proven demand, not invented demand.
4. **Tolerance for narration-only** — the audience accepts voiceover + visuals (educational,
   analytical, documentary-explainer, finance/tech/science/history/process).
5. **Monetization ceiling** — RPM potential and affiliate/sponsor adjacency.
6. **Source availability** — public data, papers, docs you can cite and visualize.
7. **Low factual liability** — avoid medical/legal/financial advice framing.
8. **Weak incumbents** — competitors with poor visuals or slow cadence.

### 1.2 Format lock

- Length: 6–10 min long-form (≈900–1500 VO words at ~150 wpm), plus 2–3 Shorts cutdowns/episode.
- Cadence: 2/week at launch, same days/times.
- Structure: **hook (0–8 s) → stakes (8–25 s) → promise/roadmap (25–40 s) → 3–5 payoff blocks
  → synthesis → CTA/outro (<15 s)**.
- One recurring segmented identity (e.g. "the 3 numbers", "the teardown") so modules repeat.

### 1.3 Visual style decision (the expensive choice — make it deliberately)

**Choose: flat editorial motion graphics + a rigid-part mascot for continuity.**

- ~90% of screen time: diagrams, typography, icons, charts, maps, timelines, comparison layouts.
- ~10%: mascot in hook, outro, and reaction inserts. **Never let a hand-animated character
  carry every scene** — that is where cost and defect risk explode.
- Rationale from the reference build: code-recreatability scales with the share of the frame
  that is *rigid geometry* versus *organic texture*. Diagrams are nearly free to make perfect;
  cloth/hair/facial acting is expensive or impossible.
- One style bible, ≤12 colors, one outline weight, one light direction, one font stack. Locked
  and versioned per `SKILL.md` §5.

### 1.4 Competitor teardown (do 5 before episode 1)

For each: hook transcript (first 15 s), cut cadence (cuts/min), visual vocabulary inventory,
thumbnail pattern, title pattern, top 3 comments (what viewers wanted), and their weakest
moment. Output: a one-page "what we will do better" list that becomes module priorities.

---

## 2. System architecture

```
[topic pool] → A research/score → B script → C shot IR → D voice → E alignment/beatmap
      → F module selection → G render (cached, sharded) → H assembly
      → I QC gates → J packaging (title/thumb variants) → K publish
      → L analytics → priors fed back into A, C, F
```

**Design laws**

1. **Every stage writes an artifact to disk.** Nothing lives in an agent's memory.
2. **Every stage is idempotent and independently re-runnable.** Re-running with unchanged
   inputs must be a no-op (content-hash cache).
3. **Shard per shot, never per episode.** One failure must not kill a batch.
4. **Audio is the timeline master.** Visual timing derives from word-level alignment.
5. **One IR, many outputs.** 16:9, 9:16, animatic, proof sheet, thumbnail stills all compile
   from the same IR by re-layout — never re-authoring.
6. **Humans approve at the cheapest moment:** topic, script, animatic. Not final render.

### 2.1 Directory contract

```
channel/
  strategy/ niche.md format.md competitors/
  style/ bible.json bible.md golden/
  topics/ pool.jsonl scored/<date>.json
  episodes/<ep_id>/
    script.md script.lock.json
    ir.json beatmap.json vo.wav vo.m4a alignment.json
    shots/<shot_id>/{params.json,frames/,render.mp4,gates/}
    assembly/ timeline.json captions.srt music.bed sfx/
    final/ ep_16x9.mp4 ep_9x16_*.mp4 thumbnail_*.png
    packaging/ titles.json thumbs.json description.md chapters.json
    publish.json analytics/<date>.json retro.md
  library/ rigs/ modules/ transitions/ icons/ charts/
  ledger/ defects.jsonl costs.jsonl retention.jsonl experiments.jsonl
  scripts/ (see §16)
  ops/ runbooks/ licenses/ credentials.md (never commit secrets)
```

---

## 3. Toolchain, accounts, and licensing

### 3.1 Software

| Layer | Tool | License / cost note |
|---|---|---|
| Render | Remotion 4.0.240 + React 18 | **source-available, not OSI open source**; free for individuals/small companies, **paid company license** above the threshold — decide before scaling |
| Encode/probe | ffmpeg-static 5.3.0 / ffprobe-static 3.1.0 | GPL-3.0 binaries; **no `drawtext`** in static builds → all text in renderer |
| Pixels/vector | pngjs, sharp 0.35.5, @visioncortex/vtracer 1.0.0-alpha.4 | MIT / Apache-2.0 / MIT-OR-Apache. **Use the scoped vtracer package** |
| Analysis/gates | Python 3.11 + numpy, pillow, scipy, opencv-python | BSD |
| TTS | one provider, one voice (e.g. commercial TTS with explicit commercial + YouTube rights) | check: commercial use, redistribution, cloning consent, disclosure requirements |
| Alignment | whisperX or stable-ts (word timestamps) | BSD/MIT; torch CPU is fine for ≤10 min audio; cache by audio hash |
| Music/SFX | licensed library (subscription with YouTube clearance) | keep license receipts per track in `ops/licenses/` |
| Icons/illustration | permissive icon set (CC0/MIT) or self-authored | avoid scraped art |
| Queue/workers | any job queue + N small workers | see §11 for RAM constraints |
| Storage | object storage for artifacts + local cache | lifecycle-delete frame sequences |
| Analytics | YouTube Data + Analytics APIs | quota-aware polling |
| Thumbnails | renderer compositions (same tokens) | no external design tool dependency |

### 3.2 Accounts checklist

YouTube channel (brand account, verified, 2FA), analytics API project + OAuth, TTS account with
commercial rights, music license, storage, worker host, domain for a simple landing page,
sponsor/affiliate accounts (later). Store credentials outside the repo; never in snapshots.

---

## 4. Stage A — Research & topic scoring

**Inputs:** search suggestions, competitor top videos, community questions, public datasets,
news for trend slots. **Output:** `topics/pool.jsonl` entries with evidence links.

Scoring formula (tune weights after 10 episodes):

```
score = 0.30*demand + 0.20*visualizability + 0.15*evergreen
      + 0.15*gap(competitor weakness) + 0.10*source_quality
      + 0.10*monetization - 0.20*risk(liability|copyright|saturation)
```

Rules:
- Every claim-bearing topic needs ≥2 citable sources logged **before** scripting.
- Dedupe against published + pool by normalized title embedding/simhash.
- Mix: 70% evergreen, 20% seasonal/trend, 10% experiments.
- Kill topics whose core payoff cannot be shown in ≤3 diagram modules.

---

## 5. Stage B — Script (retention engineering, not prose)

### 5.1 Hard structure

- **Hook (0–8 s, ≤22 words):** state the surprising claim or the stakes. No greeting, no
  channel intro, no "in this video we will". First frame must be visually legible as a thumbnail.
- **Stakes (8–25 s):** why it matters to the viewer, concretely.
- **Promise (25–40 s):** what they'll be able to do/understand; plant one open loop.
- **Blocks (3–5):** each = claim → evidence → visual payoff → mini-conclusion. Close loops
  on a schedule; open a new one before closing the last.
- **Synthesis + CTA (<15 s):** one action, not three.

### 5.2 Writing rules

- ~150 wpm → 6 min ≈ 900 words, 10 min ≈ 1500 words. Write to a word budget.
- Sentences ≤ 22 words average; one idea per sentence (alignment and captions depend on it).
- Numbers spoken in words where pronunciation matters; maintain a lexicon for niche terms.
- Every factual sentence carries a source ID in `script.lock.json`.
- Ban: filler transitions, "as you can see", apologies, meta-commentary about the video,
  unsourced superlatives, and any medical/legal/financial advice framing.
- Read-aloud pass (TTS preview) before lock; fix anything the voice mispronounces.

### 5.3 Script lock

`script.lock.json` = frozen text + word budget + source map + hash. Downstream stages key off
this hash. Changing the script after lock invalidates alignment, IR frames, and shot caches —
allowed, but the cost is logged.

---

## 6. Stage C — Shot IR compilation

Follow `SKILL.md` §6 exactly: closed verb vocabulary, module schemas, token references only.

Pacing rules for this channel:
- Hook: 0.8–1.5 s shots. Body: 2–4 s. Payoff: 1.5–3 s. Never >6 s without an internal event.
- Cuts land on beatmap boundaries, quantized to whole frames.
- Transitions eat frames from the outgoing tail.
- Mascot budget: ≤10% of total frames, ≤2 appearances per block.
- Every episode must include ≥1 chart/diagram module with sourced data (value density).
- 9:16 layout declared per shot at compile time (not improvised later).

**Human checkpoint 1:** topic + script approved. **Checkpoint 2:** animatic approved (§11).

---

## 7. Stage D — Voice

- **One voice, forever.** Voice consistency is brand. Changing it resets audience familiarity.
- Render VO per sentence group for cheap re-takes; concatenate with identical settings.
- Keep a pronunciation lexicon; normalize numbers, units, acronyms before synthesis.
- Target pacing 145–165 wpm; emphasize by punctuation and sentence length, not effects.
- Post: high-pass ~80 Hz, gentle compression, de-ess, normalize to **−14 LUFS**, true peak
  ≤ **−1 dBTP**. No reverb.
- Store `vo.wav` (master) + `vo.m4a` (delivery) + `alignment.json`.
- **Disclosure:** where required by platform/policy or provider terms, disclose synthetic
  narration. Never clone a real person's voice without written consent.

---

## 8. Stage E — Alignment → beat map (audio is the clock)

1. Force-align VO to word timestamps (whisperX / stable-ts). Cache by audio SHA.
2. Build `beatmap.json`: word frames, sentence spans, emphasis candidates, silence gaps >250 ms.
3. Derive shot boundaries from clause boundaries + pacing rules; snap to integer frames.
4. Emphasis events drive `label_pop`, `count_up`, `camera_push` — visuals land **on the word**.
5. Animation events (foot contact, impact, transition) emit `sfx_events` back into assembly.

**Forbidden:** guessing durations from word counts; time-stretching VO >±3% to fix timing;
retiming audio to match a pretty animation. Fix the shot.

---

## 9. Stage F — Module selection & library economics

- Selection order: existing module (exact) → existing module (re-parameterized) → compose two
  modules → author new module (requires golden test + schema + human notice).
- Track **new-module share**; >40% after episode 5 means stop producing and build library.
- Library launch minimum: 1 style bible, 15–25 shot modules, 5–8 transitions, 20–40 icons/props,
  1 mascot rig with 6 poses, 3 chart types, 2 map/timeline layouts.
- Every module: schema with ranges, golden frame, golden 12-frame clip, failure list, version.
- Modules are aspect-agnostic (relative anchors), so Shorts are re-layout not re-author.

---

## 10. Stage G — Assembly

- **Captions:** burned-in, word-synced from the same alignment, styled from tokens, safe-area
  aware, max 2 lines, ≤7 words/line, no overlap with key visuals. Big mobile retention lever.
- **Music:** licensed bed, ducked −12 to −18 dB under VO, no music in the first 3 s if it
  competes with the hook, fade at block boundaries.
- **SFX:** placed from `sfx_events` (contacts, whooshes on transitions, ticks on count-ups).
  Subtle: −18 to −24 dB. Never comedic unless the format is comedic.
- **B-roll policy:** prefer self-rendered diagrams over stock. If stock is used, log license
  and keep <15% of screen time; never let stock carry the explanation.
- **Loudness:** final master −14 LUFS ±1, TP ≤ −1 dBTP.
- **Chapters:** from block boundaries; write into description.

---

## 11. Stage H — Render farm (constraints are features)

**Observed worker reality: ~1 GB RAM, 2 cores.** Remotion's multi-threaded ffmpeg stitch gets
OOM-killed. Mandatory recipe:

```bash
npx remotion render <Comp> out/frames/<shot> --sequence --concurrency=1 --log=error
ffmpeg -v error -y -framerate 24 -start_number 0 -i out/frames/<shot>/element-%02d.png \
  -i vo_slice.m4a -c:v libx264 -pix_fmt yuv420p -threads 1 -crf 18 -preset medium \
  -c:a aac -b:a 128k -shortest shots/<shot>/render.mp4
```

- Detect sequence padding; don't assume it. Delete sequences after gates + stitch
  (`KEEP_FRAMES=1` only while debugging).
- **Cache key** = hash(module+version, params, tokens version, rig versions, audio slice SHA,
  seed, frame range, layout). Unchanged shots never re-render. See `SKILL.md` §13.6.
- **Animatic path:** 480p, no tone bands, no chain sim → ~10× faster. All approvals happen here.
- Observed throughput: ~18 s per 94-frame 1080p composition; ~24 s for a 4-panel proof;
  ~95 s to vectorize 94 frames. Budget: a 8-min episode at 24 fps ≈ 11,520 frames ≈ 20–45 min
  of render on 2 cores with caching, far less on re-runs.
- Parallelism = number of workers × 1 (concurrency 1 each). Scale horizontally, not vertically.
- Headless Chrome needs system libs — `apt-get update` **first**, then the list in `SKILL.md` §3.2.

---

## 12. Stage I — QC before upload (all four gate families)

Run `SKILL.md` §11 gates per shot **and** on the assembled episode. Episode-level checklist:

- [ ] Loudness −14 LUFS ±1, TP ≤ −1 dBTP
- [ ] No black frames, no unintended silence >1.5 s
- [ ] Duration matches IR ±1 frame; fps/resolution exact
- [ ] Audio/video offset <40 ms
- [ ] Captions: 0 overflow, 0 safe-area violations, word-sync verified on 3 spot checks
- [ ] First frame legible at 320 px wide (thumbnail test)
- [ ] Palette purity ≥99.5% on sampled frames (brand consistency)
- [ ] Every factual claim has a source ID; sources listed in description
- [ ] Licenses logged for music/SFX/icons/voice
- [ ] 9:16 cutdowns render and pass their own layout gate
- [ ] No generative-model pixels in final frames
- [ ] Escalations resolved or explicitly accepted by a human

Anything unchecked = **do not upload**. A failed gate is cheaper than a bad public video.

---

## 13. Stage J — Packaging (where CTR is won)

- **Titles:** generate 8 variants across 4 patterns (number/list, curiosity gap, contrarian,
  outcome/how-to). ≤60 chars, front-load the concrete noun, no clickbait that the video
  doesn't pay off. Pick 2 for testing.
- **Thumbnails:** 3 variants, rendered from the same tokens (so they match the video's look).
  Rules: ≤3 words, one focal object, high contrast, legible at 320 px, face-free but
  emotion-carrying (arrow, split, before/after, big number). Test with the platform's
  experiment tool where available; otherwise rotate on a schedule and log.
- **Description:** 2-sentence value summary, chapters, sources, one CTA link.
- **Shorts:** 2–3 per episode, 25–45 s, compiled from the same IR by 9:16 re-layout; each must
  have its own hook (do not just crop the long-form intro).
- **Playlist + end screen** assigned at publish time, not later.

---

## 14. Stage K/L — Publish, then instrument the feedback loop

### 14.1 Publish

Fixed days/times; schedule ≥3 episodes ahead; first 48 h: monitor CTR and 30-s retention,
swap thumbnail/title once if CTR <3% with >1000 impressions (log the experiment).

### 14.2 The loop that actually compounds

1. Pull retention curve + traffic sources + impressions/CTR daily for 14 days per episode.
2. **Map drop-off timestamps → shot IDs** via the IR (trivial because timing is derived).
3. Label each drop with the module, beat type, and pacing context.
4. Update module priors: modules with repeated early drops get demoted or re-authored;
   modules with flat/positive retention get promoted into hooks.
5. Feed topic-level outcomes back into the scoring weights (§4).
6. Weekly retro: top 3 retention losses, top 3 gate failures, cost per minute trend, and
   exactly one experiment for next week.

**This is the moat.** An instrumented factory that knows which 2-second module loses people
beats a prettier renderer every time.

---

## 15. Ops: agents, humans, and SLAs

| Role | Owner | Output contract |
|---|---|---|
| Researcher | agent | scored topics + ≥2 sources each |
| Scriptwriter | agent | script.md + lock.json (word budget, source map) |
| IR compiler | agent | ir.json validated against schemas |
| Voice/alignment | agent | vo + alignment + beatmap |
| Module author | agent + human notice | module + schema + goldens |
| Render wrangler | agent | cached, sharded renders + cost log |
| QC inspector | agent (separate from author) | gate JSONs, verdicts, defect list |
| Packaging | agent | titles/thumbs/description/shorts |
| Editor-in-chief | **human** | approves topic, script, animatic, final |
| Analyst | agent + human weekly | retro.md + priors update |

**Rules:** the QC agent must never be the same context that authored the shot (it will agree
with itself). Humans approve at 4 points only. Every escalation carries measured evidence, not
opinions. Log human touches per episode — that number is your automation roadmap.

---

## 16. Scripts (Python — implement, then validate on a golden episode)

### 16.1 `scripts/topic_score.py`

```python
#!/usr/bin/env python3
"""Score topic candidates. Input JSONL with 0..1 feature fields; output ranked JSON."""
import json, sys

W = {"demand": .30, "visualizability": .20, "evergreen": .15,
     "gap": .15, "source_quality": .10, "monetization": .10}
RISK = .20

def score(t):
    s = sum(W[k] * float(t.get(k, 0)) for k in W)
    return round(s - RISK * float(t.get("risk", 0)), 4)

def main():
    rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
    for r in rows:
        r["score"] = score(r)
        r["blocked"] = (r.get("sources", 0) < 2) or (r.get("diagram_modules_needed", 99) > 3)
    rows.sort(key=lambda r: (r["blocked"], -r["score"]))
    json.dump(rows, open(sys.argv[2], "w"), indent=1)
    for r in rows[:10]:
        print(f'{r["score"]:.3f} {"BLOCK" if r["blocked"] else "ok   "} {r["title"][:70]}')

if __name__ == "__main__":
    main()
```

### 16.2 `scripts/retention_map.py` — drop-offs → shot IDs

```python
#!/usr/bin/env python3
"""Map a retention curve onto the shot IR to find which modules lose viewers.
Usage: retention_map.py IR_JSON RETENTION_JSON FPS OUT_JSON
RETENTION_JSON: [{"t": seconds, "ratio": 0..1}, ...] (relative audience retention)
"""
import json, sys

def main():
    ir = json.load(open(sys.argv[1])); curve = json.load(open(sys.argv[2]))
    fps = float(sys.argv[3]); out = sys.argv[4]
    shots = ir["shots"]
    def shot_at(sec):
        f = sec * fps
        for s in shots:
            if s["start_frame"] <= f < s["end_frame"]: return s
        return None
    drops, prev = [], None
    for p in sorted(curve, key=lambda x: x["t"]):
        if prev is not None:
            d = prev["ratio"] - p["ratio"]
            dt = max(1e-6, p["t"] - prev["t"])
            if d > 0.02:                      # >2 percentage-point loss between samples
                s = shot_at(p["t"])
                drops.append({"t": round(p["t"], 2), "loss": round(d, 4),
                              "loss_per_s": round(d / dt, 4),
                              "shot": s["id"] if s else None,
                              "module": s["module_id"] if s else None,
                              "beat": s.get("beat") if s else None})
        prev = p
    by_module = {}
    for d in drops:
        if d["module"]:
            m = by_module.setdefault(d["module"], {"events": 0, "loss": 0.0})
            m["events"] += 1; m["loss"] += d["loss"]
    ranked = sorted(by_module.items(), key=lambda kv: -kv[1]["loss"])
    json.dump({"drops": drops, "by_module": by_module, "worst": ranked[:5]},
              open(out, "w"), indent=1)
    print("worst modules:", [k for k, _ in ranked[:5]])

if __name__ == "__main__":
    main()
```

### 16.3 `scripts/episode_manifest.py` — cache-aware render plan

```python
#!/usr/bin/env python3
"""Emit the render plan: which shots must render, which are cache hits.
Usage: episode_manifest.py IR_JSON TOKENS_VER RIGVERS_JSON CACHE_JSON OUT_JSON
"""
import json, sys, hashlib

def key(shot, tokens_ver, rigvers, audio_sha):
    payload = {"m": shot["module_id"], "mv": shot.get("module_version", "1"),
               "p": shot["params"], "t": tokens_ver,
               "r": {r["rig_id"]: rigvers.get(r["rig_id"], "1") for r in shot.get("rigs", [])},
               "a": audio_sha, "s": shot["seed"],
               "f": [shot["start_frame"], shot["end_frame"]], "lay": shot.get("aspect_layout")}
    return hashlib.sha256(json.dumps(payload, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()[:20]

def main():
    ir = json.load(open(sys.argv[1])); tv = sys.argv[2]
    rv = json.loads(sys.argv[3]); cache = json.load(open(sys.argv[4]))
    plan = []
    for s in ir["shots"]:
        k = key(s, tv, rv, s.get("audio_sha", ir.get("vo_sha", "")))
        plan.append({"shot": s["id"], "key": k, "action": "hit" if cache.get(k) else "render",
                     "frames": s["end_frame"] - s["start_frame"]})
    todo = [p for p in plan if p["action"] == "render"]
    json.dump({"plan": plan, "render_count": len(todo),
               "frame_count": sum(p["frames"] for p in todo)}, open(sys.argv[5], "w"), indent=1)
    print(f'{len(todo)}/{len(plan)} shots to render, {sum(p["frames"] for p in todo)} frames')

if __name__ == "__main__":
    main()
```

### 16.4 `scripts/cost_report.py` — unit economics

```python
#!/usr/bin/env python3
"""Cost per finished minute from the cost ledger.
ledger line: {ep, stage, render_seconds, tts_chars, llm_usd, human_minutes, usd}
Usage: cost_report.py COSTS_JSONL EPISODES_JSON
EPISODES_JSON: {ep_id: {"finished_seconds": float}}
"""
import json, sys, collections

RATE = {"worker_usd_per_hour": 0.06, "human_usd_per_hour": 30.0}

def main():
    rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
    eps = json.load(open(sys.argv[2]))
    agg = collections.defaultdict(lambda: collections.defaultdict(float))
    for r in rows:
        e = r["ep"]; a = agg[e]
        a["render"] += r.get("render_seconds", 0) / 3600 * RATE["worker_usd_per_hour"]
        a["human"] += r.get("human_minutes", 0) / 60 * RATE["human_usd_per_hour"]
        a["other"] += r.get("usd", 0)
    out = {}
    for e, a in agg.items():
        total = sum(a.values()); mins = eps.get(e, {}).get("finished_seconds", 0) / 60
        out[e] = {"usd_total": round(total, 2), "usd_per_min": round(total / mins, 2) if mins else None,
                  "breakdown": {k: round(v, 2) for k, v in a.items()}}
        print(e, out[e])
    json.dump(out, open("ledger/cost_summary.json", "w"), indent=1)

if __name__ == "__main__":
    main()
```

### 16.5 `scripts/cutdown.py` — 9:16 re-layout plan (no re-authoring)

```python
#!/usr/bin/env python3
"""Choose a Shorts window from the IR and emit a 9:16 re-layout plan.
Usage: cutdown.py IR_JSON BEATMAP_JSON OUT_JSON [--seconds 35]
Picks the highest-value contiguous block (payoff beat) and re-anchors layouts.
"""
import json, sys

def main():
    ir = json.load(open(sys.argv[1])); bm = json.load(open(sys.argv[2]))
    fps = bm["fps"]; want = 35.0
    if "--seconds" in sys.argv: want = float(sys.argv[sys.argv.index("--seconds") + 1])
    shots = ir["shots"]; best, best_score = None, -1
    for i in range(len(shots)):
        window, dur = [], 0
        for s in shots[i:]:
            d = (s["end_frame"] - s["start_frame"]) / fps
            if dur + d > want: break
            window.append(s); dur += d
        if dur < want * 0.7: continue
        score = sum(2 if s.get("beat") == "payoff" else 1 for s in window) / max(1, len(window))
        if score > best_score: best, best_score, best_dur = window, score, dur
    assert best, "no suitable window; author a dedicated Shorts hook"
    plan = {"source_shots": [s["id"] for s in best], "duration_s": round(best_dur, 2),
            "aspect": "9:16",
            "relayout": [{"shot": s["id"], "layout": s.get("aspect_layout", {}).get("9:16"),
                          "needs_new_hook": idx == 0} for idx, s in enumerate(best)],
            "note": "Shorts must open with their own hook line; do not reuse long-form intro"}
    json.dump(plan, open(sys.argv[3], "w"), indent=1)
    print(json.dumps(plan, indent=1))

if __name__ == "__main__":
    main()
```

### 16.6 Also implement (specs, not optional)

- `align_vo.py` — wrap whisperX/stable-ts; cache by audio SHA; emit `alignment.json`.
- `beatmap.py`, `score_frames.py`, `motion_lint.py`, `qc_av.py`, `fit_params.py` — **reuse
  directly from `SKILL.md` §13.** Do not fork them; one implementation, one set of thresholds.
- `assemble.py` — build the timeline from IR + beatmap + sfx_events; burn captions; duck music;
  normalize loudness; write chapters.
- `publish.py` — upload with metadata, schedule, playlist, end screen; write `publish.json`.
- `pull_analytics.py` — quota-aware daily pull; write `analytics/<date>.json`.
- `ledger_append.py` — single writer for defects/costs/experiments (avoid concurrent corruption).

---

## 17. Cost model (worked example — replace with your real rates)

Assumptions: 8-min episode, 1200 VO words, 2 workers @ $0.06/h, human $30/h.

| Item | Launch | At scale |
|---|---|---|
| LLM (research/script/IR/QC) | $1.50 | $0.80 |
| TTS (1200 words ≈ 7k chars) | $0.70 | $0.40 |
| Alignment compute | $0.10 | $0.05 |
| Render (≈35 min wall, 2 workers) | $0.12 | $0.04 |
| Music/SFX license (amortized) | $0.50 | $0.20 |
| Human (launch 25 min → scale 6 min) | $12.50 | $3.00 |
| **Total / episode** | **≈$15.4** | **≈$4.5** |
| **Per finished minute** | **≈$1.93** | **≈$0.56** |

The dominant cost is **human attention**, not compute. Every gate you automate that removes a
human touch is worth more than any render optimization. Track it weekly.

---

## 18. Risk register (legal / policy / platform)

| Risk | Mitigation |
|---|---|
| **Remotion licensing** — source-available, company license above free tier | Decide at launch; budget the license or choose a permissive renderer before scaling |
| ffmpeg GPL binaries | Fine for rendering; if redistributing binaries, comply with GPL-3.0 |
| Music/SFX copyright claims | Licensed library only; keep receipts per track; never rip audio |
| Voice cloning rights | Only licensed/own voice; written consent for any clone; no celebrity voices |
| **Reused/inauthentic content policy** | Original script, original visuals, original commentary and analysis; no scraped slideshows or read-aloud articles |
| AI disclosure requirements | Disclose synthetic/altered content where the platform requires; keep a per-episode disclosure flag |
| Factual liability | ≥2 sources per claim; no medical/legal/financial advice framing; corrections policy pinned |
| Icon/illustration licensing | CC0/MIT or self-authored; log provenance |
| Trademark/brand visuals | Avoid logos except nominative commentary; keep usage minimal |
| Single-provider dependency (TTS/LLM) | Abstract behind an interface; keep a fallback provider and a voice-match test |
| Channel strike / demonetization | Never publish an unvalidated gate result; keep a human final check |

---

## 19. 30-day rollout (exit criteria, not vibes)

**Week 1 — prove the craft, by hand if needed.**
Lock niche + format + style bible. Build 10 modules + 1 mascot rig. Produce **one** pilot
end-to-end. Exit: pilot published, all gates measured (even if some pass only after human fix),
cost per minute recorded.

**Week 2 — instrument.**
Add gate scripts, cache keys, animatic approval step, cost/defect ledgers. Produce 2 episodes.
Exit: ≥60% shots pass first try; ≥1 defect promoted to a permanent lint rule; cache hits >30%
on re-runs.

**Week 3 — leverage.**
Grow library to 20–25 modules. Produce 3 episodes + 6 Shorts. Exit: new-module share <40%;
human touches ≤5/episode; 9:16 produced by re-layout only.

**Week 4 — economics and feedback.**
5 episodes. Wire analytics → retention_map → module priors. Run one packaging experiment.
Exit: cost/finished-minute falling vs week 1; a written retro naming the 3 worst modules and
the one experiment for next month; publish cadence stable at ≥3/week.

**Do not scale volume before week-4 exit criteria are met.** Scaling a broken process just
burns money faster.

---

## 20. Kill / pivot criteria

- After 15 episodes: 30-s retention <55% across the median episode → the **hook/format** is
  wrong, not the animation. Rebuild the first 30 seconds and the promise.
- CTR <2.5% with >20k impressions across 5 titles/thumbs → packaging or topic demand is wrong.
- Cost per finished minute flat or rising after week 4 → library/gates are not compounding;
  stop producing, build modules and checks for one week.
- New-module share still >40% at episode 10 → format is too varied; narrow the format.
- Any policy strike → halt publishing, audit the last 10 episodes for the same pattern.

---

## 21. What NOT to build (explicit exclusions)

- **Generative video for whole frames.** Inconsistent characters, no frame-accurate control,
  notes are unfixable, cost scales with retries. Reference exploration only.
- **A custom renderer.** Remotion (or equivalent) already solves bundling, timing, and rendering.
- **Per-frame perfection on organic characters.** The measured floor for flat-vs-shaded is
  ~2.7/255; the last 2% costs more than the first 98% and viewers cannot see it.
- **A mega-agent.** Narrow agents with hard output contracts + a human editor beat one giant
  context every time.
- **Hand-keyed animation when a reference exists.** Measure and fit; report residuals.
- **Ad-hoc colors/timings invented by a model.** Tokens and beatmap only.
- **Vertical-specific re-authoring.** One IR, many layouts.
- **Analytics-free publishing.** If you cannot map a drop-off to a shot ID, you are guessing.

---

## 22. The one-paragraph version

Pick a niche that can be explained with diagrams. Lock one flat-vector style and one voice.
Write scripts to a retention structure and a word budget, then let word-level audio alignment
drive every frame boundary. Compile storyboards into a typed shot list that may only use vetted,
parameterized modules from a growing library. Render deterministically, cached per shot, on
small workers with the sequence-plus-single-thread-stitch recipe. Gate every shot numerically
(geometry, motion, semantics, delivery) and repair against a defect→cause table, never by vibes.
Have humans approve topic, script, animatic, and final — four touches, shrinking over time.
Package titles and thumbnails from the same design tokens, publish on a fixed cadence, then map
retention drop-offs back to shot IDs and let that data rewrite your module priorities. Measure
cost per finished minute weekly; if it isn't falling, build library and checks instead of
episodes. The library, the gate suite, and the retention feedback loop are the business. The
videos are just its output.