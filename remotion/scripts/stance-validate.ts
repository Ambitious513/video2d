/**
 * Phase 2.3 — stance-locking VALIDATION (pure, deterministic).
 *
 * Runs the belt-locked stance diagnostics over all 94 frames and writes
 * reports/stance-locking-validation.json. Run: npm run verify:stance
 *
 * Reports the Phase 2 acceptance numbers on the SOLVED track (master plan
 * §6.5): planted-point slip (<0.5 px/frame), anchor drift (<=1.5 px),
 * ground penetration (<=1 px), touchdown/toe-off continuity, alternation,
 * fixed bones, and in_place root stability. Also records the per-interval
 * anchors and the belt-shift/solved-anchor identities.
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {diagnoseStance, GROUND_Y, BELT_VX} from '../src/puppet/motion/stance';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../reports/stance-locking-validation.json');

const d = diagnoseStance();

const report = {
  generatedAt: new Date().toISOString(),
  schema: 'stance-locking-validation/1',
  purpose: 'Phase 2.3 belt-locked stance validation (solved track)',
  groundContract: {worldY: GROUND_Y, mode: 'treadmill', beltVelocityX: BELT_VX, verified: true},
  method: {
    anchors: 'stance anchor = solved toe at the stance frame (world == canvas, in_place); anchorY = groundY',
    beltLock: 'anchorX + belt == raw toe x at the stance frame; planted world velocity = (belt, 0) -> slip vs ground 0',
    continuity: 'max joint delta at touchdown/toeOff boundaries vs p95 of all adjacent-frame deltas',
    states: 'touchdown/stance/toeOff/swing per frame from the reviewed contact windows (Phase 2.2b)',
  },
  gates: {
    plantedSlipMax: d.plantedSlipMax,
    plantedSlipGate: 0.5,
    stanceAnchorDriftMax: d.stanceAnchorDriftMax,
    driftGate: 1.5,
    groundPenetrationMax: d.groundPenetrationMax,
    penetrationGate: 1,
    touchdownMaxDelta: d.transitionContinuity.touchdownMaxDelta,
    toeOffMaxDelta: d.transitionContinuity.toeOffMaxDelta,
    continuityP95: d.transitionContinuity.p95,
    continuityGateFactor: 1.5,
    solvedAnchorMaxError: d.solvedAnchorMaxError,
    beltShiftMaxError: d.beltShiftMaxError,
    stanceBoneErrorMax: d.stanceBoneErrorMax,
  },
  pass: {
    plantedSlip: d.plantedSlipMax < 0.5,
    stanceAnchorDrift: d.stanceAnchorDriftMax <= 1.5,
    groundPenetration: d.groundPenetrationMax <= 1,
    touchdownContinuity: d.transitionContinuity.touchdownMaxDelta <= 1.5 * d.transitionContinuity.p95,
    toeOffContinuity: d.transitionContinuity.toeOffMaxDelta <= 1.5 * d.transitionContinuity.p95,
    solvedAnchor: d.solvedAnchorMaxError <= 1e-6,
    beltShift: d.beltShiftMaxError <= 1e-6,
    fixedBones: d.stanceBoneErrorMax <= 1e-6,
  },
  intervals: d.intervals.map((i) => ({
    side: i.side, touchdown: i.touchdown, stance: i.stance, toeOff: i.toeOff,
    anchor: i.anchor, rawToeAtStance: i.rawToeAtStance, solvedToeAtStance: i.solvedToeAtStance,
    worldVelocity: i.worldVelocity,
  })),
  stateTimeline: d.states,
};

mkdirSync(dirname(OUT), {recursive: true});
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log('stance-locking-validation:');
console.log('  planted slip max =', d.plantedSlipMax.toFixed(6), '(gate < 0.5)');
console.log('  anchor drift max =', d.stanceAnchorDriftMax.toFixed(6), '(gate <= 1.5)');
console.log('  penetration max  =', d.groundPenetrationMax.toFixed(6), '(gate <= 1)');
console.log('  touchdown delta  =', d.transitionContinuity.touchdownMaxDelta.toFixed(2), 'toeOff delta =', d.transitionContinuity.toeOffMaxDelta.toFixed(2), 'p95 =', d.transitionContinuity.p95.toFixed(2));
console.log('  solved-anchor err =', d.solvedAnchorMaxError.toExponential(2), 'belt-shift err =', d.beltShiftMaxError.toExponential(2), 'bone err =', d.stanceBoneErrorMax.toExponential(2));
console.log('  intervals:', d.intervals.map((i) => `${i.side}@${i.stance}(anchor x=${i.anchor.x.toFixed(1)})`).join(' '));
const allPass = Object.values(report.pass).every(Boolean);
console.log('  RESULT:', allPass ? 'ALL GATES PASS' : 'FAIL');
process.exit(allPass ? 0 : 1);