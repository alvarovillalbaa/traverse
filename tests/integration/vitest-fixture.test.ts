import { expect, test } from 'vitest';
import type { Session } from '@alvarovillalbaa/traverse';
import { authoredFixture } from '../fixtures/vitest-driver.js';

// The runner is real Vitest; the injected driver is explicitly authored T2 data.
const lazy = authoredFixture();
const lazyTest = test.extend<{ ui: Session }>({ ui: lazy.fixture });
const journey = authoredFixture();
const journeyTest = test.extend<{ ui: Session }>({ ui: journey.fixture });

lazyTest('unused Traverse fixture remains lazy in the real runner', ({ task }) => {
  expect(lazy.factoryCalls).toBe(0);
  task.meta.traverse = {
    boundary: 'authored-driver-real-vitest', unused: true,
    factoryCalls: lazy.factoryCalls, closeCalls: 0, bodyEntered: true,
  };
});

journeyTest('real Vitest initializes the requested fixture and tears down an exact checked journey', async ({ ui, task, signal }) => {
  journey.markBody(task);
  expect(journey.signalFor(task.id)).toBeInstanceOf(AbortSignal);
  expect(journey.signalFor(task.id)).not.toBe(signal);
  expect(journey.signalFor(task.id)?.aborted).toBe(false);
  await ui.app.open('/counter');
  await ui.screen.getByRole('button', { name: 'Increment' }).click();
  await ui.check(ui.screen.getByTestId('counter')).hasText('1');
});

journeyTest('a second real Vitest test receives pristine independently owned app state', async ({ ui, task }) => {
  journey.markBody(task);
  await ui.check(ui.screen.getByTestId('counter')).hasText('0');
});
