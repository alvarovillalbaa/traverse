# Initial Traverse source

28 October 2026. Status: source preparation/static review; no runtime fixture,
consumer runner, browser, executor/provider or model acceptance is claimed.

The [owning brief](../../../spec.md) is the new framework complementary to Vitest,
with the user-confirmed e2e reference. This dedicated source implements an
original session/replay core, a real structural Playwright driver and a lazy
Vitest fixture. The actual consumer integrations remain unexecuted until their
separate environment and check approvals.

## Source and review boundary

The core owns validated actions, exact locator checks, bounded observations,
action/agent/step limits, monotonic deadlines, cancellation and cleanup. Replay
is explicitly local-memory-only: actions need a later deterministic check and
changed observed UI, and replay verifies the exact ending fingerprint. Fill
values/model verdicts are not cached. Exported evidence omits raw app content,
goals, targets, fill values and driver errors.

Source review tightened exact Unicode binding, unchanged-UI record rejection,
pending/late executor calls, timer starvation by synchronous callbacks,
idle/unawaited failure propagation and incomplete-close evidence. Adapter/fixture
review corrected exact text reads, task forwarding and opaque error accessors.
These are inspected source semantics, not observed runtime passes.

Counters describe validated action attempts charged before driver dispatch and
agent-step attempts, including failed attempts. They do not prove a UI change or
meter provider requests. A cleanup step describes resource-cleanup completion;
it is separate from the sticky session outcome and final Vitest verdict.
Navigation detection happens after a browser may have attempted a request;
there is no network sandbox. Opaque consumer code/promises may outlive a fence,
and JavaScript cannot preempt a blocking callback.

The [focused runtime proposal](../../../proposals/local-checks.md) covers only
45 authored T2 cases: 29 session, 11 Playwright-boundary and five host-fixture
cases. None has
executed. Actual Vitest/Playwright journeys and a second checked replay remain
required acceptance; the local example's scripted executor is not model proof.

## Static/package/source delivery

The [source fingerprint](source-fingerprint.json) freezes 28 source, declaration,
example, fixture, script, policy and proposal files. Existing Node 24.21.0 parsed
13 JavaScript files and the authored app's inline script without execution.
Existing TypeScript 5.9.3 strictly checked three public declaration files with
zero diagnostics and parsed the consumer example with zero syntax diagnostics.
This does not typecheck the example against installed consumer packages.
Relative imports, local Markdown targets, package export paths and whitespace
checks passed. Independent source/fixture readback found no further concrete
blocker; all 45 runtime cases remain unexecuted.

An existing npm CLI, invoked through the same Node 24 installation with scripts
disabled, produced a 24,497-byte package. Static tar inspection matched all
21 packaged files byte-for-byte with source, including all public exports and
declarations. No tests, private environment, Git history, acceptance logs or
approval proposals are packed. The fingerprint records the exact artifact
SHA256 and file hashes. It was not installed, imported, published to a registry
or treated as runtime proof. The owned temporary package/cache was removed after
receipt review. No lockfile is needed for this package's zero runtime/dev
dependencies; consumer tools remain separately supplied and gated.

Static checks do not import product modules or execute the example app. No local dependency
installation, large checkout, build, browser download, server, database, CI,
account, provider setting or paid service was used. This library needs no
Vercel/Supabase resource for its Node runtime.

## GitHub publication and open checks

Created the dedicated public
[personal repository](https://github.com/alvarovillalbaa/traverse) and published
source commit
[`334e86cc79d73f75ddc62fb29855b5da051bea1a`](https://github.com/alvarovillalbaa/traverse/commit/334e86cc79d73f75ddc62fb29855b5da051bea1a).
Connected GitHub metadata/ref/tree readback confirmed the public owner/name,
`main` identity and all 30 file paths, modes, types and blob SHAs against local
source, without truncation. The connector cannot create repositories; the
existing GitHub CLI performed the authorized creation/push. No Auth setup,
permission grant or account change was performed.

The separate 45-case request links the immutable proposal at that source.
It requests only existing-Node execution of authored boundaries, not real
Vitest, Playwright/browser, model, installation, CI or cloud resources. No
approval has been inferred from the active portfolio goal. This receipt-only
follow-up preserves all 28 frozen source/proposal hashes and all 21 inspected
package-file bytes. The complete product/portfolio goals remain unfinished
until their actual runtime and consumer integration acceptance is established.
