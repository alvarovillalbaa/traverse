# Traverse: owning product contract

Last updated: 2026-10-28

The [Notion test brief](https://app.notion.com/p/406a1ee8bd0680c29ec6f7e04b2c0065)
contains two requirements: a testing framework complementary to Vitest, similar
to a recently launched e2e framework. The full returned snapshot was inspected;
it is unverified and last edited 28 October 2026 at 10:03:09Z. Alvaro explicitly
identified [tester-army/e2e](https://github.com/tester-army/e2e) as the reference
in this conversation. Its linked OSS Notion page is blank. The separate Pydantic
AI contribution brief is not this product.

## Required outcome

Build an original companion library that lets Vitest tests drive real web
journeys with exact locators/checks and optional natural-language steps. Vitest
continues to own collection, retries, test verdicts and reporting. The companion
owns isolated UI-session lifecycle, validated actions, operation limits,
cancellation, safe step evidence and later-verified replay.

| Requirement | Completion evidence |
| --- | --- |
| Complements Vitest | Real Vitest fixture setup/use/teardown and cancellation, including failed bodies and cleanup failures |
| Actual web journeys | A real Playwright adapter, an executable authored app/example, exact locator actions/checks, and approved browser acceptance |
| Optional agent actions/assertions | A bounded executor interface with actual observation/action flow, finite outcomes and cancellation; injected fixtures alone are contract proof |
| Verified replay | Only a later deterministic check qualifies actions; a subsequent real journey replays them with context/target/outcome verification and no executor call |
| Useful evidence | Bounded redacted step records; distinguish session lifecycle from external test verdict and preserve failures |
| Personal source delivery | Dedicated personal GitHub source readback and portable package contents |

The brief does not name a model/provider, require a hosted service, or make
mobile device support mandatory for launch. The first web implementation must
work without a model for deterministic tests. A configured executor may provide
semantic steps; absent configuration must report that clearly. No dummy driver
or scripted executor is presented as real browser or model acceptance.

## Reference and design decisions

Reference inspection is pinned to
[`tester-army/e2e@a29edcbdf500468a6421066fcef8b1620f351bae`](https://github.com/tester-army/e2e/commit/a29edcbdf500468a6421066fcef8b1620f351bae),
whose core package declares 0.21.3. Its official runner, agent-step and replay
contracts informed the separation of runner/session verdicts, late completion,
qualifying checks and partial replay. Traverse does not copy its source, names,
documentation, or full integration catalogue.

The initial profile uses dependency-free ESM and structural adapters for the
consumer's existing Vitest and Playwright installations. It does not introduce
an installation, browser download, built-in provider, account, telemetry,
automatic CI, database or cloud service. Local-memory replay is explicit;
durable/distributed replay and mobile adapters remain separate extensions.

The original portfolio objective remains active. Source authoring/static
checks do not establish a working verified release. Runtime, Vitest, actual
browser, executor/provider and package acceptance retain their separate evidence
and applicable approval boundaries.
