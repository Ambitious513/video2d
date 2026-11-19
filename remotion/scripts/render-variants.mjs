#!/usr/bin/env node
/**
 * Phase 4 — render ACTUAL Remotion stills of both character variants.
 *   node remotion/scripts/render-variants.mjs --frames 0,12,25,26,34,72,93 \
 *     --out reports/p4-new
 * Bundles a temporary entry exposing `VariantRunner` and `VariantTeal`
 * compositions (the same PuppetVariant component, pinned variant), renders a
 * still per frame, and writes <variant>_<NNN>.png. Does not touch Root.tsx or
 * the four main compositions. Low-RAM safe (one bundle, one still at a time).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REMOTION = path.resolve(HERE, '..');
const ROOT = path.resolve(REMOTION, '..');
const toolsRequire = createRequire(path.join(ROOT, 'tools', 'package.json'));
const sharp = toolsRequire('sharp');

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const frames = opt('frames', '0,12,25,26,34,72,93').split(',').map(Number);
const outDir = path.resolve(ROOT, opt('out', 'reports/p4-new'));
if (frames.some((f) => !Number.isInteger(f) || f < 0 || f > 93)) {
  console.error('frames must be integers in 0..93'); process.exit(1);
}
fs.mkdirSync(outDir, {recursive: true});

// Temporary entry: two compositions, each pinned to one variant.
const entryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-variants-'));
const entry = path.join(entryDir, 'entry.tsx');
fs.writeFileSync(entry, `
import React from 'react';
import {Composition, registerRoot, useCurrentFrame} from 'remotion';
import {PuppetVariant} from '${path.join(REMOTION, 'src', 'puppet', 'Runner').replace(/\\/g, '/')}';
const Runner: React.FC = () => <PuppetVariant frame={useCurrentFrame()} variant="runner" />;
const Teal: React.FC = () => <PuppetVariant frame={useCurrentFrame()} variant="teal" />;
const Root: React.FC = () => (
  <>
    <Composition id="VariantRunner" component={Runner} durationInFrames={94} fps={24} width={1920} height={1080} />
    <Composition id="VariantTeal" component={Teal} durationInFrames={94} fps={24} width={1920} height={1080} />
  </>
);
registerRoot(Root);
`);

const serveUrl = await bundle({entryPoint: entry, logLevel: 'error'});
const variants = [['runner', 'VariantRunner'], ['teal', 'VariantTeal']];
for (const [name, comp] of variants) {
  const composition = await selectComposition({serveUrl, id: comp});
  for (const frame of frames) {
    const out = path.join(outDir, `${name}_${String(frame).padStart(3, '0')}.png`);
    await renderStill({composition, serveUrl, output: out, frame, imageFormat: 'png', logLevel: 'error'});
    const m = await sharp(out).metadata();
    if (m.width !== 1920 || m.height !== 1080) throw new Error(`${name}_${frame}: ${m.width}x${m.height}`);
    console.log(`rendered ${name}_${String(frame).padStart(3, '0')}.png`);
  }
}
fs.rmSync(entryDir, {recursive: true, force: true});
console.log('done');