# Full-sequence fidelity — all 94 frames at 1920x1080

Generated 2026-11-18T20:20:40.716Z by `tools/score-fidelity.js`. No resampling: rendered frames and source frames are both native 1920x1080.

## Metric definitions

- **mae**: sum(abs(render_channel - source_channel)) / (width*height*3*frames), RGB, 0..255
- **pct_pixels_any_channel_gt_40**: pixel counted once iff max(abs(dR),abs(dG),abs(dB)) > 40; /totalPixels*100
- **iou_foreground**: IoU of masks max(255-R,255-G,255-B) > 12 (includes ground shadow)
- **iou_character**: IoU of foreground masks minus shadow-classified pixels (|R-220|<=14,|G-219|<=14,|B-222|<=14)
- **palette_exact_pct**: rendered pixels exactly equal to one of the 11 locked palette colors
- **palette_near_pct**: rendered pixels within +/-2 per channel of a palette color (AA boundary tolerance)

## Sequence-wide aggregates (weighted by evaluated pixels/channels)

| Variant | Objective | MAE (0-255) | % px any channel >40 | IoU incl. shadow | IoU character only | Palette exact % |
|---|---|---|---|---|---|---|
| cel94 | fidelity deliverable — exact per-frame traced cels | 1.046 | 0.8006 | 0.9756 | 0.9577 | 99.143 |
| celLoop | comparison/control — 26-cel loop, phase drift EXPECTED, not a fidelity failure | 2.5423 | 1.8057 | 0.8791 | 0.8582 | 99.156 |
| puppet | diagnostic only — objective is editability + plausible motion, NOT pixel equality | 5.85 | 4.4777 | 0.5876 | 0.5833 | n/a |

## Per-frame distribution

| Variant | MAE min/med/p95/max | %>40 min/med/p95/max | IoU-char min/med/p95/max |
|---|---|---|---|
| cel94 | 0.9012/1.0484/1.1197/1.2085 | 0.7111/0.8019/0.8495/0.8769 | 0.9479/0.9575/0.9637/0.9669 |
| celLoop | 0.972/2.238/4.8647/6.1712 | 0.7207/1.5923/3.4987/4.2079 | 0.6282/0.8901/0.9614/0.9638 |
| puppet | 4.4482/5.8407/7.0491/7.3697 | 3.6891/4.4481/5.1103/5.5033 | 0.4846/0.5871/0.6418/0.6569 |

## Worst 5 frames (by MAE)

**cel94**: f41 (MAE 1.2085, %>40 0.8468), f12 (MAE 1.1374, %>40 0.8508), f14 (MAE 1.1306, %>40 0.836), f26 (MAE 1.1286, %>40 0.8651), f27 (MAE 1.126, %>40 0.8308)

**celLoop**: f34 (MAE 6.1712, %>40 4.2079), f74 (MAE 5.5073, %>40 3.9893), f73 (MAE 5.4313, %>40 3.9971), f33 (MAE 5.0052, %>40 3.5296), f75 (MAE 4.8821, %>40 3.4497)

**puppet**: f38 (MAE 7.3697, %>40 5.5033), f64 (MAE 7.3669, %>40 5.4653), f90 (MAE 7.3548, %>40 5.4652), f12 (MAE 7.2999, %>40 5.4667), f25 (MAE 7.0691, %>40 5.0261)

## Historical reference (NOT the same measurement)

`fidelity.json` reports MAE 2.71 / 4.25 / 7.24 and pct 0.54 / 1.67 / 3.85 for cel94 / celLoop / puppet, computed on **16 sampled frames at six-frame intervals at 960x540**. The original scorer was not committed. The all-frame full-resolution figures above supersede them for verification purposes; differences are expected because of resolution, sampling and the explicitly defined pixel metric.

## What this does and does not prove

Pixel agreement measures visual similarity for this known clip only. It does not prove rig reusability, generalization to new actions, or storyboard automation. The 26-loop drift is expected behavior (comparison control); the puppet numbers are diagnostic, not a fidelity pass/fail.

Per-frame values for all 94 frames x variant: `reports/fidelity-all-frames.json`.
