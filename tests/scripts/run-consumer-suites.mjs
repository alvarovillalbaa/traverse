import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Inactive acceptance entrypoint: staging, installation and execution require
// the separately reviewed consumer/CI approval. This module is never imported.
const STREAM_LIMIT = 512 * 1024;
const LOG_TOTAL_LIMIT = 1024 * 1024;
const REPORT_LIMIT = 512 * 1024;
const tools = Object.freeze({ vitest: '4.0.16', playwright: '1.57.0', typescript: '5.9.3', '@types/node': '24.10.1' });
const modes = Object.freeze({ lifecycle: { exit: 0, cases: 3 }, negative: { exit: 1, cases: 6 }, browser: { exit: 0, cases: 8 } });
const errorCodes = new Set([
  'environment_invalid', 'input_invalid', 'output_exists', 'output_failed', 'output_limit',
  'process_start_failed', 'process_timeout', 'process_signalled', 'process_cleanup_failed', 'process_io_failed',
  'cancelled', 'typecheck_failed', 'suite_invalid', 'validation_failed', 'server_not_ready',
  'server_exited', 'server_cleanup_failed', 'report_invalid', 'internal_error',
]);
class HarnessError extends Error {
  constructor(code) { super(errorCodes.has(code) ? code : 'internal_error'); this.code = this.message; }
}
function fail(condition, code) { if (!condition) throw new HarnessError(code); }
function safeCode(error) { return error instanceof HarnessError ? error.code : 'internal_error'; }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function bytesFrom(path, maximum, code = 'input_invalid') {
  try {
    const before = await lstat(path);
    fail(before.isFile() && !before.isSymbolicLink() && before.size <= maximum, code);
    const bytes = await readFile(path);
    const after = await lstat(path);
    fail(bytes.length <= maximum && bytes.length === before.size && before.dev === after.dev
      && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, code);
    return bytes;
  } catch (error) { throw error instanceof HarnessError ? error : new HarnessError(code); }
}
async function jsonFrom(path, maximum) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytesFrom(path, maximum))); }
  catch { throw new HarnessError('input_invalid'); }
}
async function absent(path) {
  try { await lstat(path); throw new HarnessError('output_exists'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error instanceof HarnessError ? error : new HarnessError('output_failed'); }
}
async function privateWrite(path, bytes) {
  try { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); }
  catch { throw new HarnessError('output_failed'); }
}

async function runConsumer() {
  fail(process.version === 'v24.21.0' && process.platform === 'linux'
    && process.env.GITHUB_ACTIONS === 'true' && process.env.CI === 'true'
    && process.env.GITHUB_REPOSITORY === 'alvarovillalbaa/traverse', 'environment_invalid');
  const runId = process.env.GITHUB_RUN_ID;
  const temporary = process.env.RUNNER_TEMP;
  fail(typeof runId === 'string' && /^[0-9]{1,24}$/u.test(runId)
    && typeof temporary === 'string' && isAbsolute(temporary), 'environment_invalid');
  const parent = await realpath(temporary);
  const consumer = join(parent, `traverse-consumer-${runId}`);
  fail(process.argv.length === 3 && process.argv[2] === consumer, 'environment_invalid');
  fail(await realpath(consumer) === consumer, 'environment_invalid');
  fail(fileURLToPath(import.meta.url) === join(consumer, 'tests/scripts/run-consumer-suites.mjs'), 'environment_invalid');
  const artifacts = join(consumer, 'artifacts');
  const directory = await lstat(artifacts);
  fail(directory.isDirectory() && !directory.isSymbolicLink() && (directory.mode & 0o777) === 0o700, 'environment_invalid');
  process.umask(0o077);

  const reserved = ['consumer-environment.json', 'consumer-run.json'];
  for (const name of ['tsc', 'app-server', ...Object.keys(modes), ...Object.keys(modes).map(mode => `${mode}-validator`)]) {
    reserved.push(`${name}.stdout.log`, `${name}.stderr.log`);
  }
  for (const mode of Object.keys(modes)) reserved.push(`${mode}.json`, `${mode}.receipt.json`);
  for (const name of reserved) await absent(join(artifacts, name));

  const installed = {};
  for (const [name, version] of Object.entries(tools)) {
    const metadata = await jsonFrom(join(consumer, 'node_modules', name, 'package.json'), 128 * 1024);
    fail(metadata.name === name && metadata.version === version, 'environment_invalid');
    installed[name] = version;
  }
  const sdkRoot = join(consumer, 'node_modules', '@alvarovillalbaa', 'traverse');
  const sdk = await jsonFrom(join(sdkRoot, 'package.json'), 128 * 1024);
  fail(sdk.name === '@alvarovillalbaa/traverse' && sdk.version === '0.1.0'
    && Object.keys(sdk.dependencies ?? {}).length === 0, 'environment_invalid');
  const preparationPath = join(artifacts, 'preparation.json');
  const preparation = await jsonFrom(preparationPath, 128 * 1024);
  fail(preparation.schemaVersion === 1 && preparation.kind === 'traverse-consumer-preparation'
    && preparation.nodeVersion === 'v24.21.0' && preparation.packageFilesVerified === 21
    && Array.isArray(preparation.sdkFiles) && preparation.sdkFiles.length === 21, 'environment_invalid');
  const expectedSdk = new Map();
  for (const entry of preparation.sdkFiles) {
    fail(entry && typeof entry === 'object' && !Array.isArray(entry)
      && typeof entry.path === 'string' && entry.path.length <= 512 && !expectedSdk.has(entry.path)
      && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0
      && typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(entry.sha256), 'environment_invalid');
    expectedSdk.set(entry.path, entry);
  }
  const archive = await bytesFrom(join(consumer, 'traverse.tgz'), 8 * 1024 * 1024);
  const archiveHash = sha256(archive);
  fail(archiveHash === preparation.sdkArchiveSha256 && archive.length === preparation.sdkArchiveBytes, 'environment_invalid');
  const inputs = {};
  const staged = [
    'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts',
    'consumer-types.ts', 'tests/fixtures/vitest-driver.ts',
    'tests/integration/vitest-negative.test.ts', 'tests/fixtures/vitest-receipt-reporter.ts',
    'tests/integration/vitest-fixture.test.ts', 'tests/e2e/browser.test.ts',
    'tests/scripts/assert-vitest-result.mjs', 'tests/scripts/run-consumer-suites.mjs', 'examples/server.mjs', 'examples/app/index.html',
  ];
  for (const name of staged) inputs[name] = sha256(await bytesFrom(join(consumer, name), 1024 * 1024));
  const installedSdk = {};
  for (const name of ['src/index.js', 'src/session.js', 'src/replay.js', 'src/protocol.js', 'src/playwright.js', 'src/vitest.js', 'types/index.d.ts', 'types/playwright.d.ts', 'types/vitest.d.ts']) {
    const bytes = await bytesFrom(join(sdkRoot, name), 256 * 1024);
    const expected = expectedSdk.get(name);
    const digest = sha256(bytes);
    fail(expected && expected.bytes === bytes.length && expected.sha256 === digest, 'environment_invalid');
    installedSdk[name] = digest;
  }
  const source = {
    schemaVersion: 1, kind: 'traverse-consumer-environment', nodeVersion: process.version,
    nodeExecutable: process.execPath, platform: process.platform, tools: installed,
    sdk: { name: sdk.name, version: sdk.version, archiveSha256: archiveHash, files: installedSdk },
    preparationSha256: sha256(await bytesFrom(preparationPath, 128 * 1024)),
    harnessSha256: sha256(await bytesFrom(fileURLToPath(import.meta.url), 128 * 1024)),
    inputs,
  };
  await privateWrite(join(artifacts, 'consumer-environment.json'), JSON.stringify(source, null, 2) + '\n');

  // No provider keys, GitHub credentials, proxies, NODE_OPTIONS or NODE_PATH are
  // passed to consumer tools. Playwright's explicitly staged browser path is kept.
  const environment = { CI: 'true', NO_COLOR: '1', DO_NOT_TRACK: '1' };
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH']) {
    if (typeof process.env[name] === 'string') environment[name] = process.env[name];
  }
  const owned = new Set();
  const requests = new Set();
  const processes = [];
  const validators = [];
  let captured = 0;
  let cancelled = false;
  let failure = null;
  let server = null;
  const cleanupErrors = [];

  function signalGroup(child, signal) {
    if (!Number.isSafeInteger(child.pid) || child.pid < 1) return false;
    try { process.kill(-child.pid, signal); return true; }
    catch (error) { if (error?.code === 'ESRCH') return false; throw new HarnessError('process_cleanup_failed'); }
  }
  function groupAlive(child) { return signalGroup(child, 0); }
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  async function retireGroup(child) {
    if (!groupAlive(child)) return;
    signalGroup(child, 'SIGTERM');
    const gentle = performance.now() + 250;
    while (groupAlive(child) && performance.now() < gentle) await sleep(25);
    if (!groupAlive(child)) return;
    signalGroup(child, 'SIGKILL');
    const hard = performance.now() + 1000;
    while (groupAlive(child) && performance.now() < hard) await sleep(25);
    fail(!groupAlive(child), 'process_cleanup_failed');
  }

  function start(name, args, timeoutMs, extraEnvironment = {}) {
    fail(!cancelled, 'cancelled');
    let child;
    try { child = spawn(process.execPath, args, { cwd: consumer, env: { ...environment, ...extraEnvironment }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { throw new HarnessError('process_start_failed'); }
    const began = performance.now();
    const record = { name, child, exited: false, code: null, stdout: [], stderr: [], stdoutBytes: 0, stderrBytes: 0, retainedOut: 0, retainedErr: 0, stopped: false };
    owned.add(record);
    let settle;
    let finalizing = false;
    let killTimer;
    let fallbackTimer;
    const completed = new Promise(resolve => { settle = resolve; });
    const deadline = began + timeoutMs;
    const timer = setTimeout(() => stop('process_timeout'), timeoutMs);

    async function finish(exitCode, signal) {
      if (finalizing) return;
      finalizing = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(fallbackTimer);
      record.exited = true;
      try { await retireGroup(child); } catch { record.code ??= 'process_cleanup_failed'; cleanupErrors.push(name); }
      const stdout = Buffer.concat(record.stdout);
      const stderr = Buffer.concat(record.stderr);
      const result = {
        name, args, exitCode, signal, errorCode: record.code,
        durationMs: Math.max(0, Math.round(performance.now() - began)),
        stdoutObservedBytes: record.stdoutBytes, stderrObservedBytes: record.stderrBytes,
        stdoutRetainedBytes: stdout.length, stderrRetainedBytes: stderr.length,
        stdoutComplete: !record.stopped && stdout.length === record.stdoutBytes,
        stderrComplete: !record.stopped && stderr.length === record.stderrBytes,
        stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr),
      };
      try {
        await privateWrite(join(artifacts, `${name}.stdout.log`), stdout);
        await privateWrite(join(artifacts, `${name}.stderr.log`), stderr);
      } catch { result.errorCode ??= 'output_failed'; }
      processes.push(result);
      owned.delete(record);
      settle({ ...result, stdout, stderr });
    }
    function stop(code) {
      if (record.stopped || finalizing) return;
      record.stopped = true;
      if (code) record.code ??= code;
      try { signalGroup(child, 'SIGTERM'); } catch { record.code ??= 'process_cleanup_failed'; }
      child.stdout?.destroy(); child.stderr?.destroy();
      killTimer = setTimeout(() => { try { signalGroup(child, 'SIGKILL'); } catch { record.code ??= 'process_cleanup_failed'; } }, 250);
      fallbackTimer = setTimeout(() => {
        record.code ??= 'process_cleanup_failed';
        child.unref();
        void finish(child.exitCode, child.signalCode);
      }, 1500);
    }
    const collect = (kind, chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const out = kind === 'stdout';
      record[out ? 'stdoutBytes' : 'stderrBytes'] += bytes.length;
      const retained = out ? 'retainedOut' : 'retainedErr';
      const remaining = Math.max(0, Math.min(STREAM_LIMIT - record[retained], LOG_TOTAL_LIMIT - captured));
      const kept = bytes.subarray(0, remaining);
      if (kept.length) { record[kind].push(kept); record[retained] += kept.length; captured += kept.length; }
      if (kept.length !== bytes.length) stop('output_limit');
    };
    child.stdout?.on('data', chunk => collect('stdout', chunk));
    child.stderr?.on('data', chunk => collect('stderr', chunk));
    for (const stream of [child.stdout, child.stderr]) stream?.on('error', () => { record.code ??= 'process_io_failed'; stop('process_io_failed'); });
    child.on('exit', () => { record.exited = true; });
    child.on('error', () => { record.code ??= 'process_start_failed'; stop('process_start_failed'); });
    child.on('close', (exitCode, signal) => {
      if (!record.stopped && performance.now() >= deadline) record.code ??= 'process_timeout';
      void finish(exitCode, signal);
    });
    record.completed = completed;
    return { record, completed, stop };
  }
  const abort = () => {
    cancelled = true;
    for (const item of [...owned]) item.stop?.('cancelled');
    for (const request of requests) request.destroy();
  };
  // Each registry entry owns a process group; no name-based or caller PID kill.
  const launch = (...args) => {
    const handle = start(...args);
    handle.record.stop = handle.stop;
    return handle;
  };
  process.on('SIGINT', abort); process.on('SIGTERM', abort);

  async function probe(expected, remaining) {
    return new Promise(resolve => {
      const chunks = [];
      let size = 0;
      let finished = false;
      let timer;
      const done = value => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        requests.delete(request);
        request.destroy();
        resolve(value);
      };
      const timeout = Math.max(1, Math.min(400, remaining));
      const request = get({ hostname: '127.0.0.1', port: 4177, path: '/', agent: false, timeout }, response => {
        if (response.statusCode !== 200) { response.destroy(); done(false); return; }
        response.on('data', chunk => {
          size += chunk.length;
          if (size > expected.length) { response.destroy(); done(false); }
          else chunks.push(chunk);
        });
        response.on('error', () => done(false));
        response.on('end', () => done(Buffer.concat(chunks).equals(expected)));
        response.on('close', () => done(false));
      });
      requests.add(request);
      timer = setTimeout(() => done(false), timeout);
      request.on('timeout', () => { request.destroy(); done(false); });
      request.on('error', () => done(false));
    });
  }
  async function ready(handle) {
    const expected = await bytesFrom(join(consumer, 'examples/app/index.html'), 128 * 1024);
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      fail(!cancelled, 'cancelled');
      fail(!handle.record.exited && !handle.record.code, 'server_exited');
      const output = Buffer.concat(handle.record.stdout).toString('utf8');
      if (output.includes('Authored app: http://127.0.0.1:4177/\n') && await probe(expected, deadline - performance.now())) {
        fail(performance.now() < deadline && !handle.record.exited && !handle.record.code, 'server_not_ready');
        return;
      }
      if (performance.now() < deadline) await sleep(Math.min(100, deadline - performance.now()));
    }
    throw new HarnessError('server_not_ready');
  }
  async function suite(mode) {
    const report = join(artifacts, `${mode}.json`);
    const receipt = join(artifacts, `${mode}.receipt.json`);
    const handle = launch(mode, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'], 90_000,
      { TRAVERSE_ACCEPTANCE_MODE: mode, TRAVERSE_RECEIPT_PATH: receipt });
    const result = server ? await Promise.race([
      handle.completed,
      server.completed.then(() => { throw new HarnessError('server_exited'); }),
    ]) : await handle.completed;
    fail(result.errorCode === null, result.errorCode ?? 'internal_error');
    fail(result.signal === null && Number.isSafeInteger(result.exitCode), 'process_signalled');
    const reportBytes = await bytesFrom(report, REPORT_LIMIT, 'report_invalid');
    const receiptBytes = await bytesFrom(receipt, 4096, 'report_invalid');
    const validation = await launch(`${mode}-validator`, [
      'tests/scripts/assert-vitest-result.mjs', mode, report, String(result.exitCode), receipt,
    ], 10_000).completed;
    fail(validation.errorCode === null && validation.exitCode === 0 && validation.signal === null, 'validation_failed');
    let verified;
    try { verified = JSON.parse(validation.stdout.toString('utf8')); } catch { throw new HarnessError('validation_failed'); }
    fail(verified?.kind === 'traverse-vitest-acceptance' && verified.mode === mode && verified.verified === true
      && verified.cases === modes[mode].cases && verified.runnerExitCode === modes[mode].exit
      && result.exitCode === modes[mode].exit, 'validation_failed');
    validators.push({ ...verified, reportSha256: sha256(reportBytes), receiptSha256: sha256(receiptBytes) });
  }

  try {
    const typed = await launch('tsc', ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'], 60_000).completed;
    if (typed.errorCode || typed.signal || typed.exitCode !== 0) throw new HarnessError(typed.errorCode ?? 'typecheck_failed');
    await suite('lifecycle');
    await suite('negative');
    server = launch('app-server', ['examples/server.mjs'], 110_000, { TRAVERSE_DEMO_PORT: '4177' });
    await ready(server);
    await suite('browser');
  } catch (error) {
    failure = safeCode(error);
  } finally {
    if (server) {
      server.stop();
      const result = await server.completed;
      if (result.errorCode || result.exitCode !== 0 || result.signal !== null) cleanupErrors.push('app-server');
    }
    for (const item of [...owned]) item.stop?.('cancelled');
    for (const request of requests) request.destroy();
    // All completions have a forced settlement deadline, even if inherited
    // stdout is held by a child or an opaque process ignores SIGTERM.
    await Promise.all([...owned].map(item => item.completed));
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
    if (cancelled) failure ??= 'cancelled';
    if (cleanupErrors.length) failure ??= 'server_cleanup_failed';
    const summary = {
      schemaVersion: 1, kind: 'traverse-consumer-run', nodeVersion: process.version,
      success: failure === null && validators.length === 3, errorCode: failure,
      expectedSuiteExits: modes, validations: validators, processes, cleanupErrors: [...new Set(cleanupErrors)],
      capturedLogBytes: captured,
    };
    await privateWrite(join(artifacts, 'consumer-run.json'), JSON.stringify(summary, null, 2) + '\n');
  }
  fail(failure === null && validators.length === 3, failure ?? 'validation_failed');
  process.stdout.write('traverse_consumer_verified\n');
}

try { await runConsumer(); }
catch (error) { process.stderr.write(`traverse_consumer_${safeCode(error)}\n`); process.exitCode = 1; }
