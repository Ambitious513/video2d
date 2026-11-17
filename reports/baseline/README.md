# Pre-change baseline evidence (procedural puppet upgrade)

These files are verbatim copies of the committed reports at the reconciled
baseline commit `5d4d13ab92ac38be0397bd2b8feb27e19eefdf98` (`origin/main`),
captured BEFORE any puppet-upgrade change and before the Phase 0 suite re-run
regenerated `reports/*.json`.

- `motion-validation.json` — Test I at baseline: 7/8 PASS, segment-length
  max/min FAIL (worst 2.891x knee->ankle vs 2.0 tolerance).
- `fidelity-all-frames.json` — all-94-frame native-1080p fidelity:
  CelRun MAE 1.046 / CelLoop 2.5423 / RunCycle 5.6307 (char IoU 0.6116).
- `test-matrix.json` — A1–A18 all PASS at baseline.

Provenance: `git show 5d4d13ab92ac38be0397bd2b8feb27e19eefdf98:reports/<name>`
reproduces each byte. Do not edit these copies; later measurements go to new
report files, never over this record.
