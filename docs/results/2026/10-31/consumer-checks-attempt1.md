# Installed-consumer checks — first attempt

[Run 41238834904](https://github.com/alvarovillalbaa/traverse/actions/runs/41238834904) **failed at strict typechecking** on 31 October 2026. All **17 runtime cases are UNRUN**: no lifecycle, negative or browser suite started, and no companion verdict was produced.

The actual installed package was prepared successfully: all 18 consumer fingerprints, 28 initial fingerprints and 21 package files matched. The run observed Node 24.21.0 on Linux with Vitest 4.0.16, Playwright 1.57.0, TypeScript 5.9.3 and Node types 24.10.1. Public dependency installation and Chromium tooling installation succeeded. Consumer cleanup and artifact upload succeeded.

TypeScript exited 2 with TS2345: the authored `markBody` helper's `HostTask.meta: Record<string, unknown>` constraint rejects Vitest's actual `TaskMeta`, which has no index signature. The helper reads only the task ID and compares object identity. This establishes a fixture parameter mismatch; it does not establish an SDK/runtime failure.

The [generated lock](consumer-package-lock.json) was recovered byte for byte from bounded gzip-base64 stdout: 51,942 bytes, SHA-256 `e28932e1d5d1670975d2628e1e7b5c83423ac6c197687f461b586a23ca83d313`. It remains unchanged for the repaired attempt. The [JSON receipt](consumer-checks-attempt1.json) records package/result/log hashes and artifact identity.

Source was immutable `abd36915010dc2a3f932454f00f0665e39db11ea`, activated by `fa0e646c6dfd8d2bc5cb29cc494b48c1ef9f1996`. No browser launched, local install/test, model/provider call, production data, real account or paid enrollment occurred. Historical source seals remain unchanged; a repair needs its own dated seal and the same seventeen cases.
