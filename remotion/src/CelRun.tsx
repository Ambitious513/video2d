import React from 'react';
import {AbsoluteFill, Audio, Img, staticFile, useCurrentFrame} from 'remotion';
import {LOOP} from './puppet/keys';

/** Faithful flat-2D vector recreation: vtracer-traced SVG cels, looped. */
export const CelRun: React.FC = () => {
  const frame = useCurrentFrame();
  const cel = (frame % LOOP) + 1;
  const name = `cel/f_${String(cel).padStart(3, '0')}.svg`;
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      <Img src={staticFile(name)} style={{width: 1920, height: 1080}} />
      <Audio src={staticFile('audio.m4a')} />
    </AbsoluteFill>
  );
};
