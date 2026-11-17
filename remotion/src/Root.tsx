import React from 'react';
import {Composition} from 'remotion';
import {RunCycle} from './RunCycle';
import {CelRun} from './CelRun';
import {DURATION, FPS} from './puppet/keys';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="RunCycle" component={RunCycle} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="CelRun" component={CelRun} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
  </>
);
