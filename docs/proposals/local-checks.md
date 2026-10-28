# Focused local runtime check proposal

Last updated: 2026-10-28

Status: authored source; no runtime fixture has executed. The supplied workspace
AGENTS.md §7 requires explicit approval for this new core/domain check scope.
Earlier product checks do not authorize this separate repository.

## Exact scope

Use the existing Node 24 installation, without installation, to run only:

```sh
node --test --test-concurrency=1 --test-timeout=10000 \
  tests/unit/session.test.mjs \
  tests/unit/playwright.test.mjs \
  tests/unit/vitest.test.mjs
```

There are **45 authored cases: 29 session, 11 Playwright-boundary and five
Vitest-fixture cases**. Exact hashes and the source snapshot are recorded in
[the initial receipt](../results/2026/10-28/initial-source.md).
No package-wide glob, consumer example, server, real Vitest runner or browser is
included. The Node runner owns its ordinary isolated test processes; the T2
fixtures create no additional child process or external resource.

| File | Actual boundary |
| --- | --- |
| `session.test.mjs` (29) | Actual session/executor/replay implementation over an independent authored app driver; limits, deadlines, cancellation, late work, sticky failure, privacy and verified replay |
| `playwright.test.mjs` (11) | Actual adapter over authored Playwright-shaped objects; strict native-call arguments, observed state, navigation detection and owned resource cleanup |
| `vitest.test.mjs` (5) | Actual fixture over authored host callbacks/task records; setup/use/cleanup/cancellation/evidence outcomes, without executing Vitest |

All data is T2 authored input and in-memory controls. Tests use local timers,
deferred promises and bounded synchronous-delay probes, not a database, browser,
HTTP server, model, existing account, production service or real provider. A
scripted executor is explicitly a fixture. No CI, dependency, credentials or paid
enrollment is part of this request.

## Recording and limits

Record the actual Node version/executable, source commit and hashes, exact
command, exit status, raw-output hashes and actual discovered/pass/fail/cancel/
skip/TODO totals under the owning results directory. Preserve failure evidence.
Bounded implementation fixes for these covered contracts and reruns of these
same authored cases may follow a failure; record each changed source identity.
Adding cases or broadening into a real runner/browser needs a fresh scope.

Passing would establish only these source/runtime contracts with authored
boundaries. It would not prove real browser actionability, Playwright/Vitest
integration, model quality, provider spend, package installation or device/mobile
support. The complete [acceptance contract](../acceptance.md) remains binding.
