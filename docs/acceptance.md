# Acceptance status

Last updated: 2026-10-31

The [owning brief](spec.md) requires a working companion, not only authored
contracts. The [45-case receipt](results/2026/10-31/local-checks.md) records
passing core boundaries on Node 26.8.2. The
[installed-consumer receipt](results/2026/10-31/consumer-checks.md) records
strict types and seventeen accepted contracts on Node 24.21.0: eleven passes
and six individually validated intentional failures, including eight real
Chromium journeys. The original source/publication receipts remain history.

| Layer | Required proof | Current boundary |
| --- | --- | --- |
| Core session, executor and replay | Exact authored runtime fixtures, including deadlines, late work and divergence | 29 core cases passed |
| Actual Playwright adapter | Owned context, strict real controls, navigation/cleanup and observations | 11 boundary cases and eight real Chromium journeys passed |
| Vitest fixture | Real runner setup/use/body failure/timeout/cleanup reporting | Five boundary cases passed; actual runner accepted three lifecycle and six intentional-failure contracts |
| Real journey and replay | Authored app executes; checked second attempt uses no executor | Installed public adapter verified checked replay and owned context isolation |
| Optional executor | Live user-supplied provider behavior, if selected | No provider or account selected; scripted fixtures are not model proof |
| Portable package and GitHub | Export/declaration/artifact inspection and immutable remote readback | Three public entrypoints typechecked in a clean installed consumer; 21-file archive and exact lock verified at the recorded source |

The installed package is qualified at immutable
`6364d80c6bd8ba14c0afdc4c2e87769e993e7b09`, SDK archive SHA-256
`ccba89195ff470c8934654c61e159c69ff18316c50f26e17fd6e1dfdc37ff0e7`.
Later README/acceptance edits are a documentation edition; runtime modules,
declarations and case bodies retain their checked bytes. Historical seals and
their guarded controllers stay bound to their recorded revisions.

Companion schema two independently proves the real runner's 250 ms timeout
message and preserves the abort/body/session-cancellation assertions. All three
runner receipts completed with zero unhandled errors. Owned browser contexts,
server shutdown and consumer-directory cleanup passed. Complete capture of the
intentionally stopped app-server log streams is unverified. The retained
failure history explains the type-helper and JSON formatter repairs.

No Vercel or Supabase resource is needed for the Node test companion. The
authored browser fixture is loopback-only. A hosted dashboard, database, mobile
tooling, model integration and npm registry release are not silently added to
this brief. They remain independent choices if required later.
