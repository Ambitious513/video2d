import {DURATION, LOOP} from './puppet/keys';

/**
 * Pure cel-selection logic, shared by the compositions and the unit tests.
 *
 * Semantics (0-indexed Remotion timeline frames, 0..93):
 *  - EXACT variant (`CelRun`):  timeline frame f -> unique cel f+1 from
 *    public/cel94/ (94 cels, one per source frame, played once in order).
 *  - LOOP variant (`CelLoop`):  timeline frame f -> cel (f % 26)+1 from
 *    public/cel/ (26 cels repeated; intentional phase drift vs the source).
 *
 * Out-of-range / non-integer frames are rejected, never silently wrapped.
 */

export const EXACT_CEL_COUNT = DURATION; // 94
export const LOOP_CEL_COUNT = LOOP; // 26

function assertTimelineFrame(frame: number): void {
  if (!Number.isInteger(frame)) {
    throw new RangeError(`timeline frame must be an integer, got ${frame}`);
  }
  if (frame < 0 || frame >= DURATION) {
    throw new RangeError(`timeline frame ${frame} out of range [0, ${DURATION - 1}]`);
  }
}

/** Exact variant: unique cel index 1..94 for timeline frame 0..93. */
export function exactCelIndex(frame: number): number {
  assertTimelineFrame(frame);
  return frame + 1;
}

/** Loop variant: cel index 1..26, repeating every 26 timeline frames. */
export function loopCelIndex(frame: number): number {
  assertTimelineFrame(frame);
  return (frame % LOOP) + 1;
}

/** Asset path under public/ for a 1-based cel index. */
export function celPath(dir: 'cel' | 'cel94', index: number): string {
  return `${dir}/f_${String(index).padStart(3, '0')}.svg`;
}
