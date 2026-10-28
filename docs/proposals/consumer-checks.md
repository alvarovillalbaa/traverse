# Installed-consumer acceptance proposal

28 October 2026. Status: authored, inactive and unexecuted. The supplied
workspace AGENTS.md §§7 and 14 require approval for this new runner/browser,
dependency and temporary CI scope. The separate [45 local cases](local-checks.md)
remain outside this proposal.

## Exact acceptance

Typecheck the installed package's three public entrypoints with the strict
[positive consumer](../../tests/fixtures/consumer-types.ts), then run **17 cases**
in three separate real Vitest invocations:

| Mode | Source | Cases | Required runner exit |
| --- | --- | ---: | ---: |
| `lifecycle` | [`vitest-fixture.test.ts`](../../tests/integration/vitest-fixture.test.ts) | 3 pass | 0 |
| `negative` | [`vitest-negative.test.ts`](../../tests/integration/vitest-negative.test.ts) | 6 ordinary intentional failures | 1 |
| `browser` | [`browser.test.ts`](../../tests/e2e/browser.test.ts) | 8 pass | 0 |

The lifecycle cases prove lazy unused fixtures, an exact checked journey, and
fresh state in a second actual Vitest test. The negative cases cover a body
failure, cleanup failure, evidence callback failure, combined body/cleanup
failure, idle caller cancellation, and a real 250 ms Vitest timeout. They use
ordinary failing tests, not `test.fails` or an ignored child exit.

The browser cases cover exact form controls through the public fixture,
scripted executor observations with live assertions, a checked replay across
fresh contexts, an unchecked action remaining unreplayed, owned context
isolation, cancellation fencing a late action, sticky protocol failure and a
native locator deadline. They use real Chromium, the actual Playwright adapter
and this repository's actual loopback example app. Model responses are authored
executor input; no provider is contacted.

The [result validator](../../tests/scripts/assert-vitest-result.mjs) requires
the exact case names, counts, statuses, expected failure markers and exits.
No skipped, TODO, unexpected or additional cases are accepted. A
[companion reporter](../../tests/fixtures/vitest-receipt-reporter.ts) additionally
requires completed runner teardown and zero unhandled/global errors, because
the pinned standard JSON reporter omits those errors. The negative invocation
counts as accepted only when every expected failure has the matching recorded
body and teardown outcome. Raw JSON alone is insufficient.

## Environment and activation

Use the exact [environment recipe](consumer-environment.md): one public
Ubuntu 24.04 job, Node 24.21.0, Vitest 4.0.16, Playwright 1.57.0,
TypeScript 5.9.3 and `@types/node` 24.10.1. The SDK remains dependency-free.
Install its verified `npm pack --ignore-scripts` archive into a fresh private
consumer under `RUNNER_TEMP`, outside the checkout. No source alias, ambient SDK
shim, suppressed type error or substituted declaration is allowed.

After approval, activate only the
[temporary workflow template](consumer-ci.yml.example) on
`qa/traverse-consumer`. It has read-only repository permissions, pinned actions
and a **20-minute job limit**. It resolves the isolated consumer lock once,
retains the exact lock and hash, runs `npm ci --ignore-scripts`, then explicitly
installs the pinned Chromium headless shell and required runner system
libraries. No package lifecycle scripts, npm publication or SDK dependency
changes are included. Top-level pins do not freeze transitives before that first
lock resolution; the retained lock identifies the actual environment.

The [source stager](../../scripts/prepare-consumer.mjs) verifies this reviewed
source seal, all 28 initial source fingerprints and the 21 SDK package files.
The [consumer supervisor](../../tests/scripts/run-consumer-suites.mjs) checks
installed versions and SDK bytes, typechecks once, then runs the three modes
with one worker, isolation enabled and zero retries. Its limits are 60 seconds
for TypeScript, 90 seconds per suite, 10 seconds per validator, 10 seconds for
server readiness and 110 seconds for the server. The app binds only
`127.0.0.1:4177`; readiness requires the owned process and exact authored HTML.

Child processes receive an allowlisted environment without provider, GitHub,
proxy or Node preload variables. Owned POSIX process groups have bounded
termination and pipe settlement; forced termination, incomplete output or
cleanup failures fail acceptance. Detached or reparented descendants are not
claimed to be contained by process groups. Normal browser/context closure is
asserted by the suite; the disposable runner is the final resource boundary.

Retain at most 3 MiB of textual evidence for one day: exact lock, preparation,
environment and run receipts, JSON reports, companion receipts and bounded
logs. Captured child logs share a 1 MiB limit. The upload step runs only if its
artifact inventory/budget check succeeds. Remove the active temporary workflow
after the focused run. Bounded fixes to these covered contracts and reruns of
the same 17 cases may follow failures, recording changed source identities and
reusing the retained lock. New cases, versions or external integrations need a
new scope.

## Current evidence and limits

Only source, syntax, linkage, package-boundary and whitespace inspection has
run. Local Storage Guard reported **17.9 GiB free, 34.0 GiB required** for the
estimated consumer operation, so local installation remains stopped. A
read-only npm metadata request failed with local DNS `ENOTFOUND`; no dependency
resolution, lock generation, install, typecheck, runner, server, browser or CI
job has run for this consumer.

This uses authored data and independently owned local app state, with no
database, existing account, production data, model call, provider setting,
payment or paid enrollment. The browser system under test is the actual app
and SDK, not a replacement driver. There is no database replica or database
claim. Success would cover only this pinned consumer, real runner lifecycle and
owned Chromium app. Model quality, authenticated services, mobile/touch, other
browsers and cross-origin network containment remain unproved. The complete
[acceptance contract](../acceptance.md) still applies.
