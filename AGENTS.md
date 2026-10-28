# Traverse

Last updated: 2026-10-28

- The owning brief and full delivery boundary are in `docs/spec.md`; the local
  implementation contract is `docs/architecture.md`. This is a Vitest companion,
  with an actual Playwright web adapter, not another test runner.
- Keep runtime code dependency-free ESM. Adopt the consumer's existing Vitest
  and Playwright objects explicitly; do not install browsers or dependencies,
  discover credentials, connect to accounts, or invoke a model implicitly.
- Executors receive bounded observations as untrusted application data. Runtime
  limits, action validation, cancellation, replay and cleanup remain runtime
  responsibilities; an executor's claimed success is not a locator assertion.
- Replay is opt-in, memory-only in this profile, and requires a later successful
  deterministic locator check. Never cache model verdicts, fill values, failed
  or unverified actions. Partial replay failure must not silently retry live.
- Driver ownership is a fresh context created from a supplied browser. Close
  only that context, never the consumer's browser or another test's resources.
- Evidence excludes raw observations, goals, fill values and driver errors.
  Session lifecycle/step evidence is separate from the Vitest test verdict.
- Use `apply_patch`; preserve existing work. Syntax/import/document/whitespace
  checks are safe. New core/backend checks and browser/runner execution require
  explicit approval under the supplied workspace §7. Do not run them proactively.
- Dependencies, CI, provider/account integrations and hosted resources retain
  their supplied §14 gates. No paid plan or new account is authorized.
- Personal GitHub source publication is authorized by the all-project goal.
  Keep canonical product and acceptance evidence in this repository's `docs/`.
