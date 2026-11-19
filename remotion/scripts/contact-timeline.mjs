#!/usr/bin/env node
/**
 * Phase 2.2b — deterministic labelled contact TIMELINE strip (SVG, no deps).
 *
 * Reads reports/foot-contact-evidence.json (produced by contact-evidence.ts)
 * and renders a compact, self-contained SVG showing, for timeline frames 0..93:
 *   - per-foot contact-state bands (near / far) from the reviewed track;
 *   - the solved toe-height curves (near / far) with the ground line at 0;
 *   - the solved toe-vx curves (near / far) with the treadmill belt line;
 *   - the contact-height window markers.
 * This is a deterministic visualization of measured data — NOT AI imagery.
 * Run: node remotion/scripts/contact-timeline.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const EVIDENCE = path.join(ROOT, 'reports', 'foot-contact-evidence.json');
const OUT = path.join(ROOT, 'reports', 'foot-contact-timeline.svg');
const ev = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
const N = ev.contactTrack.totalFrames;
const belt = ev.beltVxEstimatePxPerFrame;

const STATE_COLORS = {
  swing: '#E9E9EE', uncertain: '#F4C95D', touchdown: '#5B8DEF',
  stance: '#3FA66A', toeOff: '#E07A3F',
};
const NEAR_CURVE = '#2F6FED';
const FAR_CURVE = '#E07A3F';

const W = 1480, H = 640;
const L = 92, R = 1452;
const xOf = (f) => L + (f / (N - 1)) * (R - L);
const cellW = (R - L) / N;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const parts = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, Arial, sans-serif">`);
parts.push(`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`);
parts.push(`<text x="${L}" y="30" font-size="20" font-weight="bold" fill="#20222E">Video2D Phase 2.2b — foot-contact timeline (reference-run-94, 1920×1080 @ 24fps)</text>`);
parts.push(`<text x="${L}" y="52" font-size="13" fill="#555">ground worldY=${ev.groundY.toFixed(2)} px (y-down) · treadmill belt=${belt.toFixed(2)} px/frame · rootMode=${ev.contactTrack.rootMode} · provisional=${ev.contactTrack.provisional} · ground.verified=${ev.contactTrack.ground.verified}</text>`);

// window markers (vertical shaded bands behind the plots)
const windows = [...ev.contactTrack.near.map((w) => ({...w, side: 'near'})), ...ev.contactTrack.far.map((w) => ({...w, side: 'far'}))];
const plotTop = 176, plotBottom = 592;
for (const w of windows) {
  const x0 = xOf(w.start) - cellW / 2, x1 = xOf(w.end) + cellW / 2;
  parts.push(`<rect x="${x0.toFixed(1)}" y="${plotTop}" width="${(x1 - x0).toFixed(1)}" height="${plotBottom - plotTop}" fill="#F4C95D" opacity="0.10"/>`);
}

// ---- state bands ----------------------------------------------------------
const bandTop = 78, bandH = 26, bandGap = 4;
const drawBand = (side, top) => {
  parts.push(`<text x="${L - 8}" y="${top + bandH / 2 + 4}" font-size="13" text-anchor="end" fill="#333">${side}</text>`);
  for (let f = 0; f < N; f++) {
    const st = ev.states[f][side];
    parts.push(`<rect x="${(L + f * cellW).toFixed(2)}" y="${top}" width="${(cellW + 0.5).toFixed(2)}" height="${bandH}" fill="${STATE_COLORS[st]}"/>`);
  }
  parts.push(`<rect x="${L}" y="${top}" width="${R - L}" height="${bandH}" fill="none" stroke="#BBB" stroke-width="1"/>`);
};
drawBand('near', bandTop);
drawBand('far', bandTop + bandH + bandGap);
// legend
let lx = L;
const ly = bandTop + 2 * (bandH + bandGap) + 14;
for (const st of ['swing', 'uncertain', 'touchdown', 'stance', 'toeOff']) {
  parts.push(`<rect x="${lx}" y="${ly - 11}" width="14" height="14" fill="${STATE_COLORS[st]}" stroke="#999" stroke-width="0.5"/>`);
  parts.push(`<text x="${lx + 19}" y="${ly}" font-size="12" fill="#333">${st}</text>`);
  lx += 19 + st.length * 7.3 + 22;
}
parts.push(`<text x="${lx + 6}" y="${ly}" font-size="12" fill="#333">— toe-height / toe-vx curves:</text>`);
parts.push(`<line x1="${lx + 196}" y1="${ly - 4}" x2="${lx + 224}" y2="${ly - 4}" stroke="${NEAR_CURVE}" stroke-width="2.5"/>`);
parts.push(`<text x="${lx + 230}" y="${ly}" font-size="12" fill="#333">near</text>`);
parts.push(`<line x1="${lx + 268}" y1="${ly - 4}" x2="${lx + 296}" y2="${ly - 4}" stroke="${FAR_CURVE}" stroke-width="2.5"/>`);
parts.push(`<text x="${lx + 302}" y="${ly}" font-size="12" fill="#333">far</text>`);

// ---- toe-height panel -----------------------------------------------------
const hTop = 196, hBottom = 336, hMax = 220;
const yH = (h) => hBottom - (Math.max(0, Math.min(hMax, h)) / hMax) * (hBottom - hTop);
parts.push(`<text x="${L - 8}" y="${hTop + 4}" font-size="12" text-anchor="end" fill="#333">toe</text>`);
parts.push(`<text x="${L - 8}" y="${hTop + 18}" font-size="12" text-anchor="end" fill="#333">height</text>`);
parts.push(`<text x="${L - 8}" y="${hTop + 32}" font-size="11" text-anchor="end" fill="#777">(px)</text>`);
// gridlines + labels
for (const h of [0, 50, 100, 150, 200]) {
  parts.push(`<line x1="${L}" y1="${yH(h).toFixed(1)}" x2="${R}" y2="${yH(h).toFixed(1)}" stroke="#EEE" stroke-width="1"/>`);
  parts.push(`<text x="${L - 40}" y="${yH(h) + 4}" font-size="10" text-anchor="end" fill="#999">${h}</text>`);
}
parts.push(`<line x1="${L}" y1="${yH(0).toFixed(1)}" x2="${R}" y2="${yH(0).toFixed(1)}" stroke="#3FA66A" stroke-width="1.5"/>`);
parts.push(`<text x="${R + 4}" y="${yH(0) + 4}" font-size="10" fill="#3FA66A">ground</text>`);
const polyH = (side) => ev.frames.map((fr) => `${xOf(fr.frame).toFixed(1)},${yH(fr[side].toeHeight).toFixed(1)}`).join(' ');
parts.push(`<polyline points="${polyH('far')}" fill="none" stroke="${FAR_CURVE}" stroke-width="2" opacity="0.9"/>`);
parts.push(`<polyline points="${polyH('near')}" fill="none" stroke="${NEAR_CURVE}" stroke-width="2" opacity="0.9"/>`);
parts.push(`<rect x="${L}" y="${hTop}" width="${R - L}" height="${hBottom - hTop}" fill="none" stroke="#CCC" stroke-width="1"/>`);

// ---- toe-vx panel ---------------------------------------------------------
const vTop = 400, vBottom = 560, vMin = -85, vMax = 85;
const yV = (v) => vBottom - ((Math.max(vMin, Math.min(vMax, v)) - vMin) / (vMax - vMin)) * (vBottom - vTop);
parts.push(`<text x="${L - 8}" y="${vTop + 4}" font-size="12" text-anchor="end" fill="#333">toe vx</text>`);
parts.push(`<text x="${L - 8}" y="${vTop + 18}" font-size="11" text-anchor="end" fill="#777">(px/fr)</text>`);
for (const v of [-80, -40, 0, 40, 80]) {
  parts.push(`<line x1="${L}" y1="${yV(v).toFixed(1)}" x2="${R}" y2="${yV(v).toFixed(1)}" stroke="#EEE" stroke-width="1"/>`);
  parts.push(`<text x="${L - 40}" y="${yV(v) + 4}" font-size="10" text-anchor="end" fill="#999">${v}</text>`);
}
parts.push(`<line x1="${L}" y1="${yV(0).toFixed(1)}" x2="${R}" y2="${yV(0).toFixed(1)}" stroke="#BBB" stroke-width="1"/>`);
parts.push(`<line x1="${L}" y1="${yV(belt).toFixed(1)}" x2="${R}" y2="${yV(belt).toFixed(1)}" stroke="#D23B3B" stroke-width="1.5" stroke-dasharray="6 4"/>`);
parts.push(`<text x="${R + 4}" y="${yV(belt) + 4}" font-size="10" fill="#D23B3B">belt ${belt.toFixed(1)}</text>`);
const polyV = (side) => ev.frames.map((fr) => `${xOf(fr.frame).toFixed(1)},${yV(fr[side].toeVx).toFixed(1)}`).join(' ');
parts.push(`<polyline points="${polyV('far')}" fill="none" stroke="${FAR_CURVE}" stroke-width="2" opacity="0.9"/>`);
parts.push(`<polyline points="${polyV('near')}" fill="none" stroke="${NEAR_CURVE}" stroke-width="2" opacity="0.9"/>`);
parts.push(`<rect x="${L}" y="${vTop}" width="${R - L}" height="${vBottom - vTop}" fill="none" stroke="#CCC" stroke-width="1"/>`);

// ---- frame axis + window labels ------------------------------------------
const axisY = 592;
for (let f = 0; f < N; f += 1) {
  if (f % 10 === 0 || f === N - 1) {
    parts.push(`<line x1="${xOf(f).toFixed(1)}" y1="${axisY}" x2="${xOf(f).toFixed(1)}" y2="${axisY + 6}" stroke="#999" stroke-width="1"/>`);
    parts.push(`<text x="${xOf(f).toFixed(1)}" y="${axisY + 20}" font-size="11" text-anchor="middle" fill="#555">${f}</text>`);
  }
}
parts.push(`<text x="${(L + R) / 2}" y="${axisY + 40}" font-size="12" text-anchor="middle" fill="#333">timeline frame (0..93; gait sub-track period 26; near = far + 13)</text>`);
// window range labels along the top of the plot
for (const w of windows) {
  const xm = (xOf(w.start) + xOf(w.end)) / 2;
  parts.push(`<text x="${xm.toFixed(1)}" y="${plotTop - 4}" font-size="10" text-anchor="middle" fill="#B8860B">${w.side[0]}${w.start}–${w.end}</text>`);
}
parts.push(`<text x="${L}" y="${H - 8}" font-size="11" fill="#888">Deterministic visualization of solved-pose measurements (reports/foot-contact-evidence.json). Source review: frames/f_005–007, f_018–020 (+26 repeats). Not AI imagery.</text>`);
parts.push('</svg>');

fs.mkdirSync(path.dirname(OUT), {recursive: true});
fs.writeFileSync(OUT, parts.join('\n') + '\n');
console.log('wrote reports/foot-contact-timeline.svg (' + W + 'x' + H + '), frames=' + N + ', windows=' + windows.length);
