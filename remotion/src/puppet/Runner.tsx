import React from 'react';
import {C, HEAD_R, shadow, Pt, STEP} from './keys';
import {solvePose} from './pose';
import {scarfNodes, backpackBob, backpackLagX, backpackTransform, strapBackpackAnchor} from './secondary';

/**
 * Phase 3a — visual construction. All limb joints still come from the
 * constrained pose evaluator (pose.ts -> rig.ts + ik.ts); this file now draws
 * COHESIVE tapered body-part silhouettes instead of independent round-capped
 * strokes, a fuller torso, and a designed foot with a stable ankle pivot.
 *
 * Changes vs Phase 1 (master plan §7):
 *   - Each limb (thigh+calf, upper arm+forearm) is ONE closed tapered outline
 *     drawn once (no exposed circular joint balls, no gaps at knee/elbow).
 *   - The torso has a readable shoulder taper, chest, waist and pelvis.
 *   - The foot is a designed heel/sole/toe silhouette oriented along the
 *     ankle->toe control vector (ankle pivot preserved; foot artwork length is
 *     still rig.footLen, applied at the SOLVED ankle).
 *   - Colors come only from the central palette C (keys.ts).
 *
 * Palette, proportions and draw order otherwise match the pre-upgrade puppet so
 * the identity (slate body, cream scarf, light pack, dark outline) is intact.
 * Secondary motion (scarf chain, backpack lag) is Phase 3b; the scarf here is
 * the same deterministic ribbon as before.
 */

/** Catmull-Rom -> cubic bezier smooth open path through points */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Offset a polyline sideways by a per-node half-width; sign +1 = left normal. */
function offsetSide(nodes: { x: number; y: number; w: number }[], sign: 1 | -1): Pt[] {
  return nodes.map((n, i) => {
    const prev = nodes[Math.max(0, i - 1)], next = nodes[Math.min(nodes.length - 1, i + 1)];
    let dx = next.x - prev.x, dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const nx = -dy * sign, ny = dx * sign;
    return [n.x + nx * n.w * 0.5, n.y + ny * n.w * 0.5];
  });
}

/**
 * One closed tapered outline around a limb centerline (hip->knee->ankle or
 * shoulder->elbow->fist). Each bone contributes a tapered quad built from its
 * OWN direction (so widths are preserved), mitered at the middle joint. Smooth
 * sides, flat caps hidden under the torso/foot.
 */
function taperedLimbPath(nodes: { x: number; y: number; w: number }[]): string {
  const n = nodes.length;
  const quads: Pt[][] = [];
  for (let i = 0; i < n - 1; i++) {
    const A = nodes[i], B = nodes[i + 1];
    let dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    quads.push([
      [A.x + nx * A.w * 0.5, A.y + ny * A.w * 0.5],
      [B.x + nx * B.w * 0.5, B.y + ny * B.w * 0.5],
      [B.x - nx * B.w * 0.5, B.y - ny * B.w * 0.5],
      [A.x - nx * A.w * 0.5, A.y - ny * A.w * 0.5],
    ]);
  }
  // Outline: forward along each quad's +normal side, back along its -normal
  // side; at interior joints the next quad's +normal[0] miter-connects.
  const side = (sign: 1 | -1): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i < quads.length; i++) {
      const q = quads[i];
      if (i === 0) out.push(sign > 0 ? q[0] : q[3]);
      out.push(sign > 0 ? q[1] : q[2]);
    }
    return out;
  };
  const plus = side(1);
  const minus = side(-1).reverse();
  const all = [...plus, ...minus];
  return smoothPath(all) + ' Z';
}

/** Outlined rounded segment (kept for the short neck; limbs use tapered outlines). */
const Seg: React.FC<{ a: Pt; b: Pt; w: number; fill: string }> = ({ a, b, w, fill }) => (
  <>
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.line} strokeWidth={w + 9} strokeLinecap="round" />
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={fill} strokeWidth={w} strokeLinecap="round" />
  </>
);

const Leg: React.FC<{ hip: Pt; knee: Pt; ankle: Pt; toe: Pt; fill: string }> = ({ hip, knee, ankle, toe, fill }) => {
  // Cohesive thigh+calf silhouette: one tapered outline, no exposed knee ball.
  const leg = taperedLimbPath([
    { x: hip[0], y: hip[1], w: 50 },
    { x: knee[0], y: knee[1], w: 38 },
    { x: ankle[0], y: ankle[1], w: 24 },
  ]);
  // Designed foot: heel / sole / toe, oriented along the ankle->toe vector.
  // Toe tip at the pose toe (foot artwork length = rig.footLen); heel trails
  // behind the ankle; flat-ish sole. Slight taper, no overshoot.
  const dx = toe[0] - ankle[0], dy = toe[1] - ankle[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len; // along the foot (ankle -> toe), len = footLen
  const nx = -uy, ny = ux; // across the foot
  const P = (a: number, b: number): Pt => [ankle[0] + ux * a + nx * b, ankle[1] + uy * a + ny * b];
  const foot = `M ${P(-14, -13).join(' ')} C ${P(-20, 2).join(' ')} ${P(-9, 16).join(' ')} ${P(12, 16).join(' ')} ` +
    `L ${P(len * 0.6, 14).join(' ')} Q ${P(len * 0.9, 7).join(' ')} ${P(len, 0).join(' ')} ` +
    `Q ${P(len * 0.84, -9).join(' ')} ${P(len * 0.5, -10).join(' ')} Z`;
  return (
    <g>
      <path d={leg} fill={fill} stroke={C.line} strokeWidth={5} strokeLinejoin="round" />
      <path d={foot} fill={fill} stroke={C.line} strokeWidth={5} strokeLinejoin="round" />
    </g>
  );
};

const Arm: React.FC<{ sh: Pt; elbow: Pt; fist: Pt; fill: string }> = ({ sh, elbow, fist, fill }) => {
  // Cohesive upper-arm+forearm silhouette ending at the fist center.
  const arm = taperedLimbPath([
    { x: sh[0], y: sh[1], w: 34 },
    { x: elbow[0], y: elbow[1], w: 28 },
    { x: fist[0], y: fist[1], w: 24 },
  ]);
  return (
    <g>
      <path d={arm} fill={fill} stroke={C.line} strokeWidth={5} strokeLinejoin="round" />
      <circle cx={fist[0]} cy={fist[1]} r={23} fill={C.line} />
      <circle cx={fist[0]} cy={fist[1]} r={19} fill={fill} />
    </g>
  );
};

/** Scarf ribbon built from the deterministic chain (secondary.ts). */
const ScarfTail: React.FC<{ knot: Pt; f: number }> = ({ knot, f }) => {
  const center = scarfNodes(knot, f).map((p): Pt => [p[0], p[1]]);
  const widths = center.map((_, i) => 40 - i * 2.4); // taper 40 -> 28; tip flares a touch at the end
  widths[widths.length - 1] = 30;
  const top: Pt[] = [], bot: Pt[] = [];
  for (let i = 0; i < center.length; i++) {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const w = widths[i] / 2;
    top.push([center[i][0] + nx * w, center[i][1] + ny * w]);
    bot.push([center[i][0] - nx * w, center[i][1] - ny * w]);
  }
  const outline = smoothPath(top) + ' L ' + bot[bot.length - 1].map((v) => v.toFixed(1)).join(' ') + ' ' + smoothPath([...bot].reverse()).replace(/^M[^C]+/, '') + ' Z';
  const shade = smoothPath(bot.map((p, i) => [p[0], p[1] - widths[i] * 0.18]));
  return (
    <g>
      <path d={outline} fill={C.scarf} stroke={C.line} strokeWidth={5} strokeLinejoin="round" />
      <path d={shade} fill="none" stroke={C.scarfSh} strokeWidth={9} strokeLinecap="round" />
    </g>
  );
};

export const Runner: React.FC<{ frame: number }> = ({ frame }) => {
  const f = frame;
  // Constrained pose: pure function of (rig, motion keys, frame). Solved
  // joints have fixed bone lengths; raw targets are preserved inside the
  // pose object for diagnostics (never rendered directly).
  const pose = solvePose(f);
  const hip: Pt = pose.hip;
  const head: Pt = pose.head;
  const sh: Pt = pose.shoulder;
  const knot: Pt = pose.knot;
  const pack: Pt = pose.pack;
  const neckTop: Pt = pose.neckTop;
  const shd = shadow(f);

  // Fuller torso: shoulder taper -> chest -> waist -> pelvis.
  const torso = `M ${sh[0] - 32} ${sh[1] - 8}
    C ${sh[0] - 50} ${sh[1] + 40}, ${sh[0] - 46} ${sh[1] + 100}, ${hip[0] - 30} ${hip[1] - 58}
    C ${hip[0] - 40} ${hip[1] - 20}, ${hip[0] - 36} ${hip[1] + 4}, ${hip[0] - 20} ${hip[1] + 12}
    L ${hip[0] + 24} ${hip[1] + 12}
    C ${hip[0] + 42} ${hip[1] + 2}, ${hip[0] + 44} ${hip[1] - 24}, ${hip[0] + 34} ${hip[1] - 58}
    C ${sh[0] + 54} ${sh[1] + 100}, ${sh[0] + 56} ${sh[1] + 40}, ${sh[0] + 36} ${sh[1] - 4} Z`;

  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ background: C.bg }}>
      {/* ground shadow */}
      <ellipse cx={880} cy={972} rx={shd.rx} ry={shd.ry} fill={C.shadow} opacity={shd.opacity} />

      {/* far limbs (behind) */}
      <Leg hip={pose.farLeg.hip} knee={pose.farLeg.knee} ankle={pose.farLeg.ankle} toe={pose.farLeg.toe} fill={C.far} />
      <Arm sh={sh} elbow={pose.farArm.elbow} fist={pose.farArm.fist} fill={C.far} />

      {/* scarf tail behind pack */}
      <ScarfTail knot={knot} f={f} />

      {/* backpack (torso attachment + deterministic bob/lag, Phase 3b) */}
      <g transform={`translate(${pack[0] + backpackLagX(f)} ${pack[1] + backpackBob(f)}) rotate(-12)`}>
        <rect x={-70} y={-95} width={140} height={185} rx={30} fill={C.pack} stroke={C.line} strokeWidth={5} />
        <path d="M -70 -55 Q -70 -95 -40 -95 L 40 -95 Q 70 -95 70 -55 L 70 -30 L -70 -30 Z" fill={C.packLt} stroke={C.line} strokeWidth={5} />
        <rect x={-46} y={-8} width={92} height={72} rx={18} fill={C.packLt} stroke={C.line} strokeWidth={4} />
        <circle cx={0} cy={28} r={5} fill={C.line} />
        <rect x={-58} y={72} width={116} height={26} rx={12} fill={C.packDk} />
      </g>
      {/* strap over shoulder: backpack end follows the transformed pack; shoulder end stays anchored */}
      <line x1={strapBackpackAnchor(pack, f)[0]} y1={strapBackpackAnchor(pack, f)[1]} x2={sh[0] + 16} y2={sh[1] - 4} stroke={C.line} strokeWidth={22} strokeLinecap="round" />
      <line x1={strapBackpackAnchor(pack, f)[0]} y1={strapBackpackAnchor(pack, f)[1]} x2={sh[0] + 16} y2={sh[1] - 4} stroke={C.packLt} strokeWidth={15} strokeLinecap="round" />

      {/* torso + neck */}
      <path d={torso} fill={C.body} stroke={C.line} strokeWidth={5} strokeLinejoin="round" />
      <Seg a={neckTop} b={sh} w={40} fill={C.body} />

      {/* near leg (in front of torso bottom) */}
      <Leg hip={pose.nearLeg.hip} knee={pose.nearLeg.knee} ankle={pose.nearLeg.ankle} toe={pose.nearLeg.toe} fill={C.body} />

      {/* scarf knot */}
      <g transform={`translate(${knot[0]} ${knot[1]}) rotate(-14)`}>
        <ellipse cx={0} cy={0} rx={56} ry={34} fill={C.scarf} stroke={C.line} strokeWidth={5} />
        <ellipse cx={14} cy={12} rx={40} ry={20} fill={C.scarfSh} />
        <ellipse cx={-6} cy={-8} rx={44} ry={22} fill={C.scarf} />
      </g>

      {/* head */}
      <circle cx={head[0]} cy={head[1]} r={HEAD_R} fill={C.body} stroke={C.line} strokeWidth={5} />
      <path d={`M ${head[0] - 60} ${head[1] - 40} A ${HEAD_R - 8} ${HEAD_R - 8} 0 0 1 ${head[0] + 30} ${head[1] - 74}`} fill="none" stroke={C.bodyLt} strokeWidth={14} strokeLinecap="round" opacity={0.7} />
      <ellipse cx={head[0] + 60} cy={head[1] + 12} rx={8} ry={13} fill={C.eye} />
      <path d={`M ${head[0] + 48} ${head[1] - 22} q 14 -10 26 -2`} fill="none" stroke={C.eye} strokeWidth={4} strokeLinecap="round" />
      <path d={`M ${head[0] + 44} ${head[1] + 48} q 16 12 32 0`} fill="none" stroke={C.eye} strokeWidth={4} strokeLinecap="round" />

      {/* near arm (front) */}
      <Arm sh={sh} elbow={pose.nearArm.elbow} fist={pose.nearArm.fist} fill={C.body} />
    </svg>
  );
};