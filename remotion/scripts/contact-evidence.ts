/**
 * Phase 2.2b — treadmill-vs-root_motion EVIDENCE diagnostic (pure, deterministic).
 *
 * Reuses the Phase 1 pose evaluator (solvePose); NO new dependencies, NO image
 * IO, NO mutable state. Writes reports/foot-contact-evidence.json.
 * Run: npm run verify:contact-evidence
 *
 * Answers three questions from master plan §6.2/§6.4 and the 2.2b brief:
 *   1. ROOT STABILITY — does the character root translate horizontally across
 *      the 94-frame clip? A constant hip X rules out root_motion for this clip
 *      (in_place). This is the puppet-track view; the independent SOURCE-image
 *      confirmation lives in scripts/source-root-stability.mjs.
 *   2. TREADMILL TEST — during each contact-height window, is the toe moving
 *      backward at a consistent belt speed with near-zero height and small |vy|?
 *      A foot planted on a STATIC ground would have vx≈0; a foot planted on a
 *      backward-moving belt has vx≈belt. We report per-frame toe/ankle height +
 *      velocity and the deviation of toe vx from the belt estimate.
 *   3. BELT CONSISTENCY — does ONE belt speed explain all windows (near + far)?
 *      We report the bottom-frame (lowest toe) velocity per window and whether
 *      the WHOLE window stays within the stance slip tolerance, or only the
 *      bottom instant does (the rest being touchdown approach / toe-off release).
 *
 * This script ASSERTS NOTHING about verified stance. It produces measurements
 * and an evidence-based suggested role per frame; the reviewed labels are
 * finalized deliberately in src/puppet/motion/contacts.ts after manual review.
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {solvePose, type SolvedPose, type LegPose} from '../src/puppet/pose';
import {DURATION, HIP_X} from '../src/puppet/keys';
import {runCycleContactTrack, expandTrack, CONTACT_HEIGHT_WINDOWS} from '../src/puppet/motion/contacts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../reports/foot-contact-evidence.json');

/** Contact-height window threshold (px) — identical to contact-candidates.ts. */
export const HEIGHT_EPS_PX = 8;
/** Stance slip tolerance (px/frame) vs the belt — master plan §6.5 gate. */
export const SLIP_EPS = 0.5;
/** "At belt speed" tolerance for the bottom instant (px/frame). */
export const BELT_MATCH_EPS = 0.5;
/** Vertical-speed tolerance for a planted instant (px/frame). */
export const VY_EPS = 2;
/** Toe-height tolerance for the belt-locked bottom instant (px). */
export const BOTTOM_HEIGHT_EPS = 1;

type Side = 'near' | 'far';
const legOf = (p: SolvedPose, side: Side): LegPose => (side === 'near' ? p.nearLeg : p.farLeg);

export interface FrameSample {
  frame: number;
  toeX: number; toeY: number; ankleX: number; ankleY: number;
  toeHeight: number; ankleHeight: number;
  toeVx: number; toeVy: number; ankleVx: number; ankleVy: number;
  inContactHeightWindow: boolean;
  /** |toeVx - belt|: slip of the toe relative to the moving belt (px/frame). */
  toeSlipVsBelt: number;
  /** Evidence-based suggested role (NOT an asserted label). */
  suggestedRole: 'stance-candidate' | 'touchdown-candidate' | 'toeOff-candidate' | 'swing';
}

export function deriveContactEvidence() {
  const N = DURATION;
  const poses = Array.from({length: N}, (_, f) => solvePose(f));
  const groundY = Math.max(...poses.flatMap((p) => [p.nearLeg.toe[1], p.farLeg.toe[1]]));

  // --- (1) root stability from the solved pose hip -------------------------
  const hipXs = poses.map((p) => p.hip[0]);
  const hipYs = poses.map((p) => p.hip[1]);
  const hipXMin = Math.min(...hipXs), hipXMax = Math.max(...hipXs);
  const root = {
    hipXConstant: HIP_X,
    hipXMin, hipXMax, hipXRange: hipXMax - hipXMin,
    hipYMin: Math.min(...hipYs), hipYMax: Math.max(...hipYs),
    // >1 px of horizontal root travel would indicate root_motion.
    translatesHorizontally: hipXMax - hipXMin > 1,
    rootMotionRuledOut: hipXMax - hipXMin <= 1,
  };

  // --- per-frame toe/ankle height + central-difference velocity ------------
  const sample = (f: number, side: Side): FrameSample => {
    const leg = legOf(poses[f], side);
    const lm = legOf(solvePose(f - 1), side);
    const lp = legOf(solvePose(f + 1), side);
    const toeHeight = groundY - leg.toe[1];
    const ankleHeight = groundY - leg.ankle[1];
    const toeVx = (lp.toe[0] - lm.toe[0]) / 2, toeVy = (lp.toe[1] - lm.toe[1]) / 2;
    const ankleVx = (lp.ankle[0] - lm.ankle[0]) / 2, ankleVy = (lp.ankle[1] - lm.ankle[1]) / 2;
    const inWindow = toeHeight <= HEIGHT_EPS_PX;
    const slip = Math.abs(toeVx - belt);
    let suggestedRole: FrameSample['suggestedRole'] = 'swing';
    if (inWindow) {
      if (toeHeight <= BOTTOM_HEIGHT_EPS && slip <= BELT_MATCH_EPS && Math.abs(toeVy) <= VY_EPS) {
        suggestedRole = 'stance-candidate';
      } else if (toeVy > 0) {
        suggestedRole = 'touchdown-candidate'; // descending toward ground
      } else {
        suggestedRole = 'toeOff-candidate'; // rising away from ground
      }
    }
    return {
      frame: f, toeX: leg.toe[0], toeY: leg.toe[1], ankleX: leg.ankle[0], ankleY: leg.ankle[1],
      toeHeight, ankleHeight, toeVx, toeVy, ankleVx, ankleVy,
      inContactHeightWindow: inWindow, toeSlipVsBelt: slip, suggestedRole,
    };
  };

  // belt estimate = mean toe vx at the belt-locked bottom instant (height<=1).
  const lowVx: number[] = [];
  for (let f = 0; f < N; f++) {
    for (const side of ['near', 'far'] as Side[]) {
      const leg = legOf(poses[f], side);
      if (groundY - leg.toe[1] <= BOTTOM_HEIGHT_EPS) {
        const lm = legOf(solvePose(f - 1), side), lp = legOf(solvePose(f + 1), side);
        lowVx.push((lp.toe[0] - lm.toe[0]) / 2);
      }
    }
  }
  const belt = lowVx.length ? lowVx.reduce((a, b) => a + b, 0) / lowVx.length : 0;

  const frames = Array.from({length: N}, (_, f) => ({frame: f, near: sample(f, 'near'), far: sample(f, 'far')}));

  // --- (2)+(3) per-window analysis (windows taken from the contact track) --
  const analyzeWindow = (side: Side, iv: {start: number; end: number}) => {
    const rows: FrameSample[] = [];
    for (let f = iv.start; f <= iv.end; f++) rows.push(sample(f, side));
    const ctx = {before: sample(iv.start - 1, side), after: sample(iv.end + 1, side)};
    const vxs = rows.map((r) => r.toeVx);
    const devs = rows.map((r) => r.toeVx - belt);
    const maxAbsDev = Math.max(...devs.map(Math.abs));
    const bottom = rows.reduce((a, b) => (b.toeHeight < a.toeHeight ? b : a));
    return {
      start: iv.start, end: iv.end,
      gaitPhase: ((iv.start % 26) + 26) % 26,
      frames: rows, context: ctx,
      toeVxMean: vxs.reduce((a, b) => a + b, 0) / vxs.length,
      toeVxMin: Math.min(...vxs), toeVxMax: Math.max(...vxs),
      toeHeightMax: Math.max(...rows.map((r) => r.toeHeight)),
      maxAbsDevFromBelt: maxAbsDev,
      bottomFrame: bottom.frame,
      bottomToeVx: bottom.toeVx,
      bottomToeHeight: bottom.toeHeight,
      bottomToeVy: bottom.toeVy,
      bottomSlipVsBelt: Math.abs(bottom.toeVx - belt),
      // A single belt speed explains the WHOLE window only if every frame is
      // within slip tolerance; otherwise only the bottom instant is belt-locked.
      beltExplainsWholeWindow: maxAbsDev <= SLIP_EPS,
      beltExplainsBottomInstant: Math.abs(bottom.toeVx - belt) <= BELT_MATCH_EPS,
      stanceCandidateFrames: rows.filter((r) => r.suggestedRole === 'stance-candidate').map((r) => r.frame),
    };
  };
  const windows = {
    near: CONTACT_HEIGHT_WINDOWS.near.map((iv) => analyzeWindow('near', iv)),
    far: CONTACT_HEIGHT_WINDOWS.far.map((iv) => analyzeWindow('far', iv)),
  };
  const allWindows = [...windows.near, ...windows.far];
  const bottomVxs = allWindows.map((w) => w.bottomToeVx);
  const beltConsistency = {
    windowCount: allWindows.length,
    bottomToeVxMin: Math.min(...bottomVxs),
    bottomToeVxMax: Math.max(...bottomVxs),
    bottomToeVxSpread: Math.max(...bottomVxs) - Math.min(...bottomVxs),
    oneBeltSpeedExplainsAllBottomInstants: Math.max(...bottomVxs) - Math.min(...bottomVxs) <= BELT_MATCH_EPS,
    windowsWhereBeltExplainsWholeWindow: allWindows.filter((w) => w.beltExplainsWholeWindow).length,
    totalStanceCandidateFrames: allWindows.reduce((a, w) => a + w.stanceCandidateFrames.length, 0),
  };

  const decision = {
    rootMode: root.rootMotionRuledOut ? 'in_place' : 'root_motion',
    rootMotionRuledOut: root.rootMotionRuledOut,
    groundModelCandidate: belt < -1 ? 'treadmill' : 'static',
    beltVelocityXEstimate: belt,
    groundWorldYEstimate: groundY,
    // The treadmill model is SUPPORTED when the root is fixed AND the foot at
    // the bottom instant moves backward at the belt speed with ~zero height/vy.
    treadmillSupportedByTrack:
      root.rootMotionRuledOut && belt < -1 && beltConsistency.oneBeltSpeedExplainsAllBottomInstants,
    // Honest nuance: only the bottom instant is belt-locked in the RAW track;
    // the window edges are touchdown approach / toe-off release. A sustained
    // multi-frame belt-locked stance does NOT exist in the raw measurements —
    // Phase 2.3 must ENFORCE belt-locking over the reviewed stance interval and
    // Phase 2.4 measures slip on the SOLVED (locked) track, not the raw track.
    rawTrackStanceIsBriefTap: beltConsistency.windowsWhereBeltExplainsWholeWindow === 0,
    note: 'Measurements only; no stance asserted here. Phase 2.2b evidence review finalized the labels in contacts.ts (touchdown/stance/toeOff per window).',
  };

  return {
    generatedAt: new Date().toISOString(),
    schema: 'foot-contact-evidence/1',
    purpose: 'Phase 2.2b treadmill-vs-root_motion evidence (pure solvePose measurements)',
    method: {
      groundEstimate: 'max solved toe Y over 94 frames (y-down canvas == world for fixed-camera in_place demo)',
      heightEpsPx: HEIGHT_EPS_PX, bottomHeightEpsPx: BOTTOM_HEIGHT_EPS,
      slipEpsPxPerFrame: SLIP_EPS, beltMatchEpsPxPerFrame: BELT_MATCH_EPS, vyEpsPxPerFrame: VY_EPS,
      velocity: 'central difference (f+1 - f-1)/2 on solved toe/ankle; gait tracks cyclic period 26',
      beltEstimate: 'mean toe vx at frames where toe height <= 1 px (the belt-locked bottom instant)',
      windows: 'taken from CONTACT_HEIGHT_WINDOWS (contact-height windows; independent of the per-frame reviewed intervals)',
    },
    groundY, beltVxEstimatePxPerFrame: belt,
    root, beltConsistency, decision,
    // Current reviewed track metadata + per-frame states (for the timeline strip).
    contactTrack: {
      clipName: runCycleContactTrack.clipName, totalFrames: runCycleContactTrack.totalFrames,
      rootMode: runCycleContactTrack.rootMode, provisional: runCycleContactTrack.provisional,
      ground: runCycleContactTrack.ground,
      near: runCycleContactTrack.near, far: runCycleContactTrack.far,
    },
    states: expandTrack(runCycleContactTrack),
    windows, frames,
  };
}

const report = deriveContactEvidence();
mkdirSync(dirname(OUT), {recursive: true});
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log('groundY=', report.groundY.toFixed(6), 'belt=', report.beltVxEstimatePxPerFrame.toFixed(6));
console.log('root: hipXRange=', report.root.hipXRange.toFixed(6), 'translatesHorizontally=', report.root.translatesHorizontally, 'rootMotionRuledOut=', report.root.rootMotionRuledOut);
console.log('beltConsistency:', JSON.stringify(report.beltConsistency));
console.log('decision:', JSON.stringify(report.decision, null, 1));
for (const side of ['near', 'far'] as const) {
  for (const w of report.windows[side]) {
    console.log(`${side} window ${w.start}-${w.end}: bottom f${w.bottomFrame} vx=${w.bottomToeVx.toFixed(3)} h=${w.bottomToeHeight.toFixed(3)} vy=${w.bottomToeVy.toFixed(3)} slip=${w.bottomSlipVsBelt.toFixed(3)} | wholeWindowBelt=${w.beltExplainsWholeWindow} maxDev=${w.maxAbsDevFromBelt.toFixed(3)} stanceCand=[${w.stanceCandidateFrames}]`);
  }
}
