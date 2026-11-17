#!/usr/bin/env node
/**
 * Test A (source media validation) + Test B (source-frame extraction validation).
 *
 *   node tools/verify-source.js
 *
 * Writes reports/source-media.json and reports/source-frame-validation.json.
 * Never alters the source media. If metadata differs from the documented
 * 1920x1080 / 24fps / 94 frames / ~3.92s, the measured facts are recorded and
 * the checks FAIL loudly instead of being silently adjusted.
 */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const {PNG} = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const FF = require('ffmpeg-static');
const FFPROBE = require('ffprobe-static').path;
const SOURCE = path.join(ROOT, 'source', 'input_video.mp4');

function probe(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
function pngHeader(file) {
  const buf = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r');
  const n = fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  if (n < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
}
function pixelsEqual(a, b) {
  const A = PNG.sync.read(fs.readFileSync(a));
  const B = PNG.sync.read(fs.readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return false;
  return A.data.equals(B.data);
}
const check = (name, ok, detail) => ({name, status: ok ? 'PASS' : 'FAIL', detail});

// ---------- Test A: source media ----------
const info = probe(SOURCE);
const v = info.streams.find((s) => s.codec_type === 'video') || {};
const a = info.streams.find((s) => s.codec_type === 'audio');
const dur = Number(info.format.duration);
const mediaChecks = [
  check('video stream exists', Boolean(v.codec_name), `codec=${v.codec_name}`),
  check('width=1920', v.width === 1920, `measured ${v.width}`),
  check('height=1080', v.height === 1080, `measured ${v.height}`),
  check('fps=24/1', v.r_frame_rate === '24/1', `r_frame_rate=${v.r_frame_rate}, avg_frame_rate=${v.avg_frame_rate}`),
  check('frame count=94', Number(v.nb_frames) === 94, `nb_frames=${v.nb_frames}, duration*fps=${(dur * 24).toFixed(3)}`),
  check('audio stream exists', Boolean(a), a ? `codec=${a.codec_name}, channels=${a.channels}, duration=${a.duration}s` : 'none'),
  check('duration ~3.92s', Math.abs(dur - 3.92) < 0.05, `format.duration=${dur}s (94/24 = ${(94 / 24).toFixed(4)}s)`),
];
const mediaReport = {
  generatedAt: new Date().toISOString(),
  source: 'source/input_video.mp4',
  measured: {
    width: v.width, height: v.height, rFrameRate: v.r_frame_rate, avgFrameRate: v.avg_frame_rate,
    nbFrames: Number(v.nb_frames), durationSec: dur, videoCodec: v.codec_name,
    audio: a ? {codec: a.codec_name, channels: a.channels, sampleRate: a.sample_rate, durationSec: Number(a.duration)} : null,
    formatName: info.format.format_name, sizeBytes: Number(info.format.size),
  },
  checks: mediaChecks,
  status: mediaChecks.every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL',
};
fs.mkdirSync(path.join(ROOT, 'reports'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'reports', 'source-media.json'), JSON.stringify(mediaReport, null, 2));
console.log('Test A source media:', mediaReport.status);

// ---------- Test B: extracted frames ----------
function validateDir(rel, width, height, expectCount) {
  const dir = path.join(ROOT, rel);
  const problems = [];
  if (!fs.existsSync(dir)) return {dir: rel, status: 'FAIL', problems: ['directory missing — run tools/extract-frames.js']};
  const files = fs.readdirSync(dir).filter((f) => /^f_\d{3}\.png$/.test(f)).sort();
  if (files.length !== expectCount) problems.push(`count ${files.length} != ${expectCount}`);
  const names = new Set(files);
  if (names.size !== files.length) problems.push('duplicate names');
  for (let i = 1; i <= expectCount; i++) {
    const name = `f_${String(i).padStart(3, '0')}.png`;
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) { problems.push(`missing ${name}`); continue; }
    if (fs.statSync(full).size === 0) problems.push(`empty ${name}`);
    const dim = pngHeader(full);
    if (!dim) problems.push(`invalid PNG ${name}`);
    else if (dim.width !== width || dim.height !== height) problems.push(`${name}: ${dim.width}x${dim.height} != ${width}x${height}`);
  }
  return {dir: rel, expectedCount: expectCount, actualCount: files.length, expectedDims: `${width}x${height}`, status: problems.length ? 'FAIL' : 'PASS', problems};
}

const fullresVal = validateDir('fullres', 1920, 1080, 94);
const srcframesVal = validateDir(path.join('remotion', 'public', 'srcframes'), 960, 540, 94);
const halfresVal = validateDir('frames', 960, 540, 94);

// Order proof 1: spot re-extraction with select=eq(n,K) must pixel-match f_{K+1}.
const orderChecks = [];
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'v2d-order-'));
for (const n of [0, 46, 93]) {
  const out = path.join(tmp, `spot_${n}.png`);
  const r = spawnSync(FF, ['-v', 'error', '-y', '-i', SOURCE, '-vf', `select=eq(n\\,${n})`, '-vsync', 'vfr', '-frames:v', '1', out], {encoding: 'utf8'});
  const target = path.join(ROOT, 'fullres', `f_${String(n + 1).padStart(3, '0')}.png`);
  const ok = r.status === 0 && fs.existsSync(target) && pixelsEqual(out, target);
  orderChecks.push(check(`source frame n=${n} pixel-matches fullres/f_${String(n + 1).padStart(3, '0')}.png`, ok, ok ? 'identical pixels' : `ffmpeg: ${r.stderr}`));
}
fs.rmSync(tmp, {recursive: true, force: true});

// Order proof 2: committed half-res frames/ must pixel-match the fresh 960x540
// extraction for ALL 94 frames (proves the committed set is the source order).
let halfMismatch = [];
if (halfresVal.status === 'PASS' && srcframesVal.status === 'PASS') {
  for (let i = 1; i <= 94; i++) {
    const n = String(i).padStart(3, '0');
    if (!pixelsEqual(path.join(ROOT, 'frames', `f_${n}.png`), path.join(ROOT, 'remotion', 'public', 'srcframes', `f_${n}.png`))) {
      halfMismatch.push(n);
    }
  }
}
const halfOrderCheck = check('committed frames/ pixel-identical to fresh 960x540 extraction (all 94)', halfMismatch.length === 0 && halfresVal.status === 'PASS', halfMismatch.length ? `mismatches: ${halfMismatch.join(',')}` : '94/94 identical');

// Determinism proof: the 26 historically committed fullres PNGs must be
// byte-identical to the fresh extraction (same ffmpeg-static version).
const committedFullres = [];
for (let i = 1; i <= 26; i++) {
  const n = String(i).padStart(3, '0');
  const p = path.join(ROOT, 'fullres', `f_${n}.png`);
  if (!fs.existsSync(p)) continue;
  const r = spawnSync('git', ['-C', ROOT, 'show', `HEAD:fullres/f_${n}.png`], {encoding: 'buffer', maxBuffer: 16 * 1024 * 1024});
  if (r.status !== 0) continue; // not tracked (new extraction) — skip
  committedFullres.push({frame: n, byteIdentical: Buffer.compare(r.stdout, fs.readFileSync(p)) === 0});
}
const detCheck = check('26 committed fullres PNGs byte-identical to fresh extraction', committedFullres.length > 0 && committedFullres.every((c) => c.byteIdentical), `${committedFullres.filter((c) => c.byteIdentical).length}/${committedFullres.length} identical`);

// Audio preservation: public/audio.m4a duration vs source audio stream.
const audioPub = probe(path.join(ROOT, 'remotion', 'public', 'audio.m4a'));
const audioCheck = check('public/audio.m4a preserves source audio duration (±0.1s)', a && Math.abs(Number(audioPub.format.duration) - Number(a.duration)) < 0.1, `public=${audioPub.format.duration}s source=${a ? a.duration : '?'}s`);

const frameChecks = [
  check('fullres/ 94 contiguous 1920x1080 valid PNGs', fullresVal.status === 'PASS', JSON.stringify(fullresVal.problems || [])),
  check('srcframes/ 94 contiguous 960x540 valid PNGs', srcframesVal.status === 'PASS', JSON.stringify(srcframesVal.problems || [])),
  check('committed frames/ 94 contiguous 960x540 valid PNGs', halfresVal.status === 'PASS', JSON.stringify(halfresVal.problems || [])),
  ...orderChecks, halfOrderCheck, detCheck, audioCheck,
];
const frameReport = {
  generatedAt: new Date().toISOString(),
  extractionCommands: [
    'ffmpeg -v error -y -i source/input_video.mp4 -start_number 1 fullres/f_%03d.png',
    'ffmpeg -v error -y -i source/input_video.mp4 -vf scale=960:-1 -start_number 1 remotion/public/srcframes/f_%03d.png',
  ],
  directories: [fullresVal, srcframesVal, halfresVal],
  committedFullresDeterminism: committedFullres,
  checks: frameChecks,
  status: frameChecks.every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL',
};
fs.writeFileSync(path.join(ROOT, 'reports', 'source-frame-validation.json'), JSON.stringify(frameReport, null, 2));
console.log('Test B source frames:', frameReport.status);
for (const c of frameChecks) console.log(`  [${c.status}] ${c.name} — ${c.detail}`);
process.exit(mediaReport.status === 'PASS' && frameReport.status === 'PASS' ? 0 : 1);
