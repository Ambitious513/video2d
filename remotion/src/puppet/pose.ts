/**
 * Pose evaluator — samples the measured motion intent at an arbitrary frame
 * and solves the constrained skeleton. Pure function of (rig, clip, frame):
 * no mutable state, no render-order dependence (Remotion may request frame 72
 * before frame 71; every call recomputes from the same deterministic tracks).
 *
 * RAW vs SOLVED separation (master plan §5.2): raw hand-measured targets are
 * preserved untouched alongside the solved joints, with per-limb IK residuals
 * and mid-joint deviations, so a bad pose can be attributed to noisy reference
 * data, reachability, a bad pole hint, or rendering geometry.
 *
 * The motion intent itself still lives in keys.ts (measured gait keys +
 * Catmull-Rom tracks). Phase 2 will add the contact track / root-motion
 * contract on top of this evaluator; Phase 4 will generalize the clip source.
 */
import {HIP_X, HEAD_X, hipY, headY, cycleSample, LEG_CYCLE, armPose, type Pt} from './keys';
import {solveTwoBone, bendSideOf, type IkSolution} from './ik';
import {RUNNER_RIG, boneLengths, type RigDefinition, type LimbDef, type BoneId} from './rig';

export interface LegPose {
  hip: Pt;
  /** Solved joints (fixed bone lengths guaranteed by the IK solver). */
  knee: Pt;
  ankle: Pt;
  toe: Pt;
  /** Raw measured targets, never overwritten by solver output. */
  rawKnee: Pt;
  rawAnkle: Pt;
  rawToe: Pt;
  /** IK diagnostics for hip->knee->ankle (ankle is the end effector). */
  ik: IkSolution;
  /** Unit foot direction (raw ankle->toe intent), applied at the solved ankle. */
  footDirection: Pt;
}

export interface ArmPose {
  shoulder: Pt;
  elbow: Pt;
  fist: Pt;
  rawElbow: Pt;
  rawFist: Pt;
  ik: IkSolution;
}

export interface SolvedPose {
  frame: number;
  rigId: string;
  hip: Pt;
  head: Pt;
  shoulder: Pt;
  knot: Pt;
  pack: Pt;
  neckTop: Pt;
  nearLeg: LegPose;
  farLeg: LegPose;
  nearArm: ArmPose;
  farArm: ArmPose;
}

const add = (p: Pt, o: Pt): Pt => [p[0] + o[0], p[1] + o[1]];

/**
 * Solve one limb from raw intent. Exported for unit tests (mirrored facing,
 * synthetic targets) — the same generic path is used for every limb.
 * The raw mid target is NOT a hard constraint: with fixed bones the mid joint
 * is fully determined by the end target + bend hint; the raw mid is kept for
 * deviation reporting only.
 */
export function solveLimb(root: Pt, rawEnd: Pt, def: LimbDef): IkSolution {
  return solveTwoBone(root, rawEnd, def.upper, def.lower, def.bendSign);
}

function solveLeg(hip: Pt, raw: {knee: Pt; ankle: Pt; toe: Pt}, def: LimbDef, footLen: number): LegPose {
  const ik = solveLimb(hip, raw.ankle, def);
  const dx = raw.toe[0] - raw.ankle[0];
  const dy = raw.toe[1] - raw.ankle[1];
  const len = Math.hypot(dx, dy);
  // Deterministic fallback for a degenerate raw foot vector (never occurs in
  // the measured clip): point the foot forward (+x). Documented, not random.
  const ux = len > 1e-9 ? dx / len : 1;
  const uy = len > 1e-9 ? dy / len : 0;
  const ankle = ik.end;
  return {
    hip,
    knee: ik.mid,
    ankle,
    toe: [ankle[0] + ux * footLen, ankle[1] + uy * footLen],
    rawKnee: raw.knee,
    rawAnkle: raw.ankle,
    rawToe: raw.toe,
    ik,
    footDirection: [ux, uy],
  };
}

function solveArm(shoulder: Pt, raw: {elbow: Pt; fist: Pt}, def: LimbDef): ArmPose {
  const ik = solveLimb(shoulder, raw.fist, def);
  return {shoulder, elbow: ik.mid, fist: ik.end, rawElbow: raw.elbow, rawFist: raw.fist, ik};
}

/**
 * Evaluate the full constrained pose at a timeline frame (0..93 integer or
 * fractional; the underlying tracks are cyclic with period 26 for the gait).
 */
export function solvePose(frame: number, rig: RigDefinition = RUNNER_RIG): SolvedPose {
  const a = rig.anchors;
  const hip: Pt = [a.hipX, hipY(frame)];
  const head: Pt = [a.headX, headY(frame)];
  const shoulder: Pt = [a.shoulder.x, head[1] + a.shoulder.dyFromHead];
  const knot: Pt = [a.scarfKnot.x, head[1] + a.scarfKnot.dyFromHead];
  const pack: Pt = [a.backpack.x, head[1] + a.backpack.dyFromHead];
  const neckTop: Pt = [head[0] + a.neckTop.dxFromHead, head[1] + a.neckTop.dyFromHead];

  // Raw intent: measured leg cycle (near at f, far at f+13 — the symmetry
  // trick documented in keys.ts) and the measured arm swing, hip/shoulder-
  // relative -> canvas coordinates.
  const nl = cycleSample(LEG_CYCLE, frame);
  const fl = cycleSample(LEG_CYCLE, frame + 13);
  const na = armPose(frame, 0);
  const fa = armPose(frame, 13);

  return {
    frame,
    rigId: rig.id,
    hip, head, shoulder, knot, pack, neckTop,
    nearLeg: solveLeg(hip, {knee: add(nl.knee, hip), ankle: add(nl.ankle, hip), toe: add(nl.toe, hip)}, rig.legs.near, rig.footLen),
    farLeg: solveLeg(hip, {knee: add(fl.knee, hip), ankle: add(fl.ankle, hip), toe: add(fl.toe, hip)}, rig.legs.far, rig.footLen),
    nearArm: solveArm(shoulder, {elbow: add(na.elbow, shoulder), fist: add(na.fist, shoulder)}, rig.arms.near),
    farArm: solveArm(shoulder, {elbow: add(fa.elbow, shoulder), fist: add(fa.fist, shoulder)}, rig.arms.far),
  };
}

// --- Diagnostics -----------------------------------------------------------

export interface PoseDiagnostics {
  /** |solved bone length - configured length| per constrained bone (px). */
  boneLengthError: Record<BoneId, number>;
  /** |raw end target - solved end| per limb (px): 0 when reachable. */
  endResidual: {nearLeg: number; farLeg: number; nearArm: number; farArm: number};
  /** |solved mid - raw mid target| per limb (px): expected nonzero (noisy keys). */
  midDeviation: {nearLeg: number; farLeg: number; nearArm: number; farArm: number};
  /** Actual bend side of each solved limb (must equal the rig hint). */
  bendSide: {nearLeg: number; farLeg: number; nearArm: number; farArm: number};
  /** Which reach limit clamped each limb ('none' when reachable). */
  clamped: {nearLeg: string; farLeg: string; nearArm: string; farArm: string};
  /** Solved foot artwork length ankle->toe (constant by construction; NOT a bone). */
  footLength: {near: number; far: number};
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function diagnosePose(pose: SolvedPose, rig: RigDefinition = RUNNER_RIG): PoseDiagnostics {
  const cfg = boneLengths(rig);
  const {nearLeg: nl, farLeg: fl, nearArm: na, farArm: fa} = pose;
  return {
    boneLengthError: {
      nearThigh: Math.abs(dist(nl.hip, nl.knee) - cfg.nearThigh),
      nearCalf: Math.abs(dist(nl.knee, nl.ankle) - cfg.nearCalf),
      farThigh: Math.abs(dist(fl.hip, fl.knee) - cfg.farThigh),
      farCalf: Math.abs(dist(fl.knee, fl.ankle) - cfg.farCalf),
      nearUpperArm: Math.abs(dist(na.shoulder, na.elbow) - cfg.nearUpperArm),
      nearForearm: Math.abs(dist(na.elbow, na.fist) - cfg.nearForearm),
      farUpperArm: Math.abs(dist(fa.shoulder, fa.elbow) - cfg.farUpperArm),
      farForearm: Math.abs(dist(fa.elbow, fa.fist) - cfg.farForearm),
    },
    endResidual: {nearLeg: nl.ik.residual, farLeg: fl.ik.residual, nearArm: na.ik.residual, farArm: fa.ik.residual},
    midDeviation: {
      nearLeg: dist(nl.knee, nl.rawKnee), farLeg: dist(fl.knee, fl.rawKnee),
      nearArm: dist(na.elbow, na.rawElbow), farArm: dist(fa.elbow, fa.rawElbow),
    },
    bendSide: {
      nearLeg: bendSideOf(nl.hip, nl.knee, nl.ankle),
      farLeg: bendSideOf(fl.hip, fl.knee, fl.ankle),
      nearArm: bendSideOf(na.shoulder, na.elbow, na.fist),
      farArm: bendSideOf(fa.shoulder, fa.elbow, fa.fist),
    },
    clamped: {nearLeg: nl.ik.clamped, farLeg: fl.ik.clamped, nearArm: na.ik.clamped, farArm: fa.ik.clamped},
    footLength: {near: dist(nl.ankle, nl.toe), far: dist(fl.ankle, fl.toe)},
  };
}
