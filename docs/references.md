# Primary integration sources

Last updated: 2026-11-12

The team inspected these official sources without cloning repositories or
installing dependencies. Reference behavior informs the implementation; it is
not runtime evidence or permission to execute tests on another application.

| Source | Contract used |
| --- | --- |
| [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | Inspected 2026-11-12: Responses `text.format`, strict object schemas, nested anyOf, nullable actions, refusals and incomplete results |
| [OpenAI Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create) | Inspected via official documentation search 2026-11-12: explicit model, `store`, `stream`, output/reasoning token bounds; the fetched page is a generated-reference stub |
| [Notion brief](https://app.notion.com/p/406a1ee8bd0680c29ec6f7e04b2c0065) | Framework complementary to Vitest; user clarified the e2e reference in chat |
| [e2e README at a29edcb](https://github.com/tester-army/e2e/blob/a29edcbdf500468a6421066fcef8b1620f351bae/README.md) | Deterministic and agent steps, external engines, runner separation |
| [e2e runner](https://github.com/tester-army/e2e/blob/a29edcbdf500468a6421066fcef8b1620f351bae/docs/reference/runner.mdx) | Host/session lifecycle; session trace is not an external test verdict |
| [e2e agent steps](https://github.com/tester-army/e2e/blob/a29edcbdf500468a6421066fcef8b1620f351bae/docs/agent-steps.mdx) | Runtime-owned limits, checked actions, cancellation and late completions |
| [e2e replay](https://github.com/tester-army/e2e/blob/a29edcbdf500468a6421066fcef8b1620f351bae/docs/cache.mdx) | Later qualifying checks and guarded replay; not arbitrary host assertions |
| [Vitest 4.0.16 context](https://github.com/vitest-dev/vitest/blob/v4.0.16/docs/guide/test-context.md) | Destructured fixtures, test signal and fixture teardown |
| [Vitest fixture implementation](https://github.com/vitest-dev/vitest/blob/v4.0.16/packages/runner/src/fixture.ts) | `use`/cleanup is distinct from the runner's recorded body failures |
| [Playwright 1.57 Browser](https://github.com/microsoft/playwright/blob/v1.57.0/docs/src/api/class-browser.md) | New context ownership; the adapter does not own the browser |
| [Playwright context](https://github.com/microsoft/playwright/blob/v1.57.0/docs/src/api/class-browsercontext.md) | New page and owned context close |
| [Playwright page](https://github.com/microsoft/playwright/blob/v1.57.0/docs/src/api/class-page.md) | Navigation/URL and the first-redirect routing limitation |
| [Playwright locator](https://github.com/microsoft/playwright/blob/v1.57.0/docs/src/api/class-locator.md) | Exact lookup, strict counts, action timeouts, ARIA snapshot and exact text/value reads |

The inspected e2e core is version 0.21.3 at the pinned commit. Vitest's context
document has Git blob `6e0e0da109664ff22449119ecbfab0c0e11753ae`; Playwright's
locator document has blob `042c08bb99a8e6d2ed75b0909adae33547713acb`.
The adapter does not claim a network allowlist: navigation may already have
made a request before its current-URL check; Playwright routing alone does not
cover every redirect or Service Worker request.
