#!/usr/bin/env node
/**
 * Test H — full-sequence fidelity scoring (ALL 94 frames, full resolution).
 *
 *   node tools/score-fidelity.js \
 *     --cel94 remotion/out/celframes \
 *     --celLoop remotion/out/celloopframes \
 *     --puppet remotion/out/puppetframes
 *
 * Compares rendered PNG sequences against fullres/f_001..f_094.png at
 * 1920x1080 — both sides at identical dimensions, NO resampling anywhere.
 * Rendered sequences are produced by render-lowram.mjs with KEEP_FRAMES=1.
 *
 * Metric definitions (contract §6):
 *  - mae: sum(|render_channel - source_channel|) over R,G,B of every pixel,
 *    divided by (width*height*3) per frame; sequence aggregate divides by
 *    (width*height*3*frames). Range 0..255, lower = closer.
 *  - pct_pixels_any_channel_gt_40: a pixel counts ONCE when
 *    max(|dR|,|dG|,|dB|) > 40; divided by total pixels * 100.
 *  - iou_foreground: silhouette IoU INCLUDING the ground shadow.
 *    Foreground mask: max(255-R, 255-G, 255-B) > 12 (i.e. any channel more
 *    than 12 below pure white). This captures the #DCDBDE shadow (deviation
 *    ~35-37) and all character colors; white background is excluded.
 *  - iou_character: silhouette IoU EXCLUDING shadow-classified pixels.
 *    A foreground pixel is shadow-classified when |R-220|<=14 && |G-219|<=14
 *    && |B-222|<=14 (neighborhood of the sampled shadow color #DCDBDE).
 *    Soft shadow gradients in the source mean some boundary pixels are
 *    ambiguous; this is a documented approximation, applied identically to
 *    both sides.
 *  - palette_exact_pct / palette_near_pct (cel variants only): fraction of
 *    rendered pixels exactly equal to one of the 11 locked palette colors,
 *    or within +/-2 per channel (anti-aliased boundary tolerance).
 *
 * Aggregates are weighted by evaluated channel/pixel counts; per-frame
 * min/median/p95/max and the worst 5 frames are always reported.
 *
 * Writes reports/fidelity-all-frames.json + reports/FIDELITY.md.
 * The historical fidelity.json (16 samples, every 6th frame, 960x540) is a
 * separate, clearly-labelled reference — never mixed with these numbers.
 */
const fs = require('fs');
const path = require('path');
const {PNG} = require('pngjs');
const {PALETTE} = require('./flatrace');

const ROOT = path.resolve(__dirname, '..');
const W = 1920, H = 1080, FRAMES = 94;

const args = process.argv.slice(2);
const variants = {};
for (let i = 0; i < args.length; i += 2) {
  if (args[i].startsWith('--')) variants[args[i].slice(2)] = args[i + 1];
}
if (!Object.keys(variants).length) {
  console.error('usage: node score-fidelity.js --cel94 <seqDir> [--celLoop <seqDir>] [--puppet <seqDir>]');
  process.exit(1);
}

const OBJECTIVES = {
  cel94: 'fidelity deliverable — exact per-frame traced cels',
  celLoop: 'comparison/control — 26-cel loop, phase drift EXPECTED, not a fidelity failure',
  puppet: 'diagnostic only — objective is editability + plausible motion, NOT pixel equality',
};

const paletteExact = new Set(PALETTE.map((p) => (p[1] << 16) | (p[2] << 8) | p[3]));
function paletteNear(r, g, b) {
  for (const p of PALETTE) {
    if (Math.abs(r - p[1]) <= 2 && Math.abs(g - p[2]) <= 2 && Math.abs(b - p[3]) <= 2) return true;
  }
  return false;
}

/** Map timeline frame t (0-indexed) -> rendered file, detecting naming. */
function sequenceMap(dir) {
  const full = path.resolve(ROOT, dir);
  const files = fs.readdirSync(full).filter((f) => f.endsWith('.png'));
  if (!files.length) throw new Error(`no PNG frames in ${dir}`);
  const parsed = files.map((f) => {
    const m = f.match(/^(.*?)(\d+)\.png$/);
    if (!m) throw new Error(`unexpected frame name ${f}`);
    return {f, index: parseInt(m[2], 10)};
  }).sort((a, b) => a.index - b.index);
  const start = parsed[0].index;
  if (parsed.length !== FRAMES) throw new Error(`${dir}: ${parsed.length} frames != ${FRAMES}`);
  parsed.forEach((p, i) => { if (p.index !== start + i) throw new Error(`${dir}: non-contiguous at ${p.f}`); });
  return {start, files: parsed.map((p) => path.join(full, p.f)), pattern: files[0]};
}

function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return {min: +s[0].toFixed(4), median: +q(0.5).toFixed(4), p95: +q(0.95).toFixed(4), max: +s[s.length - 1].toFixed(4)};
}

function scoreVariant(label, dir) {
  const seq = sequenceMap(dir);
  const isCel = label === 'cel94' || label === 'celLoop';
  const per = [];
  let totAbs = 0, totHigh = 0, totInterAll = 0, totUnionAll = 0, totInterChar = 0, totUnionChar = 0;
  let totPalExact = 0, totPalNear = 0;
  const t0 = Date.now();
  for (let t = 0; t < FRAMES; t++) {
    const srcFile = path.join(ROOT, 'fullres', `f_${String(t + 1).padStart(3, '0')}.png`);
    const S = PNG.sync.read(fs.readFileSync(srcFile));
    const R = PNG.sync.read(fs.readFileSync(seq.files[t]));
    if (S.width !== W || S.height !== H || R.width !== W || R.height !== H) {
      throw new Error(`frame ${t + 1}: dims mismatch src ${S.width}x${S.height} render ${R.width}x${R.height} (expected ${W}x${H})`);
    }
    const sd = S.data, rd = R.data;
    let sumAbs = 0, high = 0, interAll = 0, unionAll = 0, interChar = 0, unionChar = 0, palE = 0, palN = 0;
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      const sr = sd[o], sg = sd[o + 1], sb = sd[o + 2];
      const rr = rd[o], rg = rd[o + 1], rb = rd[o + 2];
      const dr = Math.abs(rr - sr), dg = Math.abs(rg - sg), db = Math.abs(rb - sb);
      sumAbs += dr + dg + db;
      if (dr > 40 || dg > 40 || db > 40) high++;
      const fgS = (255 - Math.min(sr, sg, sb)) > 12;
      const fgR = (255 - Math.min(rr, rg, rb)) > 12;
      if (fgS && fgR) interAll++;
      if (fgS || fgR) unionAll++;
      const shS = Math.abs(sr - 220) <= 14 && Math.abs(sg - 219) <= 14 && Math.abs(sb - 222) <= 14;
      const shR = Math.abs(rr - 220) <= 14 && Math.abs(rg - 219) <= 14 && Math.abs(rb - 222) <= 14;
      const cS = fgS && !shS, cR = fgR && !shR;
      if (cS && cR) interChar++;
      if (cS || cR) unionChar++;
      if (isCel) {
        if (paletteExact.has((rr << 16) | (rg << 8) | rb)) { palE++; palN++; }
        else if (paletteNear(rr, rg, rb)) palN++;
      }
    }
    const px = W * H;
    const entry = {
      frame: t + 1,
      timelineFrame: t,
      mae: +(sumAbs / (px * 3)).toFixed(4),
      pct_pixels_any_channel_gt_40: +((high / px) * 100).toFixed(4),
      iou_foreground: unionAll ? +(interAll / unionAll).toFixed(4) : 1,
      iou_character: unionChar ? +(interChar / unionChar).toFixed(4) : 1,
    };
    if (isCel) {
      entry.palette_exact_pct = +((palE / px) * 100).toFixed(3);
      entry.palette_near_pct = +((palN / px) * 100).toFixed(3);
    }
    per.push(entry);
    totAbs += sumAbs; totHigh += high;
    totInterAll += interAll; totUnionAll += unionAll;
    totInterChar += interChar; totUnionChar += unionChar;
    totPalExact += palE; totPalNear += palN;
    if ((t + 1) % 20 === 0) console.log(`  ${label}: ${t + 1}/94 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  const px = W * H;
  const worst5 = [...per].sort((a, b) => b.mae - a.mae).slice(0, 5).map((e) => ({frame: e.frame, mae: e.mae, pct_pixels_any_channel_gt_40: e.pct_pixels_any_channel_gt_40, iou_character: e.iou_character}));
  const aggregate = {
    mae: +(totAbs / (px * 3 * FRAMES)).toFixed(4),
    pct_pixels_any_channel_gt_40: +((totHigh / (px * FRAMES)) * 100).toFixed(4),
    iou_foreground: +(totInterAll / totUnionAll).toFixed(4),
    iou_character: +(totInterChar / totUnionChar).toFixed(4),
  };
  if (isCel) {
    aggregate.palette_exact_pct = +((totPalExact / (px * FRAMES)) * 100).toFixed(3);
    aggregate.palette_near_pct = +((totPalNear / (px * FRAMES)) * 100).toFixed(3);
  }
  return {
    objective: OBJECTIVES[label] || 'unknown',
    renderSequence: {dir, startIndex: seq.start, exampleFile: seq.pattern, frames: FRAMES},
    aggregate,
    perFrameStats: {
      mae: stats(per.map((e) => e.mae)),
      pct_pixels_any_channel_gt_40: stats(per.map((e) => e.pct_pixels_any_channel_gt_40)),
      iou_foreground: stats(per.map((e) => e.iou_foreground)),
      iou_character: stats(per.map((e) => e.iou_character)),
    },
    worst5FramesByMae: worst5,
    frames: per,
  };
}

const out = {
  generatedAt: new Date().toISOString(),
  scorer: 'tools/score-fidelity.js',
  samplingMode: 'all_frames',
  comparedFrames: FRAMES,
  dimensions: {width: W, height: H, resampling: 'none — both sides native 1920x1080'},
  sourceFrames: 'fullres/f_001.png .. f_094.png (extracted from source/input_video.mp4)',
  metricDefinitions: {
    mae: 'sum(abs(render_channel - source_channel)) / (width*height*3*frames), RGB, 0..255',
    pct_pixels_any_channel_gt_40: 'pixel counted once iff max(abs(dR),abs(dG),abs(dB)) > 40; /totalPixels*100',
    iou_foreground: 'IoU of masks max(255-R,255-G,255-B) > 12 (includes ground shadow)',
    iou_character: 'IoU of foreground masks minus shadow-classified pixels (|R-220|<=14,|G-219|<=14,|B-222|<=14)',
    palette_exact_pct: 'rendered pixels exactly equal to one of the 11 locked palette colors',
    palette_near_pct: 'rendered pixels within +/-2 per channel of a palette color (AA boundary tolerance)',
  },
  historicalReference: {
    file: 'fidelity.json',
    samplingMode: 'every_6_frames',
    sampledFrames: 16,
    dimensions: '960x540',
    values: {cel94: {mad: 2.71, pct: 0.54}, celLoop: {mad: 4.25, pct: 1.67}, puppet: {mad: 7.24, pct: 3.85}},
    note: 'Historical 16-sample figures. The original scorer was never committed, so the exact old pct formula cannot be re-derived; METHOD.md described it as "% pixels with delta > 40" at 960x540. These are a reference point only and are NOT comparable 1:1 with the all-frame full-resolution metrics below.',
  },
  variants: {},
};

for (const [label, dir] of Object.entries(variants)) {
  console.log(`scoring ${label} <- ${dir}`);
  out.variants[label] = scoreVariant(label, dir);
}

fs.mkdirSync(path.join(ROOT, 'reports'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'reports', 'fidelity-all-frames.json'), JSON.stringify(out, null, 2));

// Human-readable summary
let md = `# Full-sequence fidelity — all 94 frames at 1920x1080\n\n`;
md += `Generated ${out.generatedAt} by \`tools/score-fidelity.js\`. No resampling: rendered frames and source frames are both native 1920x1080.\n\n`;
md += `## Metric definitions\n\n`;
for (const [k, v] of Object.entries(out.metricDefinitions)) md += `- **${k}**: ${v}\n`;
md += `\n## Sequence-wide aggregates (weighted by evaluated pixels/channels)\n\n`;
md += `| Variant | Objective | MAE (0-255) | % px any channel >40 | IoU incl. shadow | IoU character only | Palette exact % |\n|---|---|---|---|---|---|---|\n`;
for (const [label, v] of Object.entries(out.variants)) {
  const a = v.aggregate;
  md += `| ${label} | ${v.objective} | ${a.mae} | ${a.pct_pixels_any_channel_gt_40} | ${a.iou_foreground} | ${a.iou_character} | ${a.palette_exact_pct ?? 'n/a'} |\n`;
}
md += `\n## Per-frame distribution\n\n| Variant | MAE min/med/p95/max | %>40 min/med/p95/max | IoU-char min/med/p95/max |\n|---|---|---|---|\n`;
for (const [label, v] of Object.entries(out.variants)) {
  const s = v.perFrameStats;
  const f = (x) => `${x.min}/${x.median}/${x.p95}/${x.max}`;
  md += `| ${label} | ${f(s.mae)} | ${f(s.pct_pixels_any_channel_gt_40)} | ${f(s.iou_character)} |\n`;
}
md += `\n## Worst 5 frames (by MAE)\n\n`;
for (const [label, v] of Object.entries(out.variants)) {
  md += `**${label}**: ` + v.worst5FramesByMae.map((w) => `f${w.frame} (MAE ${w.mae}, %>40 ${w.pct_pixels_any_channel_gt_40})`).join(', ') + '\n\n';
}
md += `## Historical reference (NOT the same measurement)\n\n`;
md += `\`fidelity.json\` reports MAE 2.71 / 4.25 / 7.24 and pct 0.54 / 1.67 / 3.85 for cel94 / celLoop / puppet, computed on **16 sampled frames at six-frame intervals at 960x540**. The original scorer was not committed. The all-frame full-resolution figures above supersede them for verification purposes; differences are expected because of resolution, sampling and the explicitly defined pixel metric.\n`;
md += `\n## What this does and does not prove\n\nPixel agreement measures visual similarity for this known clip only. It does not prove rig reusability, generalization to new actions, or storyboard automation. The 26-loop drift is expected behavior (comparison control); the puppet numbers are diagnostic, not a fidelity pass/fail.\n`;
md += `\nPer-frame values for all 94 frames x variant: \`reports/fidelity-all-frames.json\`.\n`;
fs.writeFileSync(path.join(ROOT, 'reports', 'FIDELITY.md'), md);
console.log('wrote reports/fidelity-all-frames.json + reports/FIDELITY.md');
for (const [label, v] of Object.entries(out.variants)) {
  console.log(`${label}: MAE ${v.aggregate.mae}, %>40 ${v.aggregate.pct_pixels_any_channel_gt_40}, IoU(fg) ${v.aggregate.iou_foreground}, IoU(char) ${v.aggregate.iou_character}`);
}
