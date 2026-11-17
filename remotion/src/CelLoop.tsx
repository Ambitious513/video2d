import React from 'react';
import {AbsoluteFill, Audio, Img, staticFile, useCurrentFrame} from 'remotion';
import {celPath, loopCelIndex} from './cels';

/**
 * 26-CEL LOOP (lightweight comparison/control, NOT the fidelity deliverable).
 * Repeats the 26 cels in public/cel/ with modulo indexing over the same
 * 94-frame timeline: timeline frame f shows cel (f % 26) + 1.
 * The source stride is not exactly 26 frames, so this variant drifts out of
 * phase over the clip — that drift is expected and is measured, not hidden.
 * Original audio is attached exactly once, here at the composition root.
 */
export const CelLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const name = celPath('cel', loopCelIndex(frame));
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      <Img src={staticFile(name)} style={{width: 1920, height: 1080}} />
      <Audio src={staticFile('audio.m4a')} />
    </AbsoluteFill>
  );
};
