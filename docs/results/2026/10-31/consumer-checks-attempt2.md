# Installed-consumer checks — second attempt

[Run 41239384035](https://github.com/alvarovillalbaa/traverse/actions/runs/41239384035) **failed at strict typechecking** on 31 October 2026. All **17 runtime cases remain UNRUN**; no companion receipt or runtime validator was produced.

The prepared repair declares only the fixture-owned optional `TaskMeta.traverse`
field in its existing module, using [Vitest's documented metadata extension](https://main.vitest.dev/api/advanced/metadata).
The readonly-ID helper fix, SDK declarations, runtime guards, assertions and
seventeen case names stay unchanged. This repair still needs the pinned rerun.

The first helper-parameter repair was present. TypeScript then isolated the remaining error: `tests/integration/vitest-fixture.test.ts:13:13`, TS2339, custom property `traverse` is not declared on Vitest's `TaskMeta`. This belongs to the authored acceptance fixture, not an established SDK/runtime failure. TypeScript exited 2 with a complete 118-byte diagnostic.

Preparation verified 19 repaired-consumer inputs, all 28 initial files and all 21 package files. Node 24.21.0/Linux and all four pinned tools matched. The installed SDK archive remained `ccba89195ff470c8934654c61e159c69ff18316c50f26e17fd6e1dfdc37ff0e7`; the [51,942-byte lock](consumer-package-lock.json) remained `e28932e1d5d1670975d2628e1e7b5c83423ac6c197687f461b586a23ca83d313`. Its gzip-base64 transport was identical to attempt one. Owned cleanup and bounded artifact upload succeeded.

Source: `988b976c4d5828e905f6cafd66ddfa75e16d026e`; activation: `1258d26f644fd0b1d826d99f742d14bdb9a3166f`. The [JSON receipt](consumer-checks-attempt2.json) preserves diagnostic/result/log hashes. [Attempt one](consumer-checks-attempt1.md) remains unchanged. No browser or example app launched, and no local install/test, model/provider call, production data, real account or paid enrollment occurred.
