#!/usr/bin/env node
/**
 * Low-RAM render pipeline (~1 GB sandbox, 2 cores).
 *
 * Remotion's built-in multi-threaded ffmpeg stitch gets OOM-killed here, so we
 * render PNG sequences single-threaded and stitch with the static ffmpeg
 * (-threads 1). Same output, tiny memory footprint.
 *
 * Works from ANY current directory — all paths are resolved relative to this
 * script's location (the repository root):
 *
 *   node render-lowram.mjs                 # all registered compositions
 *   node render-lowram.mjs CelRun          # just one
 *   KEEP_FRAMES=1 node render-lowram.mjs   # keep PNG sequences for scoring
 *
 * Safety rules:
 *  - every child process exit status is checked;
 *  - frame sequences are validated (count, contiguity, PNG validity, dims)
 *    BEFORE encoding, and the MP4 is ffprobe-validated AFTER encoding;
 *  - PNG frames are deleted only after ALL verification passed (and only
 *    when KEEP_FRAMES != 1). A failed run keeps its evidence.
 *
 * The JOBS manifest below is the single source of truth for render jobs;
 * remotion/scripts/verify-compositions.mjs checks it against Root.tsx and
 * METHOD.md.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.join(ROOT, 'remotion');
const toolsRequire = createRequire(path.join(ROOT, 'tools', 'package.json'));
const FF = toolsRequire('ffmpeg-static'); // absolute path to the static binary
const FFPROBE = toolsRequire('ffprobe-static').path;

export const FPS = 24;
export const EXPECTED_FRAMES = 94;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Render job manifest. Paths are relative to remotion/. */
export const JOBS = [
  {id: 'CelRun', seq: 'out/celframes', mp4: 'out/run-2d-cel.mp4', semantics: 'exact 94 unique traced cels'},
  {id: 'CelLoop', seq: 'out/celloopframes', mp4: 'out/run-2d-cel-loop.mp4', semantics: '26-cel loop (expected drift)'},
  {id: 'RunCycle', seq: 'out/puppetframes', mp4: 'out/run-2d-puppet.mp4', semantics: 'procedural puppet'},
  {id: 'Comparison', seq: 'out/compareframes', mp4: 'out/comparison-source-vs-2d.mp4', semantics: 'labelled 4-panel proof'},
];

function run(cmd, args, cwd) {
  console.log(`\n$ (cwd=${cwd}) ${cmd} ${args.join(' ')}`);
  // Windows: `.cmd` shims (npx/npm) must be spawned through a shell; absolute
  // exe paths (ffmpeg-static/ffprobe) must NOT (paths may contain spaces).
  const shell = process.platform === 'win32' && !path.isAbsolute(cmd);
  const r = spawnSync(cmd, args, {cwd, stdio: 'inherit', shell});
  if (r.error) throw new Error(`${cmd} failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
}

function probe(file, cwd) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Cheap PNG validation: magic bytes + IHDR dimensions, no full decode. */
function pngHeader(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(24);
  const n = fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  if (n < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    return null;
  }
  return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
}

/** Validate a rendered PNG sequence: count, contiguous indexes, valid PNGs, dims. */
function validateSequence(seqDir) {
  const files = fs.readdirSync(seqDir).filter((f) => f.endsWith('.png')).sort();
  if (!files.length) throw new Error('no frames rendered in ' + seqDir);
  const parsed = files.map((f) => {
    const m = f.match(/^(.*?)(\d+)\.png$/);
    if (!m) throw new Error('unexpected frame name: ' + f);
    return {file: f, prefix: m[1], digits: m[2], index: parseInt(m[2], 10)};
  });
  parsed.sort((a, b) => a.index - b.index);
  const problems = [];
  if (parsed.length !== EXPECTED_FRAMES) {
    problems.push(`frame count ${parsed.length} != expected ${EXPECTED_FRAMES}`);
  }
  const start = parsed[0].index;
  parsed.forEach((p, i) => {
    if (p.index !== start + i) problems.push(`non-contiguous index at ${p.file} (expected ${start + i})`);
    if (p.prefix !== parsed[0].prefix || p.digits.length !== parsed[0].digits.length) {
      problems.push(`inconsistent naming at ${p.file}`);
    }
    const full = path.join(seqDir, p.file);
    if (fs.statSync(full).size === 0) problems.push(`empty file ${p.file}`);
    const dim = pngHeader(full);
    if (!dim) problems.push(`invalid PNG ${p.file}`);
    else if (dim.width !== WIDTH || dim.height !== HEIGHT) {
      problems.push(`wrong dimensions ${dim.width}x${dim.height} in ${p.file}`);
    }
  });
  if (problems.length) throw new Error('sequence validation failed:\n  ' + problems.join('\n  '));
  const pattern = `${parsed[0].prefix}%0${parsed[0].digits.length}d.png`;
  return {count: parsed.length, start, pattern, files: parsed.map((p) => p.file)};
}

/** Validate the encoded MP4 with ffprobe: dims, fps, frame count, single audio stream. */
function validateMp4(mp4Path, audioRefDuration) {
  const info = probe(mp4Path, REMOTION);
  const video = info.streams.filter((s) => s.codec_type === 'video');
  const audio = info.streams.filter((s) => s.codec_type === 'audio');
  const problems = [];
  if (video.length !== 1) problems.push(`expected 1 video stream, found ${video.length}`);
  if (audio.length !== 1) problems.push(`expected exactly 1 audio stream (no duplication), found ${audio.length}`);
  const v = video[0] || {};
  if (v.width !== WIDTH || v.height !== HEIGHT) problems.push(`video dims ${v.width}x${v.height} != ${WIDTH}x${HEIGHT}`);
  if (v.r_frame_rate !== '24/1') problems.push(`r_frame_rate ${v.r_frame_rate} != 24/1`);
  const nbFrames = Number(v.nb_frames);
  if (Number.isFinite(nbFrames) && nbFrames !== EXPECTED_FRAMES) problems.push(`nb_frames ${nbFrames} != ${EXPECTED_FRAMES}`);
  const dur = Number(info.format.duration);
  const expectedDur = EXPECTED_FRAMES / FPS;
  if (!Number.isFinite(dur) || Math.abs(dur - expectedDur) > 0.1) {
    problems.push(`duration ${dur}s not within 0.1s of ${expectedDur.toFixed(4)}s`);
  }
  if (audio.length === 1 && audioRefDuration) {
    const ad = Number(audio[0].duration);
    if (!Number.isFinite(ad) || ad < audioRefDuration - 0.15) {
      problems.push(`audio duration ${ad}s truncated vs reference ${audioRefDuration}s`);
    }
  }
  if (problems.length) throw new Error('MP4 validation failed:\n  ' + problems.join('\n  '));
  return {
    width: v.width,
    height: v.height,
    fps: v.r_frame_rate,
    nbFrames: Number.isFinite(nbFrames) ? nbFrames : null,
    durationSec: dur,
    audioStreams: audio.length,
    audioCodec: audio[0] ? audio[0].codec_name : null,
    audioDurationSec: audio[0] ? Number(audio[0].duration) : null,
    sizeBytes: fs.statSync(mp4Path).size,
  };
}

function main() {
  const want = process.argv.slice(2);
  const jobs = want.length ? JOBS.filter((j) => want.includes(j.id)) : JOBS;
  if (!jobs.length) {
    console.error('unknown composition; choose from', JOBS.map((j) => j.id).join(', '));
    process.exit(1);
  }
  if (!fs.existsSync(FF)) throw new Error('ffmpeg-static binary missing — run `npm ci` in tools/ first: ' + FF);
  if (!fs.existsSync(path.join(REMOTION, 'node_modules'))) {
    throw new Error('remotion/node_modules missing — run `npm ci` in remotion/ first');
  }
  fs.mkdirSync(path.join(REMOTION, 'out'), {recursive: true});
  fs.mkdirSync(path.join(ROOT, 'reports'), {recursive: true});

  // Reference audio duration (the original track, attached once per MP4).
  const audioRef = probe(path.join(REMOTION, 'public', 'audio.m4a'), REMOTION);
  const audioRefDuration = Number(audioRef.format.duration);

  const results = [];
  let failures = 0;
  for (const job of jobs) {
    const t0 = Date.now();
    const seqDir = path.join(REMOTION, job.seq);
    const mp4Path = path.join(REMOTION, job.mp4);
    const result = {id: job.id, semantics: job.semantics, expectedFrames: EXPECTED_FRAMES, status: 'FAIL'};
    try {
      fs.rmSync(seqDir, {recursive: true, force: true});
      run('npx', ['remotion', 'render', job.id, job.seq, '--sequence', '--concurrency=1', '--log=error'], REMOTION);

      const seq = validateSequence(seqDir);
      result.actualFrames = seq.count;
      result.sequencePattern = seq.pattern;
      result.sequenceStartIndex = seq.start;
      console.log(`sequence OK: ${seq.count} frames, pattern ${seq.pattern} (start ${seq.start})`);

      fs.mkdirSync(path.dirname(mp4Path), {recursive: true});
      run(FF, [
        '-v', 'error', '-y',
        '-framerate', String(FPS), '-start_number', String(seq.start), '-i', path.join(job.seq, seq.pattern),
        '-i', 'public/audio.m4a',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '1', '-crf', '18', '-preset', 'medium',
        '-c:a', 'aac', '-b:a', '128k', '-shortest',
        job.mp4,
      ], REMOTION);
      if (!fs.existsSync(mp4Path) || fs.statSync(mp4Path).size === 0) {
        throw new Error('encoder produced no output: ' + job.mp4);
      }

      const meta = validateMp4(mp4Path, audioRefDuration);
      Object.assign(result, meta, {status: 'PASS'});
      result.renderSeconds = +((Date.now() - t0) / 1000).toFixed(1);
      console.log(`✔ ${job.mp4}  ${(meta.sizeBytes / 1024).toFixed(0)} KB  ${meta.width}x${meta.height} @ ${meta.fps}  ${meta.durationSec}s  audio x${meta.audioStreams}  (${result.renderSeconds}s)`);

      // Delete the regenerable PNG sequence only after ALL verification passed.
      if (process.env.KEEP_FRAMES !== '1') fs.rmSync(seqDir, {recursive: true, force: true});
      else console.log('  kept frames: ' + job.seq);
    } catch (err) {
      failures++;
      result.error = String(err.message || err);
      result.renderSeconds = +((Date.now() - t0) / 1000).toFixed(1);
      console.error(`✘ ${job.id}: ${result.error}`);
      console.error(`  evidence kept: ${seqDir} (and any partial ${job.mp4})`);
    }
    results.push(result);
  }

  // Summary table
  console.log('\n=== render summary ===');
  console.log('id          frames(exp/act)  dims       fps    dur(s)  size(KB)  time(s)  status');
  for (const r of results) {
    console.log(
      `${r.id.padEnd(11)} ${String(r.expectedFrames).padStart(3)}/${String(r.actualFrames ?? '-').padStart(3)}        ` +
      `${(r.width ? `${r.width}x${r.height}` : '-').padEnd(10)} ${(r.fps ?? '-').padEnd(6)} ` +
      `${String(r.durationSec ?? '-').padEnd(7)} ${String(r.sizeBytes ? (r.sizeBytes / 1024).toFixed(0) : '-').padEnd(9)} ` +
      `${String(r.renderSeconds).padEnd(8)} ${r.status}`
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    script: 'render-lowram.mjs',
    settings: {sequence: true, concurrency: 1, ffmpegThreads: 1, keepFrames: process.env.KEEP_FRAMES === '1'},
    expected: {frames: EXPECTED_FRAMES, fps: FPS, width: WIDTH, height: HEIGHT, audioStreams: 1},
    audioReferenceDurationSec: audioRefDuration,
    jobs: results,
  };
  fs.writeFileSync(path.join(ROOT, 'reports', 'render-validation.json'), JSON.stringify(report, null, 2));
  console.log('\nreport: reports/render-validation.json');
  if (failures) {
    console.error(`${failures} job(s) FAILED — frames kept for diagnosis`);
    process.exit(1);
  }
  console.log('all done');
}

// Run only when invoked directly (the verifier imports JOBS without rendering).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
