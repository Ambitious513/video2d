/**
 * Gait keyframes measured from the source video (1920x1080 @ 24fps).
 * The source loop is 26 frames (one full left+right stride); the vertical
 * bounce repeats every 13 frames (one step). Limb coordinates were read off
 * a 40px measurement grid overlaid on the extracted frames.
 *
 * Trick that halves the work: the run is left/right symmetric, so the FAR
 * (darker) limb at frame f matches the NEAR (lighter) limb at frame f+13.
 * We therefore store one 26-sample leg cycle built from the near-leg keys
 * (frames 1..13) followed by the far-leg keys (frames 1..13), and derive the
 * far limb by shifting the cycle 13 frames.
 */

export type Pt = [number, number];

export const FPS = 24;
export const LOOP = 26; // frames per full stride
export const STEP = 13; // frames per step (bounce period)
export const DURATION = 94; // frames in the source clip

// --- Hip / head bounce (period 13), keyed at frames 1,3,5,7,9,11,13 ---
const bounceKeys = [592, 600, 612, 615, 595, 580, 585]; // hip Y
const headKeys = [248, 262, 282, 285, 262, 242, 242]; // head center Y
export const HIP_X = 864;
export const HEAD_X = 978;
export const HEAD_R = 86;

// --- Leg keys, hip-relative [knee, ankle, toe] ---
// NEAR (lighter) leg, frames 1,3,5,7,9,11,13
const nearLegRaw: { hip: Pt; knee: Pt; ankle: Pt; toe: Pt }[] = [
  { hip: [868, 592], knee: [688, 748], ankle: [592, 692], toe: [533, 762] },
  { hip: [862, 600], knee: [755, 760], ankle: [615, 700], toe: [555, 758] },
  { hip: [858, 612], knee: [800, 775], ankle: [655, 720], toe: [600, 762] },
  { hip: [870, 615], knee: [890, 735], ankle: [755, 775], toe: [735, 850] },
  { hip: [868, 595], knee: [785, 715], ankle: [675, 880], toe: [695, 965] },
  { hip: [862, 580], knee: [715, 700], ankle: [600, 790], toe: [583, 880] },
  { hip: [860, 585], knee: [950, 690], ankle: [1030, 880], toe: [1120, 872] },
];
// FAR (darker) leg, frames 1,3,5,7,9,11,13
const farLegRaw: { hip: Pt; knee: Pt; ankle: Pt; toe: Pt }[] = [
  { hip: [862, 592], knee: [952, 700], ankle: [1035, 893], toe: [1122, 886] },
  { hip: [858, 600], knee: [935, 735], ankle: [1010, 930], toe: [1100, 935] },
  { hip: [856, 612], knee: [905, 780], ankle: [905, 955], toe: [990, 968] },
  { hip: [866, 615], knee: [850, 800], ankle: [790, 940], toe: [855, 965] },
  { hip: [862, 595], knee: [960, 690], ankle: [868, 820], toe: [893, 900] },
  { hip: [858, 580], knee: [955, 680], ankle: [965, 850], toe: [1050, 882] },
  { hip: [856, 585], knee: [690, 735], ankle: [590, 685], toe: [532, 755] },
];

const rel = (raw: typeof nearLegRaw) =>
  raw.map((k) => ({
    knee: [k.knee[0] - k.hip[0], k.knee[1] - k.hip[1]] as Pt,
    ankle: [k.ankle[0] - k.hip[0], k.ankle[1] - k.hip[1]] as Pt,
    toe: [k.toe[0] - k.hip[0], k.toe[1] - k.hip[1]] as Pt,
  }));

// Build a 26-sample cyclic track by sampling the 7 keys (Catmull-Rom) at the
// 13 integer frames of each half, then concatenating near + far halves.
function buildLegCycle() {
  const near = rel(nearLegRaw);
  const far = rel(farLegRaw);
  const sampleHalf = (keys: typeof near) => {
    const out: typeof near = [];
    for (let f = 0; f < STEP; f++) {
      const t = (f / (STEP - 1)) * (keys.length - 1); // 0..6 across 13 frames
      out.push({
        knee: catmull(keys.map((k) => k.knee), t),
        ankle: catmull(keys.map((k) => k.ankle), t),
        toe: catmull(keys.map((k) => k.toe), t),
      });
    }
    return out;
  };
  return [...sampleHalf(near), ...sampleHalf(far)];
}
export const LEG_CYCLE = buildLegCycle(); // 26 samples, cyclic

// --- Catmull-Rom helpers ---
export function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export function catmull(pts: Pt[], t: number): Pt {
  const n = pts.length;
  const i = Math.floor(t);
  const f = t - i;
  const g = (k: number) => pts[Math.max(0, Math.min(n - 1, k))];
  const a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2);
  return [cr(a[0], b[0], c[0], d[0], f), cr(a[1], b[1], c[1], d[1], f)];
}
// cyclic sampling of a 26-sample track at fractional frame
export function cycleSample(track: { knee: Pt; ankle: Pt; toe: Pt }[], frame: number) {
  const n = track.length;
  const x = ((frame % n) + n) % n;
  const i = Math.floor(x), f = x - i;
  const g = (k: number) => track[((k % n) + n) % n];
  const a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2);
  const mix = (sel: (s: typeof a) => Pt): Pt => [
    cr(sel(a)[0], sel(b)[0], sel(c)[0], sel(d)[0], f),
    cr(sel(a)[1], sel(b)[1], sel(c)[1], sel(d)[1], f),
  ];
  return { knee: mix((s) => s.knee), ankle: mix((s) => s.ankle), toe: mix((s) => s.toe) };
}
// periodic bounce value (period 13) at fractional frame
export function bounce(frame: number, keys: number[]) {
  const n = keys.length; // 7 keys over 13 frames
  const x = (((frame % STEP) + STEP) % STEP) / STEP * n; // 0..7 cyclic
  const i = Math.floor(x), f = x - i;
  const g = (k: number) => keys[((k % n) + n) % n];
  return cr(g(i - 1), g(i), g(i + 1), g(i + 2), f);
}

export const hipY = (f: number) => bounce(f, bounceKeys);
export const headY = (f: number) => bounce(f, headKeys);

// --- Arms: 2-pose sinusoidal swing with a downward mid arc ---
// measured forward (f1) & back (f13) poses, shoulder-relative
export const ARM_FWD = { elbow: [50, 106] as Pt, fist: [166, 45] as Pt };
export const ARM_BACK = { elbow: [-67, 93] as Pt, fist: [-134, 156] as Pt };
export function armPose(frame: number, phaseShift = 0) {
  const p = Math.cos((2 * Math.PI * (frame + phaseShift)) / LOOP); // +1 fwd, -1 back
  const k = (p + 1) / 2;
  const bulge = 1 - p * p;
  const lerp = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const elbow = lerp(ARM_BACK.elbow, ARM_FWD.elbow);
  const fist = lerp(ARM_BACK.fist, ARM_FWD.fist);
  elbow[1] += 40 * bulge;
  fist[1] += 80 * bulge;
  return { elbow, fist };
}

// --- Shadow: wide at contact, narrow at passing ---
export function shadow(frame: number) {
  const s = Math.abs(Math.cos((2 * Math.PI * frame) / LOOP));
  return { rx: 120 + 185 * s, ry: 9 + 5 * s, opacity: 0.55 + 0.35 * s };
}

// --- Palette (sampled from source) ---
export const C = {
  bg: '#FFFFFF',
  body: '#686D75',
  bodyLt: '#767B84',
  far: '#4E5561',
  line: '#30303A',
  scarf: '#F3E9D3',
  scarfSh: '#E3D9C6',
  pack: '#C6BAB0',
  packLt: '#D9CEC4',
  packDk: '#36374C',
  eye: '#272A3E',
  shadow: '#DCDBDE',
};
