/**
 * Generic analytic two-bone IK (law of cosines). Shared by ALL limbs and ALL
 * character rigs — character-specific lengths and bend preferences live in
 * rig data (rig.ts), never in duplicated solver code.
 *
 * Coordinate convention: canvas pixels, y down (matches keys.ts / Runner.tsx).
 *
 * Bend-side convention (documented, fixed — do not silently change):
 *   bendSign = sign of cross(root->target, root->mid), where
 *   cross(a, b) = a.x*b.y - a.y*b.x  (screen coords, y down).
 *   +1 places the middle joint on the positive-cross side of the root->target
 *   line; -1 on the negative side. For the right-facing runner: knees use -1
 *   (knee toward +x / front), elbows use +1 (elbow trailing behind the hand).
 *   Mirroring the character (facing -x) mirrors x AND flips bendSign.
 *
 * Reach handling: the target distance is clamped into the reachable annulus
 * [|l1-l2| + EPS, l1+l2 - EPS] before solving. EPS avoids the singular
 * perfectly-straight / perfectly-folded configurations (h = 0 exactly is fine
 * numerically, but the clamp keeps a tiny margin so the bend side never
 * degenerates to a coin flip). The solver NEVER changes l1/l2: the returned
 * `end` is the point actually reached (clamped target), and `residual` is the
 * distance from the requested target to `end` (0 for reachable targets).
 *
 * Degenerate direction: if the target coincides with the root (distance ~ 0),
 * the direction is undefined; we deterministically use +x (1, 0). Documented
 * fallback, never NaN.
 *
 * Pure function: identical inputs always produce identical outputs. No state.
 */

export type Pt = [number, number];

/** Annulus margin (px). Small enough to be invisible, large enough to keep
 *  the bend direction numerically stable at full extension / full fold. */
export const IK_EPS = 1e-6;

export type ClampKind = 'none' | 'max' | 'min';

export interface IkSolution {
  /** Middle joint (knee / elbow), exactly l1 from root. */
  mid: Pt;
  /** End effector position actually reached (== target when reachable). */
  end: Pt;
  /** Requested target distance from root. */
  targetDistance: number;
  /** Distance actually solved (after annulus clamp). */
  solvedDistance: number;
  /** Which reach limit clamped the target ('none' when reachable). */
  clamped: ClampKind;
  /** |target - end|: 0 for reachable targets, >0 only when clamped. */
  residual: number;
  /** The bend side actually used (echo of the hint; never flips silently). */
  bendSign: 1 | -1;
}

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/**
 * Solve a two-bone chain root -> mid -> end with fixed bone lengths.
 * Throws on invalid rig data (non-finite or non-positive lengths, invalid
 * bend hint) — a rig configuration error must fail loudly, not render NaN.
 */
export function solveTwoBone(
  root: Pt,
  target: Pt,
  l1: number,
  l2: number,
  bendSign: 1 | -1,
): IkSolution {
  if (!Number.isFinite(l1) || !Number.isFinite(l2) || l1 <= 0 || l2 <= 0) {
    throw new RangeError(`solveTwoBone: bone lengths must be finite and positive (got ${l1}, ${l2})`);
  }
  if (bendSign !== 1 && bendSign !== -1) {
    throw new RangeError(`solveTwoBone: bendSign must be +1 or -1 (got ${bendSign})`);
  }
  if (!Number.isFinite(root[0]) || !Number.isFinite(root[1]) || !Number.isFinite(target[0]) || !Number.isFinite(target[1])) {
    throw new RangeError('solveTwoBone: root and target must be finite points');
  }

  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const targetDistance = Math.hypot(dx, dy);

  const maxReach = l1 + l2 - IK_EPS;
  const minReach = Math.abs(l1 - l2) + IK_EPS;
  let clamped: ClampKind = 'none';
  let solvedDistance = targetDistance;
  if (solvedDistance > maxReach) { solvedDistance = maxReach; clamped = 'max'; }
  else if (solvedDistance < minReach) { solvedDistance = minReach; clamped = 'min'; }

  // Unit direction toward the target; deterministic +x fallback at zero distance.
  const ux = targetDistance > 1e-9 ? dx / targetDistance : 1;
  const uy = targetDistance > 1e-9 ? dy / targetDistance : 0;

  // Law of cosines: projection of bone 1 onto the root->target axis, and the
  // perpendicular offset of the middle joint. max(0, ...) guards float noise.
  const a = (l1 * l1 - l2 * l2 + solvedDistance * solvedDistance) / (2 * solvedDistance);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));

  // Perpendicular with cross(u, perp) = +1, so bendSign maps directly to the
  // documented cross(root->target, root->mid) convention.
  const px = -uy;
  const py = ux;

  const mid: Pt = [root[0] + ux * a + px * h * bendSign, root[1] + uy * a + py * h * bendSign];
  const end: Pt = [root[0] + ux * solvedDistance, root[1] + uy * solvedDistance];
  const residual = Math.hypot(target[0] - end[0], target[1] - end[1]);

  return {mid, end, targetDistance, solvedDistance, clamped, residual, bendSign};
}

/** Signed bend side of a solved (or raw) chain: sign of cross(root->end, root->mid). */
export function bendSideOf(root: Pt, mid: Pt, end: Pt): number {
  return Math.sign(cross(end[0] - root[0], end[1] - root[1], mid[0] - root[0], mid[1] - root[1]));
}

/** Mirror a point horizontally about x = axis (facing flip helper for tests/variants). */
export const mirrorX = (p: Pt, axis: number): Pt => [2 * axis - p[0], p[1]];
