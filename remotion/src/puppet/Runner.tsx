import React from 'react';
import {
  C, HIP_X, HEAD_X, HEAD_R, hipY, headY, cycleSample, LEG_CYCLE,
  armPose, shadow, Pt, STEP,
} from './keys';

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

/** Outlined rounded limb segment (two stacked strokes) */
const Seg: React.FC<{ a: Pt; b: Pt; w: number; fill: string }> = ({ a, b, w, fill }) => (
  <>
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.line} strokeWidth={w + 9} strokeLinecap="round" />
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={fill} strokeWidth={w} strokeLinecap="round" />
  </>
);

const Leg: React.FC<{ hip: Pt; knee: Pt; ankle: Pt; toe: Pt; fill: string }> = ({ hip, knee, ankle, toe, fill }) => {
  // filled wedge foot oriented along ankle->toe
  const dx = toe[0] - ankle[0], dy = toe[1] - ankle[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;       // foot direction
  const nx = -uy, ny = ux;                   // perpendicular
  const w = 15;
  const foot = `M ${ankle[0] + nx * w} ${ankle[1] + ny * w}
    L ${toe[0]} ${toe[1]}
    L ${ankle[0] - nx * w} ${ankle[1] - ny * w}
    L ${ankle[0] - ux * 24} ${ankle[1] - uy * 24} Z`;
  return (
    <g>
      <Seg a={hip} b={knee} w={50} fill={fill} />
      <Seg a={knee} b={ankle} w={38} fill={fill} />
      <path d={foot} fill={fill} stroke={C.line} strokeWidth={5} strokeLinejoin="round" />
    </g>
  );
};

const Arm: React.FC<{ sh: Pt; elbow: Pt; fist: Pt; fill: string }> = ({ sh, elbow, fist, fill }) => (
  <g>
    <Seg a={sh} b={elbow} w={34} fill={fill} />
    <Seg a={elbow} b={fist} w={28} fill={fill} />
    <circle cx={fist[0]} cy={fist[1]} r={25} fill={C.line} />
    <circle cx={fist[0]} cy={fist[1]} r={21} fill={fill} />
  </g>
);

/** Flowing scarf ribbon built from a waving centerline */
const ScarfTail: React.FC<{ knot: Pt; f: number }> = ({ knot, f }) => {
  const base: Pt[] = [[-70, -18], [-180, -36], [-280, -22], [-360, 12], [-400, 56]];
  const amp = [8, 14, 19, 24, 30];
  const center: Pt[] = base.map((p, i) => [
    knot[0] + p[0],
    knot[1] + p[1] + amp[i] * Math.sin((2 * Math.PI * f) / STEP - i * 0.85),
  ]);
  center.unshift([knot[0] - 10, knot[1] - 6]);
  const widths = [40, 40, 36, 30, 26, 30]; // tip flares a touch
  // perpendiculars
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
  // shade stripe along lower edge
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
  const hip: Pt = [HIP_X, hipY(f)];
  const head: Pt = [HEAD_X, headY(f)];
  const sh: Pt = [922, headY(f) + 154];
  const knot: Pt = [940, headY(f) + 112];
  const pack: Pt = [818, headY(f) + 222];

  const nl = cycleSample(LEG_CYCLE, f);
  const fl = cycleSample(LEG_CYCLE, f + 13);
  const add = (p: Pt, o: Pt): Pt => [p[0] + o[0], p[1] + o[1]];
  const na = armPose(f, 0);
  const fa = armPose(f, 13);
  const shd = shadow(f);

  // torso quad
  const torso = `M ${sh[0] - 30} ${sh[1] - 10}
    C ${sh[0] - 40} ${sh[1] + 70}, ${hip[0] - 36} ${hip[1] - 80}, ${hip[0] - 30} ${hip[1] - 4}
    L ${hip[0] + 30} ${hip[1] + 8}
    C ${hip[0] + 40} ${hip[1] - 80}, ${sh[0] + 46} ${sh[1] + 60}, ${sh[0] + 38} ${sh[1] + 6} Z`;

  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ background: C.bg }}>
      {/* ground shadow */}
      <ellipse cx={880} cy={972} rx={shd.rx} ry={shd.ry} fill={C.shadow} opacity={shd.opacity} />

      {/* far limbs (behind) */}
      <Leg hip={hip} knee={add(fl.knee, hip)} ankle={add(fl.ankle, hip)} toe={add(fl.toe, hip)} fill={C.far} />
      <Arm sh={sh} elbow={add(fa.elbow, sh)} fist={add(fa.fist, sh)} fill={C.far} />

      {/* scarf tail behind pack */}
      <ScarfTail knot={knot} f={f} />

      {/* backpack */}
      <g transform={`translate(${pack[0]} ${pack[1]}) rotate(-12)`}>
        <rect x={-70} y={-95} width={140} height={185} rx={30} fill={C.pack} stroke={C.line} strokeWidth={5} />
        <path d="M -70 -55 Q -70 -95 -40 -95 L 40 -95 Q 70 -95 70 -55 L 70 -30 L -70 -30 Z" fill={C.packLt} stroke={C.line} strokeWidth={5} />
        <rect x={-46} y={-8} width={92} height={72} rx={18} fill={C.packLt} stroke={C.line} strokeWidth={4} />
        <circle cx={0} cy={28} r={5} fill={C.line} />
        <rect x={-58} y={72} width={116} height={26} rx={12} fill={C.packDk} />
      </g>
      {/* strap over shoulder */}
      <line x1={pack[0] + 44} y1={pack[1] - 78} x2={sh[0] + 16} y2={sh[1] - 4} stroke={C.line} strokeWidth={22} strokeLinecap="round" />
      <line x1={pack[0] + 44} y1={pack[1] - 78} x2={sh[0] + 16} y2={sh[1] - 4} stroke={C.packLt} strokeWidth={15} strokeLinecap="round" />

      {/* torso + neck */}
      <path d={torso} fill={C.body} stroke={C.line} strokeWidth={5} strokeLinejoin="round" />
      <Seg a={[head[0] - 18, head[1] + 62]} b={sh} w={40} fill={C.body} />

      {/* near leg (in front of torso bottom) */}
      <Leg hip={hip} knee={add(nl.knee, hip)} ankle={add(nl.ankle, hip)} toe={add(nl.toe, hip)} fill={C.body} />

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
      <Arm sh={sh} elbow={add(na.elbow, sh)} fist={add(na.fist, sh)} fill={C.body} />
    </svg>
  );
};
