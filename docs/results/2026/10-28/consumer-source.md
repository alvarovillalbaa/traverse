# Installed-consumer source receipt

28 October 2026. Status: authored acceptance source only. No consumer dependency
resolution, installation, strict consumer typecheck, real runner, HTTP server,
browser or CI execution is claimed.

The [proposal](../../../proposals/consumer-checks.md) defines a strict installed
public-type consumer and 17 actual-runner cases: 3 positive fixture lifecycle,
6 ordinary intentional failures and 8 real Chromium journeys. The SDK runtime,
public declarations, package manifest and all 28 frozen initial files remain
byte-identical to the [initial source](source-fingerprint.json). These new
acceptance/proposal files are outside the explicit SDK package file list.

The source review separated real host verdicts from session evidence. The
standard pinned Vitest JSON reporter omits unhandled errors, so the proposal
requires a companion completion/global-error receipt. Its external validator
requires exact cases, exits and individual failure markers. A blanket nonzero
exit cannot satisfy the negative scope. The browser suite adopts a supplied
browser and asserts closure of its owned contexts while preserving a consumer
context. Scripted executors remain authored input, not model-quality evidence.

The inactive workflow stages an archive-installed consumer outside the checkout,
with scripts disabled for npm resolution/installation and an explicit browser
download. Its supervisor bounds processes, output and readiness, verifies SDK
bytes after installation and records lock/tool/source identities. Ownership and
process-group cleanup are finite mechanisms, not a network or descendant
sandbox. Forced process termination fails acceptance.

Local Storage Guard stopped the estimated installation at 17.9 GiB free versus
34.0 GiB required. A read-only npm metadata lookup failed with `ENOTFOUND` for
the registry through local DNS; no lock was generated and no package installed.
The official npm versions page lists the selected Node type package. Exact
top-level pins leave transitive resolution pending approval; the first retained
lock must identify the eventual environment.

The [consumer source seal](consumer-source.json) records the exact new source,
templates, cases and environment. Source-only checks parse JavaScript and
TypeScript syntax without importing the SDK, inspect JSON/YAML and shell syntax,
verify local documentation targets and compare the frozen source hashes.
These checks establish authored source coherence, not actual API compatibility
or runtime acceptance. The separate 45-case local request remains pending and
is not included in this proposed CI job.

Final source checks used existing Node 24.21.0 and TypeScript 5.9.3: 16
JavaScript files, one inline app script and seven TypeScript/template files
parsed without execution. The repository checker resolved 28 local document
links; the sealed-file review resolved 19 links within its own subset. Existing
Ruby parsed the inactive YAML and `bash -n` accepted all five shell blocks.
The first YAML helper used an unavailable Ruby `filter_map`; replacing that
helper expression with `map.compact` completed the source-only check. All 28
initial source hashes and 21 packaged-file hashes matched. Sealed-source and
Git whitespace checks passed; no active workflow or dependency tree exists.

Personal GitHub source publication is authorized by the all-project goal.
Consumer activation still requires the separate supplied workspace §§7 and 14
approval. No `.github` workflow, package lock, `node_modules`, account, model,
provider setting, database, paid plan or cloud app is created by these source
changes. Runtime results and verified publication identities belong in a
separate follow-up receipt, preserving this source seal.
