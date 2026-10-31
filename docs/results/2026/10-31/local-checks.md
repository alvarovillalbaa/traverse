# Focused local runtime checks

31 October 2026. Executed under the owner's broad all-work approval and root's
explicit instruction to run the existing [45-case scope](../../../proposals/local-checks.md).
**45/45 passed on the first run** at source
`abd36915010dc2a3f932454f00f0665e39db11ea`: 29 session, 11 Playwright-boundary
and five Vitest-fixture cases. There were zero failures, cancellations, skips,
TODOs or suites. No implementation fix or scope extension was needed.

The [machine receipt](local-checks.json) retains the command flags, all 45 actual
names, TAP plan/totals, raw stdout/stderr, hashes and pre/post source fingerprints.
Its executable/command display uses portable basename `node`; the actual existing
binary was version-qualified as **26.8.2** and ran exactly the three prepared files
with concurrency 1, per-test timeout 10 seconds and explicit TAP formatting.
The proposal's conventional Node 24 path was absent; the existing version meets
the package's `>=24` engine. This is Node 26 evidence, not an observed Node 24 run.
Nothing was installed or downloaded to reproduce the historical profile.

The task-owned detached process group had a 60-second wall deadline, three-second
TERM/KILL grace and stdout/stderr caps of 256 KiB/64 KiB. Only `TZ=UTC` entered the
child environment. Node exited 0, with no signal, timeout or output-limit stop;
the runner and its ordinary test workers completed. Stdout was 10,705 bytes,
SHA-256 `bd101645c4bfd0b1ed2ccd94ecf8418c74f285799e00e2b8015b43078071bcee`;
stderr was empty. TAP plan was exactly `1..45`, with all case names matching
the sealed scope.

All 28 inputs in the original [source seal](../10-28/source-fingerprint.json)
matched their recorded SHA-256 values before execution and retained byte/mode
identity afterward. HEAD remained exact abd3691 and the checkout was clean before
writing these two result files. Historical seals and product/test inputs were
not edited. There was no temporary worktree or file fixture to remove.

These are authored T2 app-driver, Playwright-shaped and host-callback boundaries.
No real Vitest runner, browser, server, package installation, database, account,
provider, model, CI or publication ran. The separate 17 installed-consumer cases
and the remaining [product acceptance](../../../acceptance.md) are unverified.
