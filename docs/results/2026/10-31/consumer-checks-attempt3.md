# Installed-consumer checks — third attempt

[Run 41239849875](https://github.com/alvarovillalbaa/traverse/actions/runs/41239849875) **failed at negative-result validation** on 31 October 2026. The strict installed typecheck and **three lifecycle cases passed**, including the existing validator and completed companion receipt with zero unhandled errors. Six ordinary negative cases failed with exit 1 and zero unhandled errors, but their validator rejected the group. The **eight browser cases are UNRUN**.

The prepared repair adds companion schema version two with bounded actual
`TestCase.result().errors[].message` timeout evidence. Its exact case ID, name,
module and failed state must bind to the existing timeout case, and its reported
timeout must be 250 ms with the exact raw runner message. The source's existing
`{ timeout: 250 }` option stays unchanged as configuration proof; the pinned
public API does not expose an options timeout, so no configured value is invented.
The other five negative-message checks and all abort/body/cleanup assertions
stay required. This repaired packet has not yet run.

The bounded timeout-case projection begins with `Error: STACK_TRACE_ERROR`; its metadata records the failed body, one body error, aborted host signal and cancelled session. [Vitest 4.0.16's JSON reporter](https://github.com/vitest-dev/vitest/blob/v4.0.16/packages/vitest/src/node/reporters/json.ts#L160) chooses an error's stack before its message. The [pinned timeout constructor](https://github.com/vitest-dev/vitest/blob/v4.0.16/packages/runner/src/context.ts#L220) retains the real timeout message while substituting a registration stack. No generic stack marker was accepted as timeout proof, and no assertion was relaxed while recording this outcome. A proposed repair must capture actual public `TestCase.result().errors[].message` evidence bound to the exact case.

The original 19 repaired-consumer fingerprints, 28 initial files and 21 package files verified. Node 24.21.0/Linux and all pinned tools matched. The SDK archive stayed `ccba89195ff470c8934654c61e159c69ff18316c50f26e17fd6e1dfdc37ff0e7`; the [retained lock](consumer-package-lock.json) stayed `e28932e1d5d1670975d2628e1e7b5c83423ac6c197687f461b586a23ca83d313`. Owned cleanup and bounded artifact upload succeeded.

Source: `ec0a42de80ac6ced89e3cb01760cadcaff01cf3c`; activation: `80e71e6cd07a68e17f3e18f68526a3d6fa43c354`. The [JSON receipt](consumer-checks-attempt3.json) preserves actual projections, artifact/result/log hashes and their truncation limits. [Earlier failures](consumer-checks-attempt2.md) remain unchanged. No browser or example server launched, and no local install/test, model/provider call, production data, real account or paid enrollment occurred.
