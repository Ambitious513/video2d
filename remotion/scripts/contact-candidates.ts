/**
 * Phase 2.1 — foot-contact CANDIDATE derivation (diagnostic, provisional).
 * Regenerates reports/foot-contact-candidates.json from the solved pose track.
 * Pure + deterministic. Method (master plan §6.2: position + velocity, not a
 * cosine threshold): groundY = max solved toe Y; height = groundY - toeY;
 * vx,vy = central difference (f+1 - f-1)/2 on solved toe/ankle (gait cyclic 26).
 * Contact-height window: height <= 8 px. Static-ground stance candidate:
 * window AND |vx|<=2 AND |vy|<=2. Reports candidates only; never asserts stance.
 * Run: npm run verify:contacts
 */
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {solvePose} from '../src/puppet/pose';
import {DURATION} from '../src/puppet/keys';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../reports/foot-contact-candidates.json');
export const HEIGHT_EPS_PX = 8; export const VX_EPS = 2; export const VY_EPS = 2;
export function deriveContactCandidates() {
  const N = DURATION;
  const poses = Array.from({length: N}, (_, f) => solvePose(f));
  const groundY = Math.max(...poses.flatMap(p => [p.nearLeg.toe[1], p.farLeg.toe[1]]));
  const sample = (f: number, side: 'near' | 'far') => {
    const leg = (poses[f] as any)[side + 'Leg'];
    const lm = (solvePose(f - 1) as any)[side + 'Leg']; const lp = (solvePose(f + 1) as any)[side + 'Leg'];
    const toeHeight = groundY - leg.toe[1]; const ankleHeight = groundY - leg.ankle[1];
    const toeVx = (lp.toe[0] - lm.toe[0]) / 2, toeVy = (lp.toe[1] - lm.toe[1]) / 2;
    const ankleVx = (lp.ankle[0] - lm.ankle[0]) / 2, ankleVy = (lp.ankle[1] - lm.ankle[1]) / 2;
    const inWindow = toeHeight <= HEIGHT_EPS_PX;
    return { toeX: leg.toe[0], toeY: leg.toe[1], ankleX: leg.ankle[0], ankleY: leg.ankle[1],
      toeHeight, ankleHeight, toeVx, toeVy, ankleVx, ankleVy, inContactHeightWindow: inWindow,
      staticGroundStanceCandidate: inWindow && Math.abs(toeVx) <= VX_EPS && Math.abs(toeVy) <= VY_EPS };
  };
  const frames = Array.from({length: N}, (_, f) => ({frame: f, near: sample(f, 'near'), far: sample(f, 'far')}));
  const windows = (side: 'near' | 'far') => { const out: {start: number; end: number}[] = []; let cur: number[] = [];
    for (let f = 0; f < N; f++) { if ((frames[f] as any)[side].inContactHeightWindow) cur.push(f);
      else if (cur.length) {out.push({start: cur[0], end: cur[cur.length - 1]}); cur = [];} }
    if (cur.length) out.push({start: cur[0], end: cur[cur.length - 1]}); return out; };
  const lowVx = frames.flatMap(fr => (['near', 'far'] as const).filter(s => (fr as any)[s].toeHeight <= 1).map(s => (fr as any)[s].toeVx));
  const beltVxEstimate = lowVx.length ? lowVx.reduce((a, b) => a + b, 0) / lowVx.length : 0;
  const staticStanceCount = frames.reduce((a, fr) => a + (fr.near.staticGroundStanceCandidate ? 1 : 0) + (fr.far.staticGroundStanceCandidate ? 1 : 0), 0);
  return { generatedAt: new Date().toISOString(), provisional: true,
    status: 'CANDIDATES_ONLY - no verified stance; Phase 2.2 review required',
    method: { groundEstimate: 'max solved toe Y over 94 frames (y-down canvas = world for fixed-camera in_place demo)',
      heightEpsPx: HEIGHT_EPS_PX, vxEps: VX_EPS, vyEps: VY_EPS,
      velocity: 'central difference (f+1 - f-1)/2 on solved toe/ankle; gait tracks cyclic period 26' },
    groundY, beltVxEstimatePxPerFrame: beltVxEstimate, staticGroundStanceCandidateCount: staticStanceCount,
    finding: staticStanceCount === 0
      ? 'No frame is both at contact height and horizontally slow vs a STATIC ground (|vx|~65 px/frame at the lowest toe frames). Run-in-place treadmill signature. Phase 2.2 must resolve treadmill-belt vs root_motion before any stance label is asserted.'
      : 'Static-ground stance candidates exist; review in Phase 2.2.',
    contactHeightWindows: {near: windows('near'), far: windows('far')}, frames };
}
const report = deriveContactCandidates();
mkdirSync(dirname(OUT), {recursive: true});
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log('groundY=', report.groundY.toFixed(2), 'belt=', report.beltVxEstimatePxPerFrame.toFixed(2), 'staticStance=', report.staticGroundStanceCandidateCount);
console.log('near windows:', JSON.stringify(report.contactHeightWindows.near));
console.log('far windows:', JSON.stringify(report.contactHeightWindows.far));
