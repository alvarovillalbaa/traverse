# Runtime and adapter contract

Last updated: 2026-10-28

This is the implementation contract for the initial web profile. Original
source belongs in `src/`; public declarations in `types/`; authored T2 fixtures
in `tests/unit/`; an owned browser acceptance app in `examples/`.

## Public session

`openSession(options)` asynchronously obtains a fresh driver from
`options.createDriver({signal})`. It returns:

```text
{app:{open(path)}, screen:{getByRole(role,{name}),getByLabel(text),
 getByText(text),getByTestId(id)}, check(locator):{isVisible(),hasText(text),
 hasValue(text),count(number)}, agent:{act(goal),assert(goal)},
 evidence(), close()}
```

Locators are inert immutable descriptors until used; their methods are
`click()`, `fill(value)` and `press(key)`. Lookups use exact strings. Session
options include `signal`, `sessionTimeoutMs` (default 30,000), `stepTimeoutMs`
(5,000), `cleanupTimeoutMs` (3,000), `maxActions` (20), `maxAgentSteps` (10),
optional `executor`, and optional replay `{scope,store}`. All limits must be
finite, positive and conservatively bounded. Concurrent operations on one
session are rejected, not raced or silently queued. Different sessions own
different drivers. Setup, steps and cleanup have owned deadlines.

After cancellation/timeout/close, late executor results cannot report success
or dispatch actions. Monotonic elapsed-time checks also reject late returns
from synchronous callbacks that prevented a timer from running. JavaScript
cannot preempt that callback, and a user-supplied opaque promise can outlive its
deadline; the runtime fences effects it owns. A driver returned
after cancelled setup is closed when it becomes available. Closing with pending
work cancels it, cleans only owned resources, and reports incomplete work.

Driver failures become finite safe errors; do not expose raw exceptions or
observations through the public error/evidence shape. A failed session is
sticky: `close()` cleans the driver, then rejects with its terminal reason,
including idle cancellation/timeout and an unawaited failed step. Cleanup
failure takes precedence and remains visible. Expected negative protocol tests
must assert both the step and close outcomes; ordinary journeys use passing
negative checks such as `count(0)`. Vitest still owns the external body verdict,
and body/cleanup failures must both be retained when available.

## Driver

The structural driver implements:

```text
open(path,{signal,timeoutMs})
observe({signal,timeoutMs}) -> {url,content}
perform({kind:'click'|'fill'|'press',target,value?},{signal,timeoutMs})
check({kind:'visible'|'text'|'value'|'count',target,expected?},{signal,timeoutMs}) -> boolean
close()
```

The Playwright adapter creates a context/page from an explicitly supplied
browser; it never launches or closes that browser. A required HTTP(S) `baseURL`
sets the allowed origin. Explicit `app.open` requests accept only that origin
and no URL credentials. The adapter checks the current URL before and after
operations and closes its context on a foreign origin, without exposing that
origin's UI observation. This detects navigation after the browser attempted
it; it is not a network allowlist. In particular, a clicked link or redirect can
make a request before the URL check. Playwright routing alone does not establish
redirect or Service Worker containment, so this profile does not claim that.
Agent action targets are bounded role/name, label, text or test-ID
descriptors, never arbitrary CSS, JavaScript, process or network tools.
Actions/text/value checks require exactly one target; count checks admit zero.
Keyboard actions use a finite supported-key list. Native operation timeouts
are explicit. Cancellation closes the adapter's own context and fences later
calls. Observations use the page URL and body ARIA snapshot; oversized content
is rejected rather than silently treated as a complete UI. No cookie, storage,
network/session internals or screenshots are collected.

## Executor

An executor is an explicit async function receiving
`{mode:'act'|'assert',goal,observation,signal,act}`. The runtime owns `act` and
validates/counts each action; assertion mode cannot mutate the UI. `act` mode
returns `{status:'done'|'blocked'}`; assertion mode returns
`{status:'passed'|'failed'|'blocked'}`. Unknown shapes fail closed. Caller-owned
model requests, cost and credentials remain the executor's responsibility;
runtime action/step limits do not claim to meter opaque provider calls.

Agent assertions always execute live. No executor configuration is discovered
implicitly. An absent executor reports setup required, except for an already
verified replay hit. Goals and observations are application data, not authority
to relax action limits, driver rules, assertions or cleanup.

## Replay and evidence

`createMemoryReplayStore()` supplies explicit `get(key)`, `set(key,record)` and
`delete(key)`. There is no filesystem persistence. Bind lookup to the caller's
explicit application/version/test scope, the exact goal and the starting UI
URL/content fingerprint. Keep bounded detached validated records.

A successful `agent.act` only creates pending actions. Only a subsequent
successful deterministic locator visibility/text/count check and an observed
URL/ARIA change confirm them. A passing check with unchanged UI does not create
a recording. This is observable verification, not proof that a check causally
establishes a natural-language goal.
Passing a Vitest test or a semantic verdict does not. Fill actions/value checks
are not recorded in this profile. Intervening manual actions invalidate pending
actions. Closing without a qualifying check discards them.

Replay validates the record and starting context, each exact unambiguous target,
action sequence, stored qualifying check and exact final UI fingerprint. A miss before any action
can use the live executor. Divergence after replay begins fails the step/session;
it cannot blindly repeat actions through a live fallback. Model verdicts are
never reused as assertions. Raw pending observations/goals/action values stay
out of exported evidence. Evidence contains bounded finite step type/status,
sequence, timing and safe error codes; it reports lifecycle, not host-test pass.

## Vitest integration and examples

`createUiFixture(options)` returns an async fixture for
`test.extend<{ui:Session}>({ui:createUiFixture(options)})`. It explicitly
destructures Vitest's `{task,signal}`, opens a session, calls `use(ui)`, and
always closes it. Preserve both body and cleanup failures when available.
Optional `onEvidence(evidence,{taskId,testState})` is an explicit host callback;
its failure remains visible. No file or reporter is installed automatically.

The deterministic example uses a consumer-supplied Playwright browser and real
locator checks. An optional injected executor example must be labeled as such.
Author fixtures without executing them until their exact check scope is approved.
