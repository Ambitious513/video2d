import React from 'react';
import {AbsoluteFill, Audio, staticFile, useCurrentFrame} from 'remotion';
import {Runner} from './puppet/Runner';

/** Parametric 2D vector puppet — the editable recreation. */
export const RunCycle: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      <Runner frame={frame} />
      <Audio src={staticFile('audio.m4a')} />
    </AbsoluteFill>
  );
};
