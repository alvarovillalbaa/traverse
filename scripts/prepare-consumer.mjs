import { readFileSync, writeFileSync, mkdirSync, realpathSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Approved temporary CI only. This script packs/copies source; it never installs
// dependencies, imports the SDK, starts a server or runs a consumer suite.
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = (data) => createHash('sha256').update(data).digest('hex');
let phase = 'ownership';
try {
  if (process.platform !== 'linux' || process.version !== 'v24.21.0' || process.env.CI !== 'true'
    || !/^\d+$/.test(process.env.GITHUB_RUN_ID ?? '') || !process.env.RUNNER_TEMP) throw new Error();
  const runnerTemp = realpathSync(process.env.RUNNER_TEMP);
  const consumer = resolve(process.argv[2] ?? '');
  if (/[\r\n]/.test(runnerTemp) || process.argv.length !== 3 || dirname(consumer) !== runnerTemp
    || basename(consumer) !== `traverse-consumer-${process.env.GITHUB_RUN_ID}` || existsSync(consumer)) throw new Error();

  phase = 'source';
  const seal = JSON.parse(readFileSync(resolve(root, 'docs/results/2026/10-28/consumer-source.json'), 'utf8'));
  for (const [file, expected] of Object.entries(seal.sha256)) {
    if (file.startsWith('/') || file.split('/').includes('..') || digest(readFileSync(resolve(root, file))) !== expected) throw new Error();
  }
  const initial = JSON.parse(readFileSync(resolve(root, 'docs/results/2026/10-28/source-fingerprint.json'), 'utf8'));
  for (const [file, expected] of Object.entries(initial.sha256)) {
    if (digest(readFileSync(resolve(root, file))) !== expected) throw new Error();
  }
  mkdirSync(consumer, { mode: 0o700 });
  const artifacts = resolve(consumer, 'artifacts');
  mkdirSync(artifacts, { mode: 0o700 });
  const cache = resolve(consumer, '.npm-cache');

  phase = 'pack';
  const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--cache', cache, '--pack-destination', consumer],
    { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 1_048_576 });
  if (packed.status !== 0 || packed.error || packed.signal) throw new Error();
  const result = JSON.parse(packed.stdout);
  if (!Array.isArray(result) || result.length !== 1 || !/^[a-z0-9.-]+\.tgz$/.test(result[0].filename)) throw new Error();
  const archive = resolve(consumer, result[0].filename);
  const expectedEntries = initial.packageInspection.entries;
  const actualNames = result[0].files.map((file) => file.path).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedEntries.map((file) => file.path).sort())) throw new Error();
  for (const entry of expectedEntries) {
    const content = spawnSync('tar', ['-xOf', archive, `package/${entry.path}`],
      { timeout: 10_000, maxBuffer: 1_048_576 });
    if (content.status !== 0 || content.error || content.signal || content.stdout.length !== entry.bytes
      || digest(content.stdout) !== entry.sha256) throw new Error();
  }
  copyFileSync(archive, resolve(consumer, 'traverse.tgz'));

  phase = 'copy';
  const copies = {
    'docs/proposals/consumer-package.json.example': 'package.json',
    'docs/proposals/consumer-tsconfig.json.example': 'tsconfig.json',
    'docs/proposals/consumer-vitest.config.ts.example': 'vitest.config.ts',
    'tests/fixtures/consumer-types.ts': 'consumer-types.ts',
    'tests/fixtures/vitest-driver.ts': 'tests/fixtures/vitest-driver.ts',
    'tests/integration/vitest-negative.test.ts': 'tests/integration/vitest-negative.test.ts',
    'tests/fixtures/vitest-receipt-reporter.ts': 'tests/fixtures/vitest-receipt-reporter.ts',
    'tests/integration/vitest-fixture.test.ts': 'tests/integration/vitest-fixture.test.ts',
    'tests/e2e/browser.test.ts': 'tests/e2e/browser.test.ts',
    'tests/scripts/assert-vitest-result.mjs': 'tests/scripts/assert-vitest-result.mjs',
    'tests/scripts/run-consumer-suites.mjs': 'tests/scripts/run-consumer-suites.mjs',
    'examples/server.mjs': 'examples/server.mjs',
    'examples/app/index.html': 'examples/app/index.html',
  };
  for (const [source, destination] of Object.entries(copies)) {
    const target = resolve(consumer, destination);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    copyFileSync(resolve(root, source), target);
  }
  if (seal.consumerLock) {
    const file = seal.consumerLock.path;
    if (seal.sha256[file] !== seal.consumerLock.sha256) throw new Error();
    copyFileSync(resolve(root, file), resolve(consumer, 'package-lock.json'));
  }
  const receipt = {
    schemaVersion: 1, kind: 'traverse-consumer-preparation', nodeVersion: process.version,
    sourceFilesVerified: Object.keys(seal.sha256).length, initialFilesVerified: Object.keys(initial.sha256).length,
    packageFilesVerified: expectedEntries.length, sdkArchiveSha256: digest(readFileSync(archive)),
    sdkArchiveBytes: readFileSync(archive).length, sdkFiles: expectedEntries, stagedFiles: Object.values(copies),
  };
  writeFileSync(resolve(artifacts, 'preparation.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (typeof process.env.GITHUB_ENV !== 'string' || !process.env.GITHUB_ENV) throw new Error();
  writeFileSync(process.env.GITHUB_ENV, `TRAVERSE_CONSUMER_DIR=${consumer}\n`, { flag: 'a' });
  process.stdout.write(JSON.stringify(receipt) + '\n');
} catch {
  process.stderr.write(JSON.stringify({ code: 'traverse_consumer_prepare_failed', phase }) + '\n');
  process.exitCode = 1;
}
