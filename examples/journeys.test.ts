import { afterAll, beforeAll, test as base, expect } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createMemoryReplayStore, openSession, type ExecutorInput, type Session } from '@alvarovillalbaa/traverse';
import { createPlaywrightDriver } from '@alvarovillalbaa/traverse/playwright';
import { createUiFixture } from '@alvarovillalbaa/traverse/vitest';

// This example uses the consumer's existing Vitest and Playwright installation.
// Start examples/server.mjs separately. Running it requires browser approval.
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });
const createDriver = ({ signal }: { signal: AbortSignal }) =>
  createPlaywrightDriver(browser, { baseURL: 'http://127.0.0.1:4177/', signal });
const test = base.extend<{ ui: Session }>({ ui: createUiFixture({ createDriver }) });

test('adds an authored project with exact checks', async ({ ui }) => {
  await ui.app.open('/');
  await ui.screen.getByLabel('Project name').fill('Authored launch');
  await ui.screen.getByRole('button', { name: 'Add project' }).click();
  await ui.check(ui.screen.getByText('Authored launch')).count(1);
  await ui.check(ui.screen.getByLabel('Project name')).hasValue('');
});

test('replays only actions confirmed by a later locator check', async ({ signal }) => {
  const store = createMemoryReplayStore();
  let executorCalls = 0;
  // Scripted executor demonstration: this is not a model or AI-quality check.
  const executor = async ({ mode, act }: ExecutorInput) => {
    if (mode !== 'act') return { status: 'blocked' as const };
    executorCalls++;
    await act({ kind: 'click', target: { by: 'role', role: 'button', name: 'Mark reviewed' } });
    return { status: 'done' as const };
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const ui = await openSession({ createDriver, executor, signal, replay: { scope: 'authored-app-v1/review', store } });
    try {
      await ui.app.open('/');
      await ui.agent.act('Mark this checklist reviewed');
      await ui.check(ui.screen.getByRole('status', { name: '' })).hasText('Ready for review');
    } finally { await ui.close(); }
  }
  expect(executorCalls).toBe(1);
});
