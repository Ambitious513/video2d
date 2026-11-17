#!/usr/bin/env node
/**
 * Deterministic source-frame extraction (Test B input step).
 *
 *   node tools/extract-frames.js
 *
 * Produces, from source/input_video.mp4 (the ground truth):
 *   fullres/f_001.png .. f_094.png                  1920x1080 (scoring/tracing)
 *   remotion/public/srcframes/f_001.png .. f_094.png  960x540 (Comparison panel)
 *
 * Both outputs are regenerable and gitignored (except the 26 historically
 * committed fullres/f_001..f_026.png, which are kept tracked and verified
 * byte-identical by tools/verify-source.js). The committed half-resolution
 * frames/ directory is NEVER overwritten by this script.
 *
 * Commands are plain deterministic ffmpeg image2 extraction — no filters that
 * could reorder or drop frames. Frame N of the clip becomes f_{N+1}.png.
 */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FF = require('ffmpeg-static');
const SOURCE = path.join(ROOT, 'source', 'input_video.mp4');

function run(args) {
  console.log('$ ffmpeg ' + args.join(' '));
  const r = spawnSync(FF, args, {cwd: ROOT, stdio: 'inherit'});
  if (r.status !== 0) throw new Error('ffmpeg exited ' + r.status);
}

const fullres = path.join(ROOT, 'fullres');
const srcframes = path.join(ROOT, 'remotion', 'public', 'srcframes');
fs.mkdirSync(fullres, {recursive: true});
fs.mkdirSync(srcframes, {recursive: true});

// Full resolution: exact source pixels, 1-based contiguous numbering.
run(['-v', 'error', '-y', '-i', SOURCE, '-start_number', '1', path.join(fullres, 'f_%03d.png')]);
// Half resolution for the Comparison source panel (same scale as committed frames/).
run(['-v', 'error', '-y', '-i', SOURCE, '-vf', 'scale=960:-1', '-start_number', '1', path.join(srcframes, 'f_%03d.png')]);

for (const [dir, label] of [[fullres, 'fullres'], [srcframes, 'srcframes']]) {
  const files = fs.readdirSync(dir).filter((f) => /^f_\d{3}\.png$/.test(f));
  console.log(`${label}: ${files.length} frames`);
  if (files.length !== 94) throw new Error(`${label}: expected 94 frames, got ${files.length}`);
}
console.log('extraction OK');
