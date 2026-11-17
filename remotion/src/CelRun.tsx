import React from 'react';
import {AbsoluteFill, Audio, Img, staticFile, useCurrentFrame} from 'remotion';
import {celPath, exactCelIndex} from './cels';

/**
 * EXACT traced-cel reconstruction (the fidelity deliverable).
 * Plays each of the 94 unique vtracer SVG cels in public/cel94/ exactly once,
 * in source order: timeline frame f (0-indexed) shows cel f+1.
 * This composition does NOT loop. The 26-cel loop is the separate `CelLoop`.
 * Original audio is attached exactly once, here at the composition root.
 */
export const CelRun: React.FC = () => {
  const frame = useCurrentFrame();
  const name = celPath('cel94', exactCelIndex(frame));
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      <Img src={staticFile(name)} style={{width: 1920, height: 1080}} />
      <Audio src={staticFile('audio.m4a')} />
    </AbsoluteFill>
  );
};
