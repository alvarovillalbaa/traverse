import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import type { Reporter } from 'vitest/node';

// Vitest v4.0.16 types/reporter.ts defines the three onTestRunEnd arguments.
// Standard json.ts omits unhandled errors, so acceptance requires this receipt.
type EndArguments = Parameters<NonNullable<Reporter['onTestRunEnd']>>;

export default class TraverseReceiptReporter implements Reporter {
  destination: string | null = null;
  emitted = false;

  onInit() {
    try {
      const runner = createRequire(import.meta.url)('vitest/package.json');
      const destination = process.env.TRAVERSE_RECEIPT_PATH;
      if (runner.version !== '4.0.16' || typeof destination !== 'string'
        || destination.length > 4096 || destination.includes('\0') || !isAbsolute(destination)) throw new Error();
      this.destination = destination;
    } catch { throw new Error('traverse_receipt_configuration_invalid'); }
  }

  async onTestRunEnd(...[modules, unhandledErrors, reason]: EndArguments) {
    if (this.emitted || this.destination === null || !Array.isArray(modules) || modules.length > 100
      || !Array.isArray(unhandledErrors) || unhandledErrors.length > 1000
      || !['passed', 'failed', 'interrupted'].includes(reason)) throw new Error('traverse_receipt_invalid');
    this.emitted = true;
    const timeoutEvidence: {
      caseId: string; title: string; fullName: string; moduleId: string; state: string;
      reportedTimeoutMs: number; message: string; errorCount: number;
    }[] = [];
    let observedCases = 0;
    for (const module of modules) {
      for (const testCase of module.children.allTests()) {
        if (++observedCases > 32) throw new Error('traverse_receipt_invalid');
        const result = testCase.result(), errors = result.errors ?? [];
        for (const error of errors) {
          const message = error.message;
          if (typeof message !== 'string') continue;
          const match = /^Test timed out in ([1-9][0-9]{0,5})ms\.\n/.exec(message);
          if (!match) continue;
          if (Buffer.byteLength(message) > 512 || timeoutEvidence.length >= 8
            || testCase.id.length > 256 || testCase.name.length > 512 || testCase.fullName.length > 1024
            || testCase.module.relativeModuleId.length > 512) throw new Error('traverse_receipt_invalid');
          timeoutEvidence.push({
            caseId: testCase.id, title: testCase.name, fullName: testCase.fullName,
            moduleId: testCase.module.relativeModuleId.replaceAll('\\', '/'), state: result.state,
            reportedTimeoutMs: Number(match[1]), message, errorCount: errors.length,
          });
        }
      }
    }
    const receipt = {
      schemaVersion: 2, kind: 'traverse-vitest-run-receipt', runnerVersion: '4.0.16',
      completed: true, endReason: reason, moduleCount: modules.length,
      unhandledErrorCount: unhandledErrors.length, timeoutEvidence,
    };
    const encoded = JSON.stringify(receipt) + '\n';
    if (Buffer.byteLength(encoded) > 4096) throw new Error('traverse_receipt_invalid');
    try {
      await writeFile(this.destination, encoded, { flag: 'wx', mode: 0o600 });
    } catch { throw new Error('traverse_receipt_write_failed'); }
  }
}
