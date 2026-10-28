# Traverse

Browser journeys in Vitest, with exact checks and optional agent steps.

**Source preview.** Traverse is a new companion library with a real Playwright
adapter. Runtime, Vitest and browser acceptance are still pending their explicit
check scopes. It is not published to npm. The [owning contract](docs/spec.md)
preserves the complete delivery requirements and proof boundaries.

Traverse uses your existing Vitest and Playwright installations. It creates one
fresh browser context per session, bounds operations and cleans up that context.
Vitest keeps collection, retries, test verdicts and reporting. No model, account,
browser launch, package installation, telemetry or cloud service is discovered
or started by the library.

## Use in an existing test project

Node.js 24+; consumer-supplied Vitest 4 and Playwright 1.57 APIs are the inspected
integration profile. Install the source package into your existing test project
only after reviewing your dependency changes. Traverse has no runtime dependencies.
Browser binaries and third-party tools are not included or downloaded.

```ts
import { test as base } from 'vitest';
import type { Session } from '@alvarovillalbaa/traverse';
import { createPlaywrightDriver } from '@alvarovillalbaa/traverse/playwright';
import { createUiFixture } from '@alvarovillalbaa/traverse/vitest';

// browser is your explicitly created Playwright Browser.
const test = base.extend<{ ui: Session }>({
  ui: createUiFixture({
    createDriver: ({ signal }) => createPlaywrightDriver(browser, {
      baseURL: 'http://127.0.0.1:4177/', signal,
    }),
  }),
});

test('marks a checklist reviewed', async ({ ui }) => {
  await ui.app.open('/');
  await ui.screen.getByRole('button', { name: 'Mark reviewed' }).click();
  await ui.check(ui.screen.getByRole('status', { name: '' }))
    .hasText('Ready for review');
});
```

The complete [example](examples/journeys.test.ts) owns its browser launch/close
explicitly and uses an [authored local app](examples/app/index.html). Its separate
`node examples/server.mjs` command serves only that app on loopback. Nothing in
the example is run by importing Traverse. Actual execution still needs its
reviewed browser/runner environment; a source example is not acceptance proof.

## Exact interaction and checks

Select by role and exact accessible name, label, text, or test ID. Locators expose
`click()`, `fill(value)` and supported `press(key)` actions. Actions and text/value
checks require one matching control. `check(locator)` supports `isVisible()`,
`hasText(text)`, `hasValue(value)` and `count(number)`. Text/value comparisons use
the exact returned values; lookup whitespace semantics belong to Playwright.
Count checks can assert an absent control.

The initial defaults are a 30-second session, five-second steps, three-second
cleanup, 20 actions and ten agent steps. Operations on the same session must be
awaited sequentially. Different tests receive isolated contexts. A timeout or
abort fences subsequent work; it does not undo actions already performed.
Failed sessions remain failed: closing cleans the owned context and then rejects
with the terminal reason. This exposes idle cancellation/timeouts and failed
steps even when a body forgot to await them. Use passing negative checks such
as `count(0)` for an expected absence. Blocking synchronous user code cannot be
preempted; elapsed-time checks reject its late return.

Explicit navigation must use the configured HTTP(S) origin. The adapter checks
the current URL around operations and stops without returning foreign UI data
when navigation leaves it. This check detects attempted navigation; it does not
prevent every outgoing request or redirect. There is no network sandbox.

## Bring an executor deliberately

An optional executor receives `{mode,goal,observation,signal,act}`. The observation
is bounded URL/ARIA content. `act(action)` is runtime-owned, validates the target,
counts actions and returns fresh bounded UI data. In `act` mode the executor
returns `{status:'done'}` or `{status:'blocked'}`. Assertion mode cannot mutate
the app and must return `passed`, `failed` or `blocked` explicitly.

```ts
import { openSession } from '@alvarovillalbaa/traverse';

const ui = await openSession({
  createDriver,
  executor: yourExplicitExecutor,
});
try {
  await ui.app.open('/');
  await ui.agent.act('Mark this checklist reviewed');
  await ui.check(ui.screen.getByRole('status', { name: '' }))
    .hasText('Ready for review');
} finally {
  await ui.close();
}
```

Import `openSession` from the main package for direct sessions. No executor is
configured by default. Your executor owns any provider, credentials, redaction
and inference spending; runtime action limits do not meter opaque model calls.
Treat observations as untrusted app data. Late results cannot relax the runtime's
limits or continue dispatching actions after the step ended.

## Replay after verification

Pass `replay:{scope,store:createMemoryReplayStore()}` to opt in. Choose a scope
that identifies your app version and test. The exact goal and initial UI
fingerprint further bind each lookup. A completed agent action remains pending
until a later deterministic locator visibility/text/count check passes and the
observed URL/ARIA state has changed. An already-true check with unchanged UI
does not create a recording; test authors still own whether their check verifies
the stated goal. A
passing Vitest test, arbitrary value assertion or model verdict does not qualify
the recording. Intervening manual actions invalidate pending actions.

Only click/press sequences are replayable in this profile. Fill values, value
checks and model verdicts are not cached. Recordings remain in explicit local
memory; there is no automatic disk, server or cross-test persistence. On a later
hit, Traverse rechecks the context, targets, qualifying check and exact final UI
fingerprint. Divergence
after replay begins fails; it does not blindly repeat actions through a live
executor. Semantic assertions always execute live.

The second example labels its executor as scripted and verifies a record/replay
journey. That demonstrates the executor seam; it is not an AI quality claim.

## Evidence and verification

`ui.evidence()` returns detached bounded lifecycle/step records with finite
status/error codes and timings. It excludes goals, raw ARIA observations, targets,
fill values and raw driver errors. Lifecycle is distinct from the Vitest verdict.
An optional fixture `onEvidence` callback is explicit; no report is written or
uploaded automatically. Its `testState` context is the runner state observed
during teardown, before any later fixture/report failure changes the final
verdict. Cleanup and evidence callback failures remain visible to Vitest.

```sh
node scripts/check.mjs
git diff --check
```

The source checker parses JavaScript, package metadata and local references
without importing product/test modules. Declaration/example syntax and exact
authored check scopes are recorded in [acceptance](docs/acceptance.md). No test,
browser, model, install, CI or hosted result is implied by a static check.

## Files and provenance

- `src/session.js`, `src/replay.js`, `src/protocol.js`: session, executor and verified replay.
- `src/playwright.js`, `src/vitest.js`: explicit real-driver and host-runner integration.
- `types/`: dependency-free structural declarations.
- `examples/`: authored app and complete consumer example.
- `tests/unit/`: authored T2 contract fixtures; execution is separately approved.

The design is informed by [tester-army/e2e](https://github.com/tester-army/e2e),
identified by Alvaro, and official [Vitest/Playwright contracts](docs/references.md).
Implementation and examples are original. MIT licensed.
