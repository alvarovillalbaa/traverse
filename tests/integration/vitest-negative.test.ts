import { test } from 'vitest';
import type { Session } from '@alvarovillalbaa/traverse';
import { authoredFixture } from '../fixtures/vitest-driver.js';

// Every test in this separate file MUST fail normally. Never use test.fails.
const body = authoredFixture();
const bodyTest = test.extend<{ ui: Session }>({ ui: body.fixture });
const cleanup = authoredFixture({ cleanupFailure: true });
const cleanupTest = test.extend<{ ui: Session }>({ ui: cleanup.fixture });
const evidence = authoredFixture({ evidenceFailure: true });
const evidenceTest = test.extend<{ ui: Session }>({ ui: evidence.fixture });
const combined = authoredFixture({ cleanupFailure: true });
const combinedTest = test.extend<{ ui: Session }>({ ui: combined.fixture });
const cancellation = new AbortController();
const cancelled = authoredFixture({ signal: cancellation.signal });
const cancellationTest = test.extend<{ ui: Session }>({ ui: cancelled.fixture });
const hostTimeout = authoredFixture();
const timeoutTest = test.extend<{ ui: Session }>({ ui: hostTimeout.fixture });

bodyTest('recorded Vitest body failure survives successful Traverse teardown', ({ ui, task }) => {
  body.markBody(task); void ui;
  throw new Error('AUTHORED_VITEST_BODY_FAILURE');
});

cleanupTest('Traverse cleanup failure makes a successful Vitest body fail', ({ ui, task }) => {
  cleanup.markBody(task); void ui;
});

evidenceTest('Traverse evidence callback failure makes a successful Vitest body fail', ({ ui, task }) => {
  evidence.markBody(task); void ui;
});

combinedTest('recorded body failure and Traverse cleanup failure both reach the Vitest result', ({ ui, task }) => {
  combined.markBody(task); void ui;
  throw new Error('AUTHORED_VITEST_COMBINED_BODY_FAILURE');
});

cancellationTest('idle caller cancellation cannot become a passing Vitest teardown', ({ ui, task }) => {
  cancelled.markBody(task); void ui;
  cancellation.abort();
});

timeoutTest('real Vitest timeout aborts the fixture signal and closes its owned driver', { timeout: 250 }, async ({ ui, task, signal }) => {
  hostTimeout.markBody(task); void ui;
  await new Promise<void>(resolve => {
    const aborted = () => { hostTimeout.markHostAbort(task.id); resolve(); };
    if (signal.aborted) aborted();
    else signal.addEventListener('abort', aborted, { once: true });
  });
});
