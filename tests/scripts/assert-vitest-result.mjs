import { lstat, readFile } from 'node:fs/promises';

// Validate actual Vitest 4.0.16 JSON plus the required companion reporter receipt.
// This tool never imports Traverse, Vitest, test files or a browser.
const BOUNDARY = 'authored-driver-real-vitest';
const lifecycle = [
  { title: 'unused Traverse fixture remains lazy in the real runner', unused: true },
  { title: 'real Vitest initializes the requested fixture and tears down an exact checked journey', count: 1, events: ['setup', 'body', 'open', 'perform', 'check', 'close', 'evidence'] },
  { title: 'a second real Vitest test receives pristine independently owned app state', count: 0, events: ['setup', 'body', 'check', 'close', 'evidence'] },
];
const negative = [
  { title: 'recorded Vitest body failure survives successful Traverse teardown', errors: [/AUTHORED_VITEST_BODY_FAILURE/], bodyErrors: 1, bodyState: 'fail', lifecycle: 'closed', stepCodes: [] },
  { title: 'Traverse cleanup failure makes a successful Vitest body fail', errors: [/\bcleanup_failed\b/], bodyErrors: 0, bodyState: 'pass', lifecycle: 'failed', stepCodes: ['cleanup_failed'] },
  { title: 'Traverse evidence callback failure makes a successful Vitest body fail', errors: [/\bevidence_failed\b/], bodyErrors: 0, bodyState: 'pass', lifecycle: 'closed', stepCodes: [] },
  { title: 'recorded body failure and Traverse cleanup failure both reach the Vitest result', errors: [/AUTHORED_VITEST_COMBINED_BODY_FAILURE/, /\bcleanup_failed\b/], bodyErrors: 1, bodyState: 'fail', lifecycle: 'failed', stepCodes: ['cleanup_failed'] },
  { title: 'idle caller cancellation cannot become a passing Vitest teardown', errors: [/\bsession_cancelled\b/], bodyErrors: 0, bodyState: 'pass', lifecycle: 'cancelled', stepCodes: [] },
  { title: 'real Vitest timeout aborts the fixture signal and closes its owned driver', errors: [/Test timed out in 250ms/, /\bsession_cancelled\b/], bodyErrors: 1, bodyState: 'fail', lifecycle: 'cancelled', stepCodes: [], hostSignalAborted: true },
];
const browser = [
  'Vitest fixture fills and submits exact controls through public exports',
  'scripted executor receives real observations and assertions always run live',
  'a later checked action replays in a fresh context without a second executor call',
  'an unchecked successful action is not replayed in another context',
  'owned contexts isolate UI data and preserve a consumer context',
  'cancellation closes a real page and fences a late executor action',
  'a failed protocol step remains visible at real-page teardown',
  'a native locator deadline cannot turn into a passing session',
].map(title => ({ title }));
const modes = {
  lifecycle: { cases: lifecycle, file: 'tests/integration/vitest-fixture.test.ts', ancestors: [], failed: false },
  negative: { cases: negative, file: 'tests/integration/vitest-negative.test.ts', ancestors: [], failed: true },
  browser: { cases: browser, file: 'tests/e2e/browser.test.ts', ancestors: ['Traverse Chromium acceptance'], failed: false },
};

function requireValue(condition) {
  if (!condition) throw new Error('traverse_vitest_result_invalid');
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
async function boundedJson(path, limit, privateFile = false) {
  const stat = await lstat(path);
  requireValue(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= limit);
  if (privateFile) requireValue((stat.mode & 0o777) === 0o600);
  const bytes = await readFile(path);
  requireValue(bytes.byteLength === stat.size && bytes.byteLength <= limit);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function verifyReceipt(value, expected) {
  requireValue(object(value) && equal(Object.keys(value).sort(), [
    'schemaVersion', 'kind', 'runnerVersion', 'completed', 'endReason', 'moduleCount', 'unhandledErrorCount',
  ].sort()));
  requireValue(value.schemaVersion === 1 && value.kind === 'traverse-vitest-run-receipt'
    && value.runnerVersion === '4.0.16' && value.completed === true && value.moduleCount === 1
    && value.unhandledErrorCount === 0 && value.endReason === (expected.failed ? 'failed' : 'passed'));
}
function verifyAuthoredMeta(value, expected, isNegative) {
  requireValue(object(value) && value.boundary === BOUNDARY && value.bodyEntered === true);
  if (expected.unused) {
    requireValue(equal(Object.keys(value).sort(), ['boundary', 'unused', 'factoryCalls', 'closeCalls', 'bodyEntered'].sort())
      && value.unused === true && value.factoryCalls === 0 && value.closeCalls === 0);
    return;
  }
  requireValue(equal(Object.keys(value).sort(), [
    'boundary', 'instanceId', 'factoryCalls', 'closeCalls', 'evidenceCalls', 'bodyEntered', 'taskMatched',
    'childSignalForwarded', 'hostSignalAborted', 'childAbortedAtEvidence', 'bodyStateAtEvidence',
    'bodyErrorsAtEvidence', 'lifecycle', 'finalCount', 'stepCodes', 'events',
  ].sort()));
  requireValue(integer(value.instanceId) && value.instanceId > 0 && value.factoryCalls === 1
    && value.closeCalls === 1 && value.evidenceCalls === 1 && value.taskMatched === true
    && value.childSignalForwarded === true && value.childAbortedAtEvidence === true
    && value.hostSignalAborted === (expected.hostSignalAborted ?? false));
  requireValue(value.bodyStateAtEvidence === (isNegative ? expected.bodyState : 'pass')
    && value.bodyErrorsAtEvidence === (isNegative ? expected.bodyErrors : 0)
    && value.lifecycle === (isNegative ? expected.lifecycle : 'closed')
    && value.finalCount === (isNegative ? 0 : expected.count)
    && equal(value.stepCodes, isNegative ? expected.stepCodes : [])
    && equal(value.events, isNegative ? ['setup', 'body', 'close', 'evidence'] : expected.events));
}
function verifyReport(report, expected, mode) {
  requireValue(object(report) && report.success === !expected.failed && Array.isArray(report.testResults)
    && report.testResults.length === 1);
  const counters = ['numFailedTests', 'numFailedTestSuites', 'numPassedTests', 'numPassedTestSuites',
    'numPendingTests', 'numPendingTestSuites', 'numTodoTests', 'numTotalTests', 'numTotalTestSuites'];
  requireValue(counters.every(key => integer(report[key])));
  requireValue(report.numTotalTests === expected.cases.length
    && report.numFailedTests === (expected.failed ? expected.cases.length : 0)
    && report.numPassedTests === (expected.failed ? 0 : expected.cases.length)
    && report.numPendingTests === 0 && report.numPendingTestSuites === 0 && report.numTodoTests === 0
    && report.numTotalTestSuites >= 1 && report.numTotalTestSuites <= 2
    && report.numFailedTestSuites === (expected.failed ? 1 : 0)
    && report.numPassedTestSuites + report.numFailedTestSuites === report.numTotalTestSuites);
  const file = report.testResults[0];
  requireValue(object(file) && typeof file.name === 'string'
    && (file.name.replaceAll('\\', '/').endsWith('/' + expected.file) || file.name === expected.file)
    && file.status === (expected.failed ? 'failed' : 'passed') && file.message === ''
    && Array.isArray(file.assertionResults) && file.assertionResults.length === expected.cases.length);
  const seen = new Set();
  const instanceIds = new Set();
  for (const result of file.assertionResults) {
    requireValue(object(result) && typeof result.title === 'string' && !seen.has(result.title));
    seen.add(result.title);
    const entry = expected.cases.find(item => item.title === result.title);
    requireValue(entry && equal(result.ancestorTitles, expected.ancestors)
      && result.fullName === [...expected.ancestors, result.title].join(' ')
      && result.status === (expected.failed ? 'failed' : 'passed') && Array.isArray(result.failureMessages));
    if (expected.failed) {
      requireValue(result.failureMessages.length === entry.errors.length
        && result.failureMessages.every(message => typeof message === 'string' && message.length <= 262144
          && entry.errors.some(pattern => pattern.test(message))
          && !/PRIVATE_TRAVERSE_(CLEANUP|EVIDENCE)_DETAIL/.test(message))
        && entry.errors.every(pattern => result.failureMessages.filter(message => pattern.test(message)).length === 1));
    } else requireValue(result.failureMessages.length === 0);
    if (mode !== 'browser') {
      requireValue(object(result.meta));
      verifyAuthoredMeta(result.meta.traverse, entry, expected.failed);
      if (mode === 'lifecycle' && !entry.unused) {
        requireValue(!instanceIds.has(result.meta.traverse.instanceId));
        instanceIds.add(result.meta.traverse.instanceId);
      }
    }
  }
  requireValue(seen.size === expected.cases.length);
}

try {
  const [mode, reportPath, exitText, receiptPath, ...extra] = process.argv.slice(2);
  requireValue(Object.hasOwn(modes, mode) && extra.length === 0 && typeof reportPath === 'string'
    && typeof receiptPath === 'string' && /^(?:0|[1-9][0-9]{0,2})$/.test(exitText));
  const expected = modes[mode], exitCode = Number(exitText);
  requireValue(exitCode === (expected.failed ? 1 : 0));
  const report = await boundedJson(reportPath, 4 * 1024 * 1024);
  const receipt = await boundedJson(receiptPath, 4096, true);
  verifyReceipt(receipt, expected);
  verifyReport(report, expected, mode);
  process.stdout.write(JSON.stringify({
    schemaVersion: 1, kind: 'traverse-vitest-acceptance', mode, runnerVersion: '4.0.16',
    cases: expected.cases.length, expectedHostFailures: expected.failed ? expected.cases.length : 0,
    runnerExitCode: exitCode, unhandledErrorCount: 0, verified: true,
  }) + '\n');
} catch {
  process.stderr.write('traverse_vitest_result_invalid\n');
  process.exitCode = 1;
}
