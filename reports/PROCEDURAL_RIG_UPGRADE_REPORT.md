# Procedural Rig Upgrade Report — Phase 1

**Date:** 2026-11-18  
**Phase:** 1 — Fixed-length skeleton + generic two-bone IK  
**Status:** COMPLETE  
**Completion Commit:** `aacdb61`  

## 1. Mission Accomplished
Phase 1 successfully transforms the procedural puppet from an unconstrained, stretchy prototype into a rigid, character-specific skeleton solved with a generic two-bone inverse kinematics (IK) system. The historical Test I failure (bone max/min ratio 2.891x) is now resolved: the solved bone-length error is effectively zero (max 1.421e-13 px across 94 frames x 8 bones).

## 2. Key Implementations
- **`remotion/src/puppet/rig.ts`**: Defines character-specific fixed bone lengths (thigh 186.00, calf 177.82, upper arm 115.91, forearm 91.97, foot artwork 87.30), explicit bend-side hints, and named attachment anchors. Calibrated from raw measured keys using robust median/trimmed mean.
- **`remotion/src/puppet/ik.ts`**: Generic analytic two-bone solver shared by all limbs. Features annulus clamping with documented EPS, deterministic degenerate-direction fallback, and loud rig-error throws for invalid data.
- **`remotion/src/puppet/pose.ts`**: Pure frame evaluator. Raw measured targets are preserved alongside solved joints, with per-limb residual, mid-deviation, and bend-side diagnostics.
- **`remotion/src/puppet/Runner.tsx`**: Updated to consume solved joints. Geometry, palette, and draw order remain unchanged (visual construction is deliberately deferred to Phase 3).
- **Test I Rewrite**: Per master plan 9.7, the primary gate is now solved configured-length (+/-0.5 px), IK residual, and bend stability. The noisy raw-track variation is retained as a non-gating diagnostic, and the historical 2.891x FAIL stays verbatim in `reports/baseline/`.
- **`verify.mjs` Scope Audit**: The obsolete `puppet-unchanged` gate was replaced by a reconciliation-assets-protected scope audit vs `5d4d13a`, ensuring protected assets and frozen Phase 0 records remain byte-identical.

## 3. Verification Results
- **Unit Tests**: 45/45 PASS (`remotion/test/ik.test.ts`, `rig.test.ts`, `pose.test.ts`). Covers reachable, max, beyond-max, too-close, coincident, both pole hints, mirrored facing, folded, purity, invalid rig data, equal-length bones, and a seeded 500-target sweep.
- **Motion Validation**: 12/12 PASS (`npm run verify:motion`). Worst bone-length error 1.421e-13 px; reachable end-effector residual 0 px with 0 clamped frames; bend sides constant including the 25->26 wrap.
- **Determinism**: Out-of-order frame evaluation produces identical results.
- **Scope Audit**: PASS. All changed/new files are within the allowed upgrade scope. Protected reconciliation assets remain byte-identical to baseline `5d4d13a`.

## 4. Artifacts Generated
- `reports/ik-validation.json`: Solver cases, bone-length errors, residuals, clamping cases.
- `reports/motion-validation.json`: Frame-wide determinism, continuity, bounds.
- `reports/test-matrix.json`: Updated combined acceptance results.
- `reports/logs/*`: Typecheck and unit test logs.

## 5. Known Limitations & Next Steps
- **Limitation**: Visual construction still uses independent rounded strokes for limbs (Phase 3 deliverable). Foot geometry is a separate artwork pivot, not yet fully integrated with ground contact.
- **Next Step (Phase 2)**: Implement ground contacts and stance locking. Define the 94-frame contact track, world-space anchors, root-motion contract, and foot-slip tests (<0.5 px/frame during stance).

## 6. Reproduction Commands
1. `git clone https://github.com/Ambitious513/video2d.git`
2. `cd video2d && git checkout feat/constrained-puppet-rig`
3. `cd remotion && npm install && npm test`
4. `npm run verify:motion && npm run verify:ik`
5. `cd .. && node verify.mjs --only=scope-audit,typecheck,unit-remotion`

## Phase 2.1 — Ground Contract + Foot-Contact Track Schema (IN PROGRESS)

**Date:** 2026-11-18T13:05Z  **Sub-task status:** COMPLETE (schema); Phase 2 gate NOT yet met.

### Deliverables
- `remotion/src/puppet/motion/contacts.ts`: `ContactState`, `GroundContract`, `RootMode`, `ContactInterval`, `FootContactTrack`, pure `expandTrack`/`getContactAtFrame`/`stanceFrames`.
- `remotion/scripts/contact-candidates.ts` + `reports/foot-contact-candidates.json`: deterministic per-frame toe/ankle height + velocity diagnostics.
- `remotion/test/contacts.test.ts`: 9 schema tests incl. an honesty guard (no fabricated stance).

### Key finding (provisional, drives Phase 2.2)
Ground estimate (max solved toe Y) = **974.92 px**. Static-ground stance candidates = **0**. At the lowest toe frames |toe vx| ~ 65 px/frame, so NO frame is both low AND horizontally slow against a static ground. This is the treadmill signature of a run-in-place performance. Belt-velocity hypothesis = **-64.91 px/frame**. Contact-height windows (toe height <= 8 px): near 17-19/43-45/69-71; far 4-6/30-32/56-58/82-84. All labelled **uncertain** pending Phase 2.2 source/manual review (master plan §6.2 — no fabricated stance).

### Verification this sub-task
- `npm run typecheck`: PASS
- `npm test` (45 prior + 9 new = 54): PASS
- `npm run verify:contacts`: PASS
- Full `node verify.mjs` suite + scope-audit: NOT RUN this sub-task (shallow clone; deferred to Phase 2.4 completion boundary).

### Next (Phase 2.2)
Validate treadmill-belt vs root_motion against source shadow/contact evidence; render a labelled contact timeline; manually review; finalize labels; write `reports/foot-contact-validation.json`. Stance locking is Phase 2.3.
