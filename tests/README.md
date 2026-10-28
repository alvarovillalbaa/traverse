# Traverse check boundaries

The 45 `unit/` cases use authored T2 drivers and host callbacks. Their separate
approval scope is [local-checks.md](../docs/proposals/local-checks.md).

The proposed installed consumer selects only two `integration/` suites and one
`e2e/` suite: 3 positive real-Vitest lifecycle cases, 6 ordinary intentional host
failures, and 8 real-Chromium journeys. Support code stays in `fixtures/` and
operational tools in `scripts/`; neither folder is collected as a suite. The
positive type fixture is compiled, not run.

All input is authored. The lifecycle seam uses a T2 independent app driver.
The browser seam uses the actual SDK, actual Playwright and the actual local
example app with fresh context-owned state; only the optional external model
boundary uses scripted input. There is no persistence engine or replica to
classify as a database tier, and no production/staging target or data access.
The exact exception to a database-oriented E2E tier profile is explicit in the
[consumer proposal](../docs/proposals/consumer-checks.md).

Every suite remains unexecuted pending its owning approval. No default CI is
installed; the proposed consumer is outside the checkout under `RUNNER_TEMP`.
