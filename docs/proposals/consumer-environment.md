# Disposable installed-consumer environment

Last updated: 2026-10-28

Status: source preparation only; dependency resolution, installation, TypeScript checking, runner/browser execution and temporary CI activation are unapproved. This scope is separate from the [45 authored native cases](local-checks.md). It prepares real consumer acceptance under workspace §§7 and 14, without changing Traverse's dependency-free SDK manifest.

## Exact environment

Use one public Ubuntu 24.04 job, Node 24.21.0, capped at 20 minutes. Create a fresh operation-owned directory under `RUNNER_TEMP/traverse-consumer-RUNID`, outside the checkout; do not reuse `tests/tmp` or another application's dependencies. Its proposed private ESM consumer manifest has:

| Manifest entry | Exact value |
| --- | --- |
| `private` / `type` | `true` / `module` |
| `dependencies.@alvarovillalbaa/traverse` | `file:./traverse.tgz` |
| `devDependencies.vitest` | `4.0.16` |
| `devDependencies.playwright` | `1.57.0` |
| `devDependencies.typescript` | `5.9.3` |
| `devDependencies.@types/node` | `24.10.1` |

The official [npm versions listing](https://www.npmjs.com/package/%40types/node?activeTab=versions) includes `24.10.1`. Direct registry and raw-doc requests were unavailable through the local shell's DNS; no npm resolution was attempted for this proposal. Exact top-level versions do not freeze transitive dependencies: after approval, generate the consumer lockfile once, retain its hash and exact bytes, then use it for `npm ci`. A later changed lock is a new environment identity.

## Reviewed flow to prepare

1. Verify the accepted source fingerprints and package contents. Run `npm pack --ignore-scripts` for the SDK and copy the resulting archive to the fresh consumer as `traverse.tgz`; record its SHA-256. Install that archive through the manifest, not a source symlink or TypeScript path alias. Do not publish to npm.
2. Only after approval, use `npm install --package-lock-only --ignore-scripts` to resolve the isolated consumer, hash/retain `package-lock.json`, then `npm ci --ignore-scripts`. Explicitly install only the pinned Playwright Chromium headless shell and its required runner system libraries with the installed local CLI (`./node_modules/.bin/playwright install --with-deps --only-shell chromium`). Keep caches and automatic browser/package installation out of runtime fixture code.
3. Copy the [positive type consumer](../../tests/fixtures/consumer-types.ts) and exact approved acceptance sources into the isolated consumer. Typecheck with the installed TypeScript using strict `NodeNext` module/resolution, `target: ES2022`, `lib: [ES2022, DOM]`, `types: [node]`, `noEmit: true`, and `skipLibCheck: false`. Include only the positive fixture and the reviewed consumer suites. No ambient SDK shim, cast, `@ts-ignore`, `@ts-nocheck` or source-path alias may replace installed public declarations.
4. Run the three explicitly reviewed Vitest suites/configurations using the installed `vitest run --config ...`, one worker, file parallelism off, isolation on and zero retries. The owning approval record must enumerate the actual suite paths/counts and expected nonzero lifecycle runs before activation; do not infer them from this environment recipe. The positive type fixture is not a fourth runtime suite.
5. Retain bounded textual output and JSON runner reports on both success and expected failure, plus exact commands, exits, discovered cases and hashes. Inspect expected body/timeout/cleanup failures individually; an expected nonzero child runner must not become an unexamined blanket success. Remove the temporary active workflow after the approved run. Dispose only the fresh consumer and its owned runner resources.

Root-owned manifest, lock-generation workflow and Vitest configs remain inactive proposal files until approved. No package install, browser download, server, typechecker, runner or CI job was invoked while authoring this document.

## API and proof boundary

The positive fixture imports real Vitest and Playwright modules plus all three installed Traverse entrypoints. It assigns the actual memory store to `ReplayStore`, directly supplies `UiFixture` to `test.extend<{ui:Session}>`, uses actual `Browser` with the adapter, and checks both fixture `createDriver({task,signal})` and standalone session `createDriver({signal})` callbacks. The fixture receives Traverse's child cancellation signal; it must not assume identity with the outer Vitest signal. Evidence remains a session snapshot, while observed runner state during teardown is not its final verdict.

Pinned [Vitest 4.0.16 fixture documentation](https://github.com/vitest-dev/vitest/blob/v4.0.16/docs/guide/test-context.md#testextend) requires destructured fixture/test context. Its [actual types](https://github.com/vitest-dev/vitest/blob/v4.0.16/packages/runner/src/types/tasks.ts#L503-L557) define the fixture callback/`use` contract and [`task`/`signal`](https://github.com/vitest-dev/vitest/blob/v4.0.16/packages/runner/src/types/tasks.ts#L667-L677). The pinned [configuration types](https://github.com/vitest-dev/vitest/blob/v4.0.16/packages/vitest/src/node/types/config.ts#L315-L425) define worker limits, isolation, file parallelism and report output. The [pinned JSON reporter](https://github.com/vitest-dev/vitest/blob/v4.0.16/packages/vitest/src/node/reporters/json.ts#L54-L116) exposes totals and per-test results; keep JSON output separate from the verbose terminal reporter. [Playwright 1.57.0 CLI source documentation](https://github.com/microsoft/playwright/blob/v1.57.0/docs/src/test-cli-js.md#install-browsers) documents explicit Chromium/system-dependency installation. Current unpinned Vitest documentation includes newer APIs; use the pinned fixture contract for this environment.

Syntax parsing of this authored type fixture is not consumer type compatibility. Passing the future installed typecheck would establish declarations/exports for these pinned tools only. Passing the real runner/Chromium scope would establish the owned loopback app and lifecycle behavior only, not model/provider quality, authenticated accounts, cross-origin request containment, other browsers/devices, hosted services or registry publication.
