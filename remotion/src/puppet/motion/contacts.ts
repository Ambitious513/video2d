/**
 * Phase 2.1 — Ground/world coordinate contract + foot-contact track SCHEMA.
 * Owns the DATA CONTRACT for foot contacts and the ground plane. Does NOT
 * implement stance locking (Phase 2.3) and does NOT assert any verified stance
 * interval yet (Phase 2.2 review pending).
 *
 * Coordinate contract (master plan §6.1): rig/local coords are 1920x1080 canvas
 * pixels, y-down, 24 fps. For the fixed-camera run-in-place demo world == canvas
 * coords and the root transform is identity. Foot-contact anchors (Phase 2.3)
 * are stored in WORLD coords. Ground plane has world-space height worldY.
 *
 * KEY PROVISIONAL FINDING (reports/foot-contact-candidates.json): the measured
 * run-in-place track has NO frame both at contact height AND horizontally slow
 * vs a STATIC ground (|toe vx| ~ 65 px/frame at the lowest toe frames) — the
 * treadmill signature of run-in-place. The ground contract carries a treadmill
 * mode + belt-velocity hypothesis, verified:false. Phase 2.2 must validate this
 * against source shadow/contact evidence and manually review the timeline before
 * any 'stance' label is asserted. Per §6.2 contact-height windows are 'uncertain';
 * we do NOT fabricate a stance interval to pass a test.
 */
export type ContactState = 'swing' | 'touchdown' | 'stance' | 'toeOff' | 'uncertain';
export type RootMode = 'in_place' | 'root_motion';
export interface WorldPoint { x: number; y: number; }
export interface GroundContract { worldY: number; mode: 'static' | 'treadmill'; beltVelocityX: number; verified: boolean; }
export interface ContactInterval { start: number; end: number; state: ContactState; reason: string; candidateEvent?: 'touchdown' | 'toeOff'; }
export interface FootContactTrack { clipName: string; totalFrames: number; rootMode: RootMode; ground: GroundContract; near: ContactInterval[]; far: ContactInterval[]; provisional: boolean; }
export interface FootContactFrame { frame: number; near: ContactState; far: ContactState; nearReason?: string; farReason?: string; }

const UNCERTAIN_REASON = 'toe at contact height but |vx|~65 px/frame vs static ground; treadmill/root-motion resolution + manual review required (Phase 2.2)';

/**
 * Provisional 94-frame reference contact track. Contact-height windows from
 * solved toe height <= 8 px (regenerable via `npm run verify:contacts`):
 *   near: 17-19, 43-45, 69-71   (gait mod 26 = 17,18,19)
 *   far : 4-6, 30-32, 56-58, 82-84 (gait mod 26 = 4,5,6)
 * All 'uncertain' (no verified static-ground stance exists yet).
 * ground worldY = max solved toe Y over the clip (~974.92 px, y-down).
 * belt hypothesis = mean toe vx at the lowest frames (~ -64.9 px/frame).
 */
export const runCycleContactTrack: FootContactTrack = {
  clipName: 'reference-run-94', totalFrames: 94, rootMode: 'in_place',
  ground: { worldY: 974.92, mode: 'treadmill', beltVelocityX: -64.9, verified: false },
  provisional: true,
  near: [
    { start: 17, end: 19, state: 'uncertain', reason: UNCERTAIN_REASON, candidateEvent: 'touchdown' },
    { start: 43, end: 45, state: 'uncertain', reason: UNCERTAIN_REASON, candidateEvent: 'touchdown' },
    { start: 69, end: 71, state: 'uncertain', reason: UNCERTAIN_REASON, candidateEvent: 'touchdown' },
  ],
  far: [
    { start: 4, end: 6, state: 'uncertain', reason: UNCERTAIN_REASON, candidateEvent: 'touchdown' },
    { start: 30, end: 32, state: 'uncertain', reason: UNCERTAIN_REASON, candidateEvent: 'touchdown' },
    { start: 56, end: 58, state: 'uncertain', reason: UNCERTAIN_REASON, candidateEvent: 'touchdown' },
    { start: 82, end: 84, state: 'uncertain', reason: UNCERTAIN_REASON, candidateEvent: 'touchdown' },
  ],
};

export function expandTrack(track: FootContactTrack): FootContactFrame[] {
  const out: FootContactFrame[] = [];
  for (let f = 0; f < track.totalFrames; f++) {
    const ni = track.near.find((i) => f >= i.start && f <= i.end);
    const fi = track.far.find((i) => f >= i.start && f <= i.end);
    out.push({ frame: f, near: ni ? ni.state : 'swing', far: fi ? fi.state : 'swing', nearReason: ni?.reason, farReason: fi?.reason });
  }
  return out;
}
export function getContactAtFrame(track: FootContactTrack, frame: number): FootContactFrame {
  const n = track.totalFrames; const f = ((frame % n) + n) % n; return expandTrack(track)[f];
}
export function stanceFrames(track: FootContactTrack, side: 'near' | 'far'): number[] {
  return expandTrack(track).filter((r) => r[side] === 'stance').map((r) => r.frame);
}
