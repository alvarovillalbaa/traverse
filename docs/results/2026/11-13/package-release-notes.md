Traverse 0.2.0 candidate: a dependency-free Vitest companion with a real
Playwright adapter, exact locator checks, explicit session ownership and optional
agent steps. This release distributes the exact 24-file archive already qualified
at [ff7fdd20](https://github.com/alvarovillalbaa/traverse/tree/ff7fdd20424d6582eedc8713f1ca7a382acce5aa).

Install the GitHub archive into an existing Node 24+ test project:

```sh
npm install --ignore-scripts https://github.com/alvarovillalbaa/traverse/releases/download/v0.2.0-candidate.1/alvarovillalbaa-traverse-0.2.0.tgz
```

Use your explicitly installed Vitest/Playwright and browser. The package starts
no browser, account, model request or installation when imported. The optional
OpenAI executor requires your explicit key/model and remains separate from the
deterministic path. No runtime dependencies or bundled browser binaries.

The existing [core/consumer qualification](https://github.com/alvarovillalbaa/traverse/blob/main/README.md)
covers 45 core checks and 17 installed contracts, including eight Chromium
journeys. The later [OpenAI transport qualification](https://github.com/alvarovillalbaa/traverse/blob/main/docs/results/2026/11-12/openai-checks.md)
covers 26 authored unit cases, two real Chromium journeys and installed types.
Responses decisions were authored; no real model or inference-quality result
is claimed. The old suites were not rerun for this publication.

Archive: 29,478 bytes; SHA-256
`b79d9259d6fd40cf0a18fc185ba449be459fe8803d2700822f0440f240e48ebb`.
The included SHA256SUMS and member manifest describe the original qualified
payload. Its README/acceptance documents retain the build-time snapshot;
current linked receipts record later acceptance and limits. MIT licensed.

This is a GitHub prerelease, not an npm registry publication. Fresh anonymous
public installation is checked separately after publication. No hosted service,
account, browser/device matrix or live-provider quality is implied.
