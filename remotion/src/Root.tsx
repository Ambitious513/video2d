import React from 'react';
import {Composition} from 'remotion';
import {RunCycle} from './RunCycle';
import {CelRun} from './CelRun';
import {CelLoop} from './CelLoop';
import {Comparison} from './Comparison';
import {DURATION, FPS} from './puppet/keys';

/**
 * Composition registry — must stay in sync with the JOBS manifest in
 * /render-lowram.mjs and the deliverables table in METHOD.md (enforced by
 * remotion/scripts/verify-compositions.mjs).
 *
 *   CelRun      EXACT: 94 unique traced cels (public/cel94/), played once.
 *   CelLoop     LOOP:  26 cels (public/cel/) repeated, expected phase drift.
 *   RunCycle    Procedural puppet (src/puppet/), no traced artwork.
 *   Comparison  Labelled 4-panel proof: source / exact / puppet / overlay.
 *
 * All compositions share the source timeline: 94 frames @ 24 fps, 1920x1080.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="CelRun" component={CelRun} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="CelLoop" component={CelLoop} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="RunCycle" component={RunCycle} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="Comparison" component={Comparison} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
  </>
);
