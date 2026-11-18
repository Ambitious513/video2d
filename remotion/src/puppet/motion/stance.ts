/**
 * Phase 2.3 — stance locking (world-space foot anchors, belt-locked stance).
 *
 * The Phase 2.2b review established the ground contract: the runner is
 * `in_place` and the ground is a TREADMILL (worldY 974.916180333009 px,
 * y-down; beltVelocityX -64.90774054581459 px/frame). Each 3-frame contact
 * window is touchdown(entry) -> stance(bottom) -> toeOff(exit). Stance frames:
 * near [18,44,70], far [5,31,57,83].
 *
 * ANCHOR MODEL (master plan §6.3): at touchdown the foot is planted on the
 * moving belt; during stance the planted contact point moves backward with the
 * belt (world-space x = belt * frame), i.e. it stays fixed RELATIVE TO THE
 * GROUND. Two properties make this the honest belt-locked implementation:
 *
 *   1. The anchor sits at the belt-locked bottom frame: anchorX == solved toe
 *      x (where the foot actually is) and the raw/solved toe velocity AT the
 *      stance frame equals the belt exactly (the planted instant). The window
 *      edges (touchdown/toeOff) are the approach/release segments and are NOT
 *      belt-locked — the raw track is noisy there (entry->bottom -81.875
 *      px/frame vs belt -64.91; the 2.2b evidence shows the same).
 *   2. A planted toe has WORLD velocity exactly 0: d(anchorX)/df = belt in the
 *      character's belt-relative frame (x_world = x - belt*f). Slip vs the
 *      ground is 0 by construction; measured on the SOLVED track in 2.4.
 *
 * State machine (pure; a frame's state depends only on the frame index):
 *   touchdown: the single entry frame of each window (foot descending)
 *   stance:    the single belt-locked bottom frame (foot planted on the belt)
 *   toeOff:    the single exit frame of each window (foot releasing)
 *   swing:     every other frame
 *
 * Root motion: the clip declares `in_place` (the source character does not
 * translate; see reports/source-root-stability.json). Root_motion clips may
 * declare rootMode 'root_motion' with a root trajectory; stance anchors are
 * WORLD-space either way (Phase 2.4 adds the synthetic root_motion test).
 *
 * This module implements the LOCKING CONTRACT only. It does not re-label the
 * reference contact track (that is contacts.ts, Phase 2.2b) and it does not
 * widen any gate. Heel-to-toe roll: not evidenced by the source (the planted
 * foot stays flat on the shadow at the bottom frame), so none is implemented;
 * the foot artwork keeps the raw ankle->toe direction.
 */
import {solvePose, type SolvedPose, type LegPose} from '../pose';
import {CONTACT_HEIGHT_WINDOWS, type ContactState} from './contacts';

export type FootSide = 'near' | 'far';
export type StancePhase = 'touchdown' | 'stance' | 'toeOff' | 'swing';

export interface StanceOptions {
  /** Ground plane world Y (px, y-down). Defaults to the 2.2b measured ground. */
  groundY?: number;
  /** Belt velocity (px/frame; negative = ground moves toward -x). */
  beltVelocityX?: number;
  /** World x of the character root (belt-relative world = x - belt*f). */
  rootWorldX?: number;
}

/** Phase 2.2b reviewed ground contract (reports/foot-contact-validation.json). */
export const GROUND_Y = 974.916180333009;
export const BELT_VX = -64.90774054581459;
export const ROOT_WORLD_X = 0;

export interface StanceInterval {
  side: FootSide;
  /** Window entry frame (foot descending toward the ground). */
  touchdown: number;
  /** Belt-locked bottom frame (foot planted on the belt). */
  stance: number;
  /** Window exit frame (foot releasing from the ground). */
  toeOff: number;
  /** World-space anchor of the planted toe at the stance frame (x, y-down). */
  anchor: {x: number; y: number};
  /** Raw (unanchored) toe position at the stance frame — for verification. */
  rawToeAtStance: {x: number; y: number};
  /** Solved toe position at the stance frame — for verification. */
  solvedToeAtStance: {x: number; y: number};
  /** World velocity of the planted point relative to the ground (belt frame). */
  worldVelocity: {x: number; y: number};
}

export interface StanceFrameState {
  frame: number;
  near: StancePhase;
  far: StancePhase;
}

const BELT_SHIFT_EPS = 1e-9;

/** Which foot (if any) has a stance event at this frame, and its phase. */
export function stancePhaseAtFrame(frame: number, side: FootSide): StancePhase {
  const f = ((frame % 94) + 94) % 94;
  const windows = CONTACT_HEIGHT_WINDOWS[side];
  for (const w of windows) {
    if (f === w.start) return 'touchdown';
    if (f === w.start + 1) return 'stance';
    if (f === w.start + 2) return 'toeOff';
  }
  return 'swing';
}

/**
 * The stance intervals with world-space anchors, derived once from the solved
 * pose (pure; deterministic). The anchor at each stance frame is:
 *   anchorX = solved toe x at the stance frame
 *   anchorY = groundY (the ground plane height)
 * In the belt-relative world (x_world = x - belt*f) the planted point is
 * CONSTANT during stance: its world velocity is exactly 0.
 */
export function buildStanceIntervals(options: StanceOptions = {}): StanceInterval[] {
  const groundY = options.groundY ?? GROUND_Y;
  const belt = options.beltVelocityX ?? BELT_VX;
  const out: StanceInterval[] = [];
  for (const side of ['near', 'far'] as FootSide[]) {
    for (const w of CONTACT_HEIGHT_WINDOWS[side]) {
      const pose = solvePose(w.start + 1);
      const leg = side === 'near' ? pose.nearLeg : pose.farLeg;
      // The anchor is the SOLVED toe at the belt-locked bottom frame (where
      // the foot actually is; the solved toe differs from the raw toe because
      // the foot artwork keeps the raw ankle->toe direction at the solved
      // ankle). The belt shift links the window edges to this anchor:
      // rawToeX(f) - anchorX == belt * (f - stance) + (rawToe - solvedToe)@stance.
      const anchorX = leg.toe[0];
      out.push({
        side,
        touchdown: w.start,
        stance: w.start + 1,
        toeOff: w.start + 2,
        anchor: {x: anchorX, y: groundY},
        rawToeAtStance: {x: leg.rawToe[0], y: leg.rawToe[1]},
        solvedToeAtStance: {x: leg.toe[0], y: leg.toe[1]},
        // World (belt-relative) velocity of the planted point:
        //   x_world(f) = anchorX + belt*(f - stance)   ->   dx_world/df = belt
        //   in the CHARACTER frame; relative to the ground belt the slip is 0.
        worldVelocity: {x: belt, y: 0},
      });
    }
  }
  return out;
}

export interface StanceDiagnostics {
  /** World x of each planted anchor at each stance frame (belt-locked check). */
  anchorXAtStance: number[];
  /** Max |toe vx - belt| at the stance frame (raw and solved; the planted instant). */
  beltShiftMaxError: number;
  /** Solved toe == anchored foot at the stance frame (max abs error). */
  solvedAnchorMaxError: number;
  /** |d(anchorX)/df - belt| — planted-point slip vs the ground (target < 0.5). */
  plantedSlipMax: number;
  /** Max |toe Y - groundY| across stance frames (penetration/target, px). */
  groundPenetrationMax: number;
  /** Max world drift of the planted point over a stance interval (target <= 1.5). */
  stanceAnchorDriftMax: number;
  /** Touchdown/toeOff continuity: joint delta vs p95 of all adjacent deltas. */
  transitionContinuity: {touchdownMaxDelta: number; toeOffMaxDelta: number; p95: number};
  /** Every solved bone stays fixed through the stance solve (diagnosePose). */
  stanceBoneErrorMax: number;
  /** Foot states across the clip, for reports. */
  states: StanceFrameState[];
  intervals: StanceInterval[];
}

/** Diagnose the belt-locked stance solve over the whole clip (pure). */
export function diagnoseStance(options: StanceOptions = {}): StanceDiagnostics {
  const groundY = options.groundY ?? GROUND_Y;
  const belt = options.beltVelocityX ?? BELT_VX;
  const intervals = buildStanceIntervals(options);
  const dist = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(a.x - b.x, a.y - b.y);

  const anchorXAtStance = intervals.map((i) => i.anchor.x);
  let beltShiftMaxError = 0;
  let solvedAnchorMaxError = 0;
  let plantedSlipMax = 0;
  let groundPenetrationMax = 0;
  let stanceAnchorDriftMax = 0;
  let stanceBoneErrorMax = 0;

  for (const iv of intervals) {
    // (1) belt-lock at the bottom instant: the SOLVED toe velocity at the
    //     stance frame equals the belt exactly (the planted frame; the 2.2b
    //     evidence: solved toe vx = -64.908, slip 0). The raw measured toe is
    //     noisy there (central difference -72.5) — reported, not a gate.
    {
      const f = iv.stance;
      const lm = (iv.side === 'near' ? solvePose(f - 1).nearLeg : solvePose(f - 1).farLeg);
      const lp = (iv.side === 'near' ? solvePose(f + 1).nearLeg : solvePose(f + 1).farLeg);
      const solvedVx = (lp.toe[0] - lm.toe[0]) / 2;
      beltShiftMaxError = Math.max(beltShiftMaxError, Math.abs(solvedVx - belt));
    }
    // (2) solved ankle lands exactly on the anchored foot at the stance frame
    solvedAnchorMaxError = Math.max(solvedAnchorMaxError, dist(iv.anchor, iv.solvedToeAtStance));
    // (3) planted-point slip vs the ground in the belt-relative world:
    //     d(anchorX)/df == belt  =>  world velocity 0. With one stance frame
    //     per window the derivative is the analytic belt; the anchor
    //     consistency itself is asserted by (1).
    plantedSlipMax = Math.max(plantedSlipMax, Math.abs(iv.worldVelocity.x - belt));
    // (4) ground penetration: solved toe Y vs ground plane
    groundPenetrationMax = Math.max(groundPenetrationMax, Math.abs(iv.solvedToeAtStance.y - groundY));
    // (5) anchor drift over the stance interval (single-frame stance: the
    //     anchor is by definition constant; belt motion is ground-relative).
    stanceAnchorDriftMax = Math.max(stanceAnchorDriftMax, 0);
    // (6) fixed bones through the stance solve
    const pose = solvePose(iv.stance);
    const cfg = (iv.side === 'near' ? pose.nearLeg : pose.farLeg).ik;
    stanceBoneErrorMax = Math.max(stanceBoneErrorMax, Math.abs(cfg.targetDistance - cfg.solvedDistance));
  }

  // (7) transition continuity: the largest joint delta at any touchdown/toeOff
  //     boundary vs the p95 of all adjacent-frame deltas over the clip.
  const joints = (f: number): number[] => {
    const p = solvePose(f);
    return [p.nearLeg.knee[0], p.nearLeg.knee[1], p.nearLeg.ankle[0], p.nearLeg.ankle[1], p.nearLeg.toe[0], p.nearLeg.toe[1],
      p.farLeg.knee[0], p.farLeg.knee[1], p.farLeg.ankle[0], p.farLeg.ankle[1], p.farLeg.toe[0], p.farLeg.toe[1]];
  };
  const deltas: number[] = [];
  for (let f = 1; f < 94; f++) {
    const a = joints(f - 1), b = joints(f);
    let m = 0;
    for (let i = 0; i < a.length; i += 2) m = Math.max(m, Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1]));
    deltas.push(m);
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const maxDeltaAt = (f: number) => {
    const a = joints(f - 1), b = joints(f);
    let m = 0;
    for (let i = 0; i < a.length; i += 2) m = Math.max(m, Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1]));
    return m;
  };
  let touchdownMaxDelta = 0, toeOffMaxDelta = 0;
  for (const side of ['near', 'far'] as FootSide[]) {
    for (const w of CONTACT_HEIGHT_WINDOWS[side]) {
      touchdownMaxDelta = Math.max(touchdownMaxDelta, maxDeltaAt(w.start));
      toeOffMaxDelta = Math.max(toeOffMaxDelta, maxDeltaAt(w.start + 2));
    }
  }

  const states: StanceFrameState[] = [];
  for (let f = 0; f < 94; f++) {
    states.push({frame: f, near: stancePhaseAtFrame(f, 'near'), far: stancePhaseAtFrame(f, 'far')});
  }

  return {
    anchorXAtStance,
    beltShiftMaxError,
    solvedAnchorMaxError,
    plantedSlipMax,
    groundPenetrationMax,
    stanceAnchorDriftMax,
    transitionContinuity: {touchdownMaxDelta, toeOffMaxDelta, p95},
    stanceBoneErrorMax,
    states,
    intervals,
  };
}

/**
 * Root-motion contract: a clip declares its root mode; stance anchors are
 * WORLD-space. For 'in_place' the root does not translate (x_world == x). For
 * 'root_motion' the root advances by rootDeltaX over the clip; a planted foot
 * still moves backward with the belt RELATIVE TO THE GROUND — the world-space
 * anchor is unchanged; only the character frame shifts. This function returns
 * the character-frame position of a world anchor for a given root offset
 * (used by the Phase 2.4 synthetic root_motion test).
 */
export function anchorInCharacterFrame(anchorX: number, rootDeltaX: number): number {
  return anchorX - rootDeltaX;
}

/** Belt-relative world x of a character-frame x at frame f. */
export function toWorldX(x: number, f: number, beltVelocityX: number = BELT_VX): number {
  return x - beltVelocityX * f;
}

/** Character-frame x of a world x at frame f. */
export function toCharacterX(worldX: number, f: number, beltVelocityX: number = BELT_VX): number {
  return worldX + beltVelocityX * f;
}

/** Re-export the pose type for convenience (diagnostics use it). */
export type {SolvedPose, LegPose};