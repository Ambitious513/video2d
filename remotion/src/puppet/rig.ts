/**
 * Rig definition — anatomy and constraints for the procedural puppet.
 *
 * Owns: skeleton joint names, fixed rest bone lengths, bend-side hints, foot
 * geometry length, and named attachment anchors. Does NOT own colors, gait
 * timing, or SVG markup (those live in keys.ts / Runner.tsx until Phases 3-4
 * separate appearance and motion fully).
 *
 * Units: 1920x1080 canvas pixels, y down, 24 fps. Character faces +x.
 *
 * BONE-LENGTH CALIBRATION (Phase 1, documented method — reproducible via
 * calibrateRunnerRig() below and asserted by remotion/test/rig.test.ts):
 *
 *   Legs (14 raw measured poses: 7 near + 7 far in keys.ts):
 *     - The raw hip->ankle spans reach 363.32 px at the most extended measured
 *       pose. A fixed bone pair must reach every measured ankle target, so
 *       total leg length T = maxSpan + 0.5 px reach margin = 363.82 px.
 *       (Sensitivity checked: larger totals strictly worsen the knee fit.)
 *     - The thigh/calf split minimizes sum of squared deviations of the IK
 *       knee from the 14 measured knee positions (scan l1 in [140, 220] step
 *       0.25, l2 = T - l1, knee bend side -1). Result: 186.00 / 177.82.
 *     - Raw knee targets are NOISY (hip->knee readings vary 121.7..238.2 px,
 *       1.958x). The solver hits every ankle target exactly and lets the knee
 *       deviate from its noisy reading (rms ~54.6 px, max ~73.9 px across the
 *       14 poses; per-frame deviations are reported, never hidden).
 *
 *   Arms (2 measured extremes ARM_FWD / ARM_BACK in keys.ts):
 *     - Upper arm: the two extreme readings agree (117.2 / 114.6 px), so
 *       upperArm = their mean = 115.91 px.
 *     - Forearm: the extremes DISAGREE (131.1 fwd vs 92.0 back). The back
 *       pose is near-straight (span 205.65 ~= 114.6 + 92.0 = 206.6), so its
 *       forearm reading is the reliable one; the fwd reading would force a
 *       visible bend into a measured straight-arm pose. lowerArm = 91.97 px
 *       (the rounded back-extreme measurement; an earlier draft stored 92.00,
 *       a manual round-up corrected to keep stored == calibrated exactly).
 *       A least-squares elbow fit over both extremes confirms the optimum
 *       sits at the reachability boundary (~90.25), i.e. the smallest forearm
 *       that keeps every fist target reachable — 91.97 is the measurement-
 *       consistent choice just above it. Guard: if upperArm + lowerArm ever
 *       fails to reach the max fist span over the 26-frame swing (incl. the
 *       mid-swing bulge), lowerArm is raised to the reachability minimum.
 *     - Elbow bend side +1 (elbow trails behind the hand). The raw back
 *       extreme reads ~10 px to the other side of the shoulder->fist line —
 *       measurement noise around a straight arm, not a real bend reversal.
 *
 *   Foot: NOT a bone. ankle->toe is a foot control vector; its artwork length
 *     is fixed at the median of the 14 raw ankle->toe readings (87.30 px —
 *     mean of the two middle sorted readings; an earlier draft stored 87.32,
 *     the upper-middle element, corrected to the true median) and oriented
 *     along the raw ankle->toe direction from the SOLVED ankle.
 *     Foot roll/pivots are Phase 2/3 work; the length is stable now.
 *
 * Bend-side convention: see ik.ts (sign of cross(root->target, root->mid)).
 * Knees -1 (front/+x), elbows +1 (back). Mirroring flips x and the sign.
 */
import {NEAR_LEG_RAW, FAR_LEG_RAW, ARM_FWD, ARM_BACK, armPose, HIP_X, HEAD_X, HEAD_R, LOOP} from './keys';
import {solveTwoBone, type Pt} from './ik';

export interface LimbDef {
  /** Root->middle bone length (px): hip->knee or shoulder->elbow. */
  upper: number;
  /** Middle->end bone length (px): knee->ankle or elbow->fist. */
  lower: number;
  /** Explicit bend-side hint (ik.ts convention). Never inferred per-frame. */
  bendSign: 1 | -1;
}

export interface RigDefinition {
  id: string;
  legs: {near: LimbDef; far: LimbDef};
  arms: {near: LimbDef; far: LimbDef};
  /** Stable foot artwork length ankle->toe (px). Foot geometry, NOT a bone. */
  footLen: number;
  /** Named attachment anchors. x absolute; y offsets from the head-track Y. */
  anchors: {
    hipX: number;
    headX: number;
    headR: number;
    shoulder: {x: number; dyFromHead: number};
    scarfKnot: {x: number; dyFromHead: number};
    backpack: {x: number; dyFromHead: number};
    neckTop: {dxFromHead: number; dyFromHead: number};
  };
}

/** Reach margin (px) added to the max measured span when calibrating totals. */
export const REACH_MARGIN = 0.5;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Reproducible derivation of the runner rig lengths from the raw measured
 * keys (method documented in the file header). Pure; deterministic; used by
 * rig.test.ts to prove the stored constants below are the calibrated ones.
 */
export function calibrateRunnerRig(): {
  upperLeg: number; lowerLeg: number; upperArm: number; lowerArm: number; footLen: number;
  maxLegSpan: number; maxArmSpan: number; legKneeRmsDeviation: number; legKneeMaxDeviation: number;
} {
  const poses = [...NEAR_LEG_RAW, ...FAR_LEG_RAW];
  const maxLegSpan = Math.max(...poses.map((p) => dist(p.hip, p.ankle)));
  const total = maxLegSpan + REACH_MARGIN;

  let best: {l1: number; err: number} | null = null;
  for (let l1 = 140; l1 <= 220; l1 += 0.25) {
    const l2 = total - l1;
    if (l2 < 100) continue;
    let err = 0;
    for (const p of poses) {
      const sol = solveTwoBone(p.hip, p.ankle, l1, l2, -1);
      err += dist(sol.mid, p.knee) ** 2;
    }
    if (!best || err < best.err) best = {l1, err};
  }
  if (!best) throw new Error('calibrateRunnerRig: leg fit found no candidate');
  const upperLeg = round2(best.l1);
  const lowerLeg = round2(total - best.l1);

  // Arm calibration from the two measured extremes (see header).
  const upperArm = round2((Math.hypot(ARM_FWD.elbow[0], ARM_FWD.elbow[1]) + Math.hypot(ARM_BACK.elbow[0], ARM_BACK.elbow[1])) / 2);
  let lowerArm = round2(dist(ARM_BACK.elbow, ARM_BACK.fist));
  let maxArmSpan = 0;
  for (let f = 0; f < LOOP; f++) {
    const a = armPose(f, 0);
    maxArmSpan = Math.max(maxArmSpan, Math.hypot(a.fist[0], a.fist[1]));
  }
  if (upperArm + lowerArm < maxArmSpan + REACH_MARGIN) {
    lowerArm = round2(maxArmSpan + REACH_MARGIN - upperArm);
  }

  const footLens = poses.map((p) => dist(p.ankle, p.toe)).sort((a, b) => a - b);
  const mid = footLens.length >> 1;
  const footLen = round2((footLens[mid - 1] + footLens[mid]) / 2);

  // Deviation statistics of the fitted knee vs the raw measured knees.
  let sum = 0, max = 0;
  for (const p of poses) {
    const dv = dist(solveTwoBone(p.hip, p.ankle, upperLeg, lowerLeg, -1).mid, p.knee);
    sum += dv * dv;
    max = Math.max(max, dv);
  }
  return {
    upperLeg, lowerLeg, upperArm, lowerArm, footLen,
    maxLegSpan, maxArmSpan,
    legKneeRmsDeviation: Math.sqrt(sum / poses.length),
    legKneeMaxDeviation: max,
  };
}

/**
 * The runner rig — stored calibrated constants. Derivation: calibrateRunnerRig()
 * above; remotion/test/rig.test.ts asserts stored == calibrated within 1e-9 px
 * (exact reproducibility from the raw measured keys — no magic numbers).
 * Near/far limbs are separate entries so future character rigs can differ per
 * side; this character is left/right symmetric, so the values match.
 */
export const RUNNER_RIG: RigDefinition = {
  id: 'runner',
  legs: {
    near: {upper: 186.0, lower: 177.82, bendSign: -1},
    far: {upper: 186.0, lower: 177.82, bendSign: -1},
  },
  arms: {
    near: {upper: 115.91, lower: 91.97, bendSign: 1},
    far: {upper: 115.91, lower: 91.97, bendSign: 1},
  },
  footLen: 87.3,
  anchors: {
    hipX: HIP_X,
    headX: HEAD_X,
    headR: HEAD_R,
    shoulder: {x: 922, dyFromHead: 154},
    scarfKnot: {x: 940, dyFromHead: 112},
    backpack: {x: 818, dyFromHead: 222},
    neckTop: {dxFromHead: -18, dyFromHead: 62},
  },
};

/** Constrained bone identifiers (feet are geometry, not bones — excluded). */
export const BONE_IDS = [
  'nearThigh', 'nearCalf', 'farThigh', 'farCalf',
  'nearUpperArm', 'nearForearm', 'farUpperArm', 'farForearm',
] as const;
export type BoneId = (typeof BONE_IDS)[number];

/** Configured length of each constrained bone for a rig. */
export function boneLengths(rig: RigDefinition): Record<BoneId, number> {
  return {
    nearThigh: rig.legs.near.upper,
    nearCalf: rig.legs.near.lower,
    farThigh: rig.legs.far.upper,
    farCalf: rig.legs.far.lower,
    nearUpperArm: rig.arms.near.upper,
    nearForearm: rig.arms.near.lower,
    farUpperArm: rig.arms.far.upper,
    farForearm: rig.arms.far.lower,
  };
}
