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
    const receipt = {
      schemaVersion: 1, kind: 'traverse-vitest-run-receipt', runnerVersion: '4.0.16',
      completed: true, endReason: reason, moduleCount: modules.length,
      unhandledErrorCount: unhandledErrors.length,
    };
    try {
      await writeFile(this.destination, JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
    } catch { throw new Error('traverse_receipt_write_failed'); }
  }
}
