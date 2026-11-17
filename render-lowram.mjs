#!/usr/bin/env node
/**
 * Low-RAM render pipeline (~1 GB sandbox).
 *
 * Remotion's built-in multi-threaded ffmpeg stitch gets OOM-killed here, so we
 * render PNG sequences single-threaded and stitch with the static ffmpeg
 * (-threads 1). Same output, tiny memory footprint.
 *
 *   node render-lowram.mjs            # all three compositions
 *   node render-lowram.mjs CelRun     # just one
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FF = path.resolve('../tools/node_modules/ffmpeg-static/ffmpeg');
const FPS = 24;

const JOBS = [
  {id: 'CelRun', seq: 'out/celframes', mp4: 'out/run-2d-cel.mp4'},
  {id: 'CelLoop', seq: 'out/celloopframes', mp4: 'out/run-2d-cel-loop.mp4'},
  {id: 'RunCycle', seq: 'out/puppetframes', mp4: 'out/run-2d-puppet.mp4'},
  {id: 'Comparison', seq: 'out/compareframes', mp4: 'out/comparison-source-vs-2d.mp4'},
];

const want = process.argv.slice(2);
const jobs = want.length ? JOBS.filter((j) => want.includes(j.id)) : JOBS;
if (!jobs.length) {
  console.error('unknown composition; choose from', JOBS.map((j) => j.id).join(', '));
  process.exit(1);
}

function run(cmd, args) {
  console.log('\n$ ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, {stdio: 'inherit'});
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
}

fs.mkdirSync('out', {recursive: true});

for (const job of jobs) {
  const t0 = Date.now();
  fs.rmSync(job.seq, {recursive: true, force: true});
  run('npx', ['remotion', 'render', job.id, job.seq, '--sequence', '--concurrency=1', '--log=error']);

  // Detect the actual sequence filename/padding instead of assuming it.
  const files = fs.readdirSync(job.seq).filter((f) => f.endsWith('.png')).sort();
  if (!files.length) throw new Error('no frames rendered in ' + job.seq);
  const m = files[0].match(/^(.*?)(\d+)\.png$/);
  if (!m) throw new Error('unexpected frame name: ' + files[0]);
  const pattern = path.join(job.seq, `${m[1]}%0${m[2].length}d.png`);
  const start = parseInt(m[2], 10);
  console.log(`${files.length} frames, pattern ${pattern} (start ${start})`);

  run(FF, [
    '-v', 'error', '-y',
    '-framerate', String(FPS), '-start_number', String(start), '-i', pattern,
    '-i', 'public/audio.m4a',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '1', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    job.mp4,
  ]);
  const kb = (fs.statSync(job.mp4).size / 1024).toFixed(0);
  console.log(`✔ ${job.mp4}  ${kb} KB  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  // The PNG sequence is ~13-32 MB per composition and fully regenerable.
  // Drop it unless KEEP_FRAMES=1 (keeps the workspace well under snapshot caps).
  if (process.env.KEEP_FRAMES !== '1') fs.rmSync(job.seq, {recursive: true, force: true});
  else console.log('  kept frames: ' + job.seq);
}
console.log('\nall done');
