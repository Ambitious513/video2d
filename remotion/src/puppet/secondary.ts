/**
 * Phase 3b — deterministic secondary motion (scarf chain + backpack lag).
 *
 * Everything here is a PURE function of (frame, params): no mutable state, no
 * render-order dependence (master plan §2.3). The scarf is a fixed-length chain
 * whose shape at frame f is a closed-form traveling wave with per-node phase
 * lag (gravity droop + delayed response); the backpack rides the torso with a
 * small deterministic bob/lag. Sampling any frame in isolation (or out of
 * order) always yields the same result.
 *
 * The knot is the chain root (attached to the scarf-knot anchor); node 0 IS the
 * knot. Segment lengths are fixed by construction (each node is placed at a
 * fixed distance from the previous one along a unit direction), so the scarf
 * never stretches arbitrarily. The tail curls and its response lags the knot.
 */

export type Pt = [number, number];

export interface ScarfParams {
  /** Segment length (px) between consecutive nodes. */
  segLen: number;
  /** Base direction (radians) of the tail relative to +x (negative = up-back). */
  baseAngle: number;
  /** Gravity droop (px) applied progressively toward the tail. */
  gravity: number;
  /** Traveling-wave amplitude (radians) of the heading. */
  waveAmp: number;
  /** Frames per full heading-wave cycle. */
  wavePeriod: number;
  /** Per-node phase lag (radians) — the delayed response down the chain. */
  phaseLag: number;
  /** Per-node traveling-wave phase step (radians). */
  waveStep: number;
  /** Heading clamp (radians) so the tail cannot flip upward/backward. */
  headingMin: number;
  headingMax: number;
}

/** Tuned to the original runner scarf silhouette (cream ribbon, trailing -x). */
export const RUNNER_SCARF: ScarfParams = {
  segLen: 72,
  baseAngle: Math.PI * 0.94, // ~169deg: trailing -x, slightly up
  gravity: 44,
  waveAmp: 0.16,
  wavePeriod: 26,
  phaseLag: 0.85,
  waveStep: 0.55,
  headingMin: Math.PI * 0.6,
  headingMax: Math.PI * 1.12,
};

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Scarf node positions for a frame. Returns N+1 points: node 0 == knot, then N
 * tail nodes. Pure and deterministic for any real frame.
 */
export function scarfNodes(knot: Pt, frame: number, p: ScarfParams = RUNNER_SCARF): Pt[] {
  const N = 6;
  const out: Pt[] = [[knot[0], knot[1]]];
  let ang = p.baseAngle;
  let x = knot[0], y = knot[1];
  for (let i = 1; i <= N; i++) {
    const t = frame - (i - 1) * p.phaseLag;
    const wave = p.waveAmp * Math.sin((TAU * t) / p.wavePeriod - (i - 1) * p.waveStep);
    const droop = p.gravity * (i / N) * (i / N);
    ang = clamp(p.baseAngle + wave + droop / p.segLen, p.headingMin, p.headingMax);
    x += Math.cos(ang) * p.segLen;
    y += Math.sin(ang) * p.segLen;
    out.push([x, y]);
  }
  return out;
}

/** Backpack vertical bob / lag (px) relative to its torso anchor. */
export function backpackBob(frame: number): number {
  return 3 * Math.sin((TAU * frame) / 13) + 1.5 * Math.sin((TAU * frame) / 6.5 + 1.1);
}

/** Backpack horizontal lag (px) relative to its torso anchor. */
export function backpackLagX(frame: number): number {
  return 2 * Math.sin((TAU * frame) / 13 + 0.7);
}