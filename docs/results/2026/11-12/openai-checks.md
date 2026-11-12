# Optional OpenAI executor acceptance

Last updated: 2026-11-12

Traverse 0.2.0's opt-in Responses executor passed **26 new unit cases, two real
Chromium journeys and the scoped installed declaration check**, on its first
attempt. [Run 43151909578](https://github.com/alvarovillalbaa/traverse/actions/runs/43151909578)
and job 130962829077 completed successfully. The exact checked source is
[`ff7fdd20424d6582eedc8713f1ca7a382acce5aa`](https://github.com/alvarovillalbaa/traverse/tree/ff7fdd20424d6582eedc8713f1ca7a382acce5aa),
tree `a9738da950ba49a05d747573993c15f9bd0dfab1`; native commit
`aa54d1d448e3c785a7d294a92af71ecd6c9241f1` has that same tree.

The installed package contained 24 files, individually compared with source
bytes. Its 29,478-byte archive SHA-256 is
`b79d9259d6fd40cf0a18fc185ba449be459fe8803d2700822f0440f240e48ebb`.
The [complete receipt](openai-checks.json) records package-file hashes, input
hashes, all unit/browser names, command exits and remote terminal readback.
The [complete job log](openai-checks.log) retains stdout/stderr, TAP and browser
JSON; SHA-256 `0c10e0984d2b05653eab0d9a6e062554535fd2a405acd2cc329031036e3c1113`.
The exact [consumer lock](openai-consumer-package-lock.json) has SHA-256
`473f35fa9e547ab3727771530c108ac6246ccaab0b9b16a84785cf57da9b6c29`.

The Chromium cases independently verify an HTTP-proposed native action, fresh
observation, exact app outcome and provider-free checked replay; and live
read-only assertions with a sticky failed verdict. The server emits authored
Responses decisions. No external model was contacted and no inference quality,
prompt-injection resistance or live OpenAI compatibility was established.
Consumer tools were Node 24.21.0, Vitest 4.0.16, Playwright 1.57.0 and TypeScript
5.9.3. Existing 45 core / 17 consumer contracts were not rerun; their code and
the existing core modules retain their prior bytes. In total, 57 unchanged
baseline files were compared with the prior main source.

Owned browser/context/server assertions passed and the controller removed its
exact temporary consumer directory. The immutable retirement helper read back
workflow 415495768 as `disabled_manually` and deleted the unchanged QA head
`e2b43136d0241b5adba3ace3084323705a8eb3a7`. A separate connector read found the
entire `qa/traverse-openai-20261112-` ref prefix empty. Workflow state proof is
the helper's authenticated GET in the full log, not an independent connector
read of the workflow definition. Main has no active workflow file.

This subsequent edition does not rerun or alter the qualified runtime,
declarations or cases. Final review added an ownership flag to the inactive CI
controller so its error/finally paths cannot inspect or delete a pre-existing
consumer directory after a collision. That small controller-only guard was
syntax/reference/whitespace checked, not executed; the successful run above
used its original controller and created a fresh directory. The packaged README
and acceptance document remain those at the checked source above. Delivery
is through the GitHub repository; no npm registry publication, hosted service,
local runtime/browser execution or paid provider call is claimed.
