/**
 * Phase 2.1 — Ground/world coordinate contract + foot-contact track SCHEMA.
 * Phase 2.2b — REVIEWED 94-frame contact track (evidence-reviewed; see
 *   reports/foot-contact-evidence.json, reports/source-root-stability.json,
 *   reports/foot-contact-timeline.svg, reports/foot-contact-window-sheet.png).
 *
 * Owns the DATA CONTRACT for foot contacts and the ground plane. Does NOT
 * implement stance locking (Phase 2.3).
 *
 * Coordinate contract (master plan §6.1): rig/local coords are 1920x1080 canvas
 * pixels, y-down, 24 fps. For the fixed-camera run-in-place demo world == canvas
 * coords and the root transform is identity. Foot-contact anchors (Phase 2.3)
 * are stored in WORLD coords. Ground plane has world-space height worldY.
 *
 * REVIEWED FINDING (Phase 2.2b): the measured run-in-place track has NO
 * static-ground stance. Root motion is RULED OUT (puppet hip x range = 0 px;
 * independent source body-centroid drift = -0.87 px over 94 frames). The ground
 * is a TREADMILL: worldY ~974.92 px, belt ~-64.91 px/frame. ONE belt speed
 * explains the bottom instant of all 7 contact-height windows (spread 0). Each
 * window is a brief ~3-frame tap: touchdown (entry, descending vy>0) / stance
 * (bottom, toe height 0 px, vx == belt, |vy| <= 2 px/frame) / toeOff (exit,
 * rising vy<0). These are RAW-track measurements; Phase 2.3 must ENFORCE
 * belt-locking over the reviewed stance interval and Phase 2.4 measures slip on
 * the SOLVED (locked) track, not on this raw track.
 */
export type ContactState = 'swing' | 'touchdown' | 'stance' | 'toeOff' | 'uncertain';
export type RootMode = 'in_place' | 'root_motion';
export interface WorldPoint { x: number; y: number; }
export interface GroundContract { worldY: number; mode: 'static' | 'treadmill'; beltVelocityX: number; verified: boolean; }
export interface ContactInterval { start: number; end: number; state: ContactState; reason: string; candidateEvent?: 'touchdown' | 'toeOff'; }
export interface FootContactTrack { clipName: string; totalFrames: number; rootMode: RootMode; ground: GroundContract; near: ContactInterval[]; far: ContactInterval[]; provisional: boolean; }
export interface FootContactFrame { frame: number; near: ContactState; far: ContactState; nearReason?: string; farReason?: string; }

const TOUCHDOWN_REASON = 'contact-height window entry: descending toward ground (vy>0); evidence-reviewed Phase 2.2b (source frames + solved track)';
const STANCE_REASON = 'bottom of contact-height window: toe height 0 px, vx == treadmill belt (-64.91 px/frame), |vy| <= 2 px/frame; foot planted on the moving belt; evidence-reviewed Phase 2.2b';
const TOEOFF_REASON = 'contact-height window exit: rising away from ground (vy<0); evidence-reviewed Phase 2.2b (source frames + solved track)';

/**
 * Contact-height windows (solved toe height <= 8 px; regenerable via
 * `npm run verify:contacts`). Kept separate from the per-frame reviewed
 * intervals because diagnostics (contact-evidence.ts) analyze each 3-frame
 * window as a unit:
 *   near: 17-19, 43-45, 69-71   (gait mod 26 = 17,18,19)
 *   far : 4-6, 30-32, 56-58, 82-84 (gait mod 26 = 4,5,6)
 */
export const CONTACT_HEIGHT_WINDOWS: Record<'near' | 'far', Array<{ start: number; end: number }>> = {
  near: [{ start: 17, end: 19 }, { start: 43, end: 45 }, { start: 69, end: 71 }],
  far: [{ start: 4, end: 6 }, { start: 30, end: 32 }, { start: 56, end: 58 }, { start: 82, end: 84 }],
};

/** Build the three reviewed per-frame intervals for one 3-frame window. */
const reviewWindow = (start: number): ContactInterval[] => [
  { start, end: start, state: 'touchdown', reason: TOUCHDOWN_REASON, candidateEvent: 'touchdown' },
  { start: start + 1, end: start + 1, state: 'stance', reason: STANCE_REASON },
  { start: start + 2, end: start + 2, state: 'toeOff', reason: TOEOFF_REASON, candidateEvent: 'toeOff' },
];

/**
 * REVIEWED 94-frame reference contact track (Phase 2.2b). Ground worldY =
 * max solved toe Y over the clip (~974.92 px, y-down); belt = mean toe vx at the
 * belt-locked bottom instants (~-64.9 px/frame). Labels are the evidence-reviewed
 * touchdown/stance/toeOff roles; `provisional:false` / `ground.verified:true`
 * record that the treadmill ground model passed Phase 2.2b review.
 */
export const runCycleContactTrack: FootContactTrack = {
  clipName: 'reference-run-94', totalFrames: 94, rootMode: 'in_place',
  ground: { worldY: 974.92, mode: 'treadmill', beltVelocityX: -64.9, verified: true },
  provisional: false,
  near: CONTACT_HEIGHT_WINDOWS.near.flatMap((w) => reviewWindow(w.start)),
  far: CONTACT_HEIGHT_WINDOWS.far.flatMap((w) => reviewWindow(w.start)),
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
