import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Temporary public CI only. Never import this controller from the product.
const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = data => createHash('sha256').update(data).digest('hex');
let consumer, ownsConsumer = false, phase = 'ownership';
const commands = [];
function run(label, command, args, cwd, timeout = 120000) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout, killSignal: 'SIGKILL', detached: true, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, NPM_CONFIG_CACHE: resolve(consumer, '.npm-cache'), PLAYWRIGHT_BROWSERS_PATH: resolve(consumer, '.browsers') } });
  const receipt = { label, command, args, exit: result.status, signal: result.signal, error: result.error?.code ?? null,
    stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  commands.push(receipt); console.log(JSON.stringify({ kind: 'command', ...receipt }));
  if (result.status !== 0 || result.error || result.signal) {
    try { process.kill(-result.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    throw new Error(label);
  }
  return result.stdout;
}
try {
  if (process.platform !== 'linux' || process.version !== 'v24.21.0' || process.env.CI !== 'true'
    || process.env.GITHUB_REPOSITORY !== 'alvarovillalbaa/traverse' || !/^\d+$/.test(process.env.GITHUB_RUN_ID ?? '')) throw new Error();
  const temp = realpathSync(process.env.RUNNER_TEMP);
  consumer = resolve(temp, `traverse-openai-${process.env.GITHUB_RUN_ID}`);
  if (dirname(consumer) !== temp || basename(consumer) !== `traverse-openai-${process.env.GITHUB_RUN_ID}` || existsSync(consumer)) throw new Error();
  mkdirSync(consumer, { mode: 0o700 });
  ownsConsumer = true;
  phase = 'package';
  const packed = JSON.parse(run('pack', 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', consumer], root, 60000));
  if (packed.length !== 1 || !/^[a-z0-9.-]+\.tgz$/.test(packed[0].filename)) throw new Error();
  const archive = resolve(consumer, packed[0].filename);
  const packageFiles = [];
  for (const entry of packed[0].files) {
    if (entry.path.startsWith('/') || entry.path.split('/').includes('..')) throw new Error();
    const original = readFileSync(resolve(root, entry.path));
    const extracted = spawnSync('tar', ['-xOf', archive, `package/${entry.path}`], { timeout: 10000, maxBuffer: 1048576 });
    if (extracted.status !== 0 || extracted.error || !original.equals(extracted.stdout)) throw new Error();
    packageFiles.push({ path: entry.path, bytes: original.length, sha256: sha256(original) });
  }
  copyFileSync(archive, resolve(consumer, 'traverse.tgz'));
  const pkg = JSON.parse(readFileSync(resolve(root, 'docs/proposals/consumer-package.json.example'), 'utf8'));
  writeFileSync(resolve(consumer, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const copies = ['tests/unit/openai.test.mjs', 'tests/helpers/authored-app.mjs', 'tests/helpers/authored-responses.mjs',
    'tests/e2e/openai.test.ts', 'tests/fixtures/openai-types.ts', 'examples/app/index.html'];
  for (const file of copies) { mkdirSync(dirname(resolve(consumer, file)), { recursive: true }); copyFileSync(resolve(root, file), resolve(consumer, file)); }
  writeFileSync(resolve(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true,
    skipLibCheck: false, lib: ['ES2022', 'DOM'], types: ['node'],
  }, include: ['tests/e2e/openai.test.ts', 'tests/fixtures/openai-types.ts'] }, null, 2));
  writeFileSync(resolve(consumer, 'vitest.config.ts'), `import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['tests/e2e/openai.test.ts'],pool:'forks',maxWorkers:1,
fileParallelism:false,isolate:true,retry:0,testTimeout:10000,hookTimeout:30000,reporters:['json'],outputFile:'browser.json'}});\n`);
  console.log(JSON.stringify({ kind: 'package', version: packed[0].version, sha256: sha256(readFileSync(archive)),
    bytes: readFileSync(archive).length, files: packageFiles }));
  phase = 'installation';
  run('lock', 'npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], consumer);
  console.log(JSON.stringify({ kind: 'consumer-lock', sha256: sha256(readFileSync(resolve(consumer, 'package-lock.json'))),
    content: readFileSync(resolve(consumer, 'package-lock.json'), 'utf8') }));
  run('install', 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], consumer);
  phase = 'unit';
  const tap = run('openai-unit', process.execPath, ['--test', '--test-reporter=tap', 'tests/unit/openai.test.mjs'], consumer, 60000);
  if (!/^# tests 26$/m.test(tap) || !/^# pass 26$/m.test(tap) || !/^# fail 0$/m.test(tap)
    || !/^# cancelled 0$/m.test(tap) || !/^# skipped 0$/m.test(tap)) throw new Error();
  phase = 'types';
  run('types', process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'], consumer);
  phase = 'chromium';
  run('chromium-install', process.execPath, ['node_modules/playwright/cli.js', 'install', '--with-deps', '--only-shell', 'chromium'], consumer, 240000);
  run('openai-browser', process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], consumer, 90000);
  const browser = JSON.parse(readFileSync(resolve(consumer, 'browser.json'), 'utf8'));
  if (!browser.success || browser.numTotalTests !== 2 || browser.numPassedTests !== 2 || browser.numFailedTests !== 0
    || browser.numPendingTests !== 0 || browser.numTodoTests !== 0 || browser.testResults.length !== 1) throw new Error();
  console.log(JSON.stringify({ kind: 'browser', receipt: browser }));
  console.log(JSON.stringify({ kind: 'accepted', unit: 26, chromium: 2, types: true, liveModelCalls: 0, legacySuitesExecuted: 0 }));
} catch {
  if (ownsConsumer && existsSync(resolve(consumer, 'browser.json'))) {
    console.log(JSON.stringify({ kind: 'failed-browser-receipt', content: readFileSync(resolve(consumer, 'browser.json'), 'utf8') }));
  }
  console.log(JSON.stringify({ kind: 'failed', phase, completedCommands: commands.length })); process.exitCode = 1;
} finally {
  if (ownsConsumer && existsSync(consumer)) {
    rmSync(consumer, { recursive: true });
    if (existsSync(consumer)) process.exitCode = 1;
    console.log(JSON.stringify({ kind: 'owned-consumer-cleanup', removed: !existsSync(consumer) }));
  }
}
