# Optional OpenAI executor and focused checks

Last updated: 2026-11-12

The owning brief is a Vitest companion with optional agent steps. Its original
provider-free web profile is already accepted. This 0.2.0 extension adds an
explicit `./openai` Responses transport; it does not make a model mandatory.
Alvaro's standing approvals to choose and complete the work cover this bounded
free source, provider-adapter and temporary-CI scope. No live provider call,
credential discovery, account, paid enrollment or production target is used.

The implementation is `src/openai.js`, public declarations are
`types/openai.d.ts`, and the versioned instructions are
`src/prompts/openai-v1.js`. Existing core/session/replay/driver/fixture code and
old case bodies remain unchanged. Explicit model/key, structured decisions,
fresh observations, request/output bounds, aborts and finite errors are the
new contract. The adapter cannot weaken runtime action validation or assertions.

Run only the 26 new `tests/unit/openai.test.mjs` cases and the two new
`tests/e2e/openai.test.ts` cases, plus the scoped installed declaration fixture.
Unit cases use authored Responses objects and independent T2 app state. Browser
cases use actual Chromium, Playwright, Vitest, the installed package, the
authored app and an owned loopback HTTP Responses fixture. A completed HTTP
response alone never establishes the app outcome. Exact native checks verify
the UI and qualify replay. Assertions stay live and mutation-free. Scripted
decisions establish transport/runtime integration, not model intelligence.

Local Storage Guard measured 0.3 GiB free against 38.0 GiB required. No local
install, build, runtime test, server or browser execution is allowed by that
preflight. Local syntax/reference checking and `git diff --check` remain safe.

One temporary public Ubuntu 24.04 job, capped at 20 minutes, checks out the
published immutable source. Its inactive
[workflow template](openai-checks.workflow.yml.example) is copied only to the
named QA branch after source publication. The controller packs and verifies
every packaged file against checkout bytes, then installs only a new directory
under `RUNNER_TEMP`. It retains the consumer's existing exact tool pins:
Node 24.21.0, Vitest 4.0.16, Playwright 1.57.0 and TypeScript 5.9.3. A fresh
consumer-only dependency lock is retained in the textual run evidence.
Product dependencies remain empty. No legacy suite is rerun.

Commands have individual deadlines and bounded output. Failed commands retain
stdout/stderr and exit/signal information; failed browser JSON is retained too.
The browser fixture owns and closes its servers, contexts and launched browser.
The controller removes only its exact consumer directory, including temporary
cache and browser tools. The final step uses the ephemeral job token solely to
disable its identified workflow and delete the exact unchanged QA ref. Source
main has no active workflow. Complete job logs and acceptance/failure receipts
will be kept under `docs/results/2026/11-12/` after the run. Until then this new
scope is unverified; the 45/17 historical results qualify only their old source.
