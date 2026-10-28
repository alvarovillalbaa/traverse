import { expect, test as base } from 'vitest';
import { chromium, type Browser } from 'playwright';
import {
  createMemoryReplayStore,
  openSession,
  type Driver,
  type Executor,
  type Observation,
  type ReplayStore,
  type Session,
  type SessionEvidence,
  type SessionOptions,
} from '@alvarovillalbaa/traverse';
import { createPlaywrightDriver } from '@alvarovillalbaa/traverse/playwright';
import {
  createUiFixture,
  type FixtureContext,
  type UiFixture,
  type UiFixtureOptions,
} from '@alvarovillalbaa/traverse/vitest';

// Positive type consumer only. No casts, suppression, relative SDK source imports,
// browser launch, fixture invocation or test registration occurs on import.
export function launchConsumerBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export function defineTypedConsumer(browser: Browser) {
  const store: ReplayStore = createMemoryReplayStore();
  const evidence: SessionEvidence[] = [];
  const driverInputs: { taskId: string | undefined; signal: AbortSignal }[] = [];
  const executor: Executor = async ({ mode, observation, act }) => {
    const initial: Observation = observation;
    if (mode === 'assert') {
      return { status: initial.content.includes('Ready for review') ? 'passed' : 'failed' };
    }
    // Explicit scripted consumer fixture; no model or provider is implied.
    const fresh: Observation = await act({
      kind: 'click',
      target: { by: 'role', role: 'button', name: 'Mark reviewed' },
    });
    return { status: fresh.content.includes('Ready for review') ? 'done' : 'blocked' };
  };
  const fixtureOptions: UiFixtureOptions = {
    createDriver: ({ task, signal }: FixtureContext): Promise<Driver> => {
      driverInputs.push({ taskId: task.id, signal });
      return createPlaywrightDriver(browser, {
        baseURL: 'http://127.0.0.1:4177/',
        signal,
        setupTimeoutMs: 5_000,
        defaultTimeoutMs: 2_000,
        cleanupTimeoutMs: 2_000,
        maxObservationBytes: 65_536,
      });
    },
    sessionTimeoutMs: 10_000,
    stepTimeoutMs: 2_000,
    cleanupTimeoutMs: 2_000,
    maxActions: 10,
    maxAgentSteps: 4,
    replay: { scope: 'authored-consumer-v1/types', store },
    executor,
    onEvidence: (snapshot, context) => {
      const taskId: string | null = context.taskId;
      const observedRunnerState: string | null = context.testState;
      evidence.push(snapshot);
      void taskId;
      void observedRunnerState;
    },
  };
  const fixture: UiFixture = createUiFixture(fixtureOptions);
  const test = base.extend<{ ui: Session }>({ ui: fixture });

  test('the installed public API composes with real consumer types', async ({ ui, task, signal }) => {
    const taskId: string = task.id;
    const runnerSignal: AbortSignal = signal;
    await ui.app.open('/');
    await ui.screen.getByLabel('Project name').fill('Typed authored launch');
    await ui.screen.getByRole('button', { name: 'Add project' }).click();
    await ui.check(ui.screen.getByText('Typed authored launch')).count(1);
    await ui.check(ui.screen.getByLabel('Project name')).hasValue('');
    await ui.agent.act('Mark the checklist reviewed');
    await ui.check(ui.screen.getByRole('status', { name: '' })).hasText('Ready for review');
    await ui.agent.assert('The checklist is ready for review');
    expect(taskId).toBeTruthy();
    expect(runnerSignal.aborted).toBe(false);
    expect(driverInputs).toHaveLength(1);
    expect(ui.evidence().schemaVersion).toBe(1);
  });

  return { test, store, evidence, driverInputs };
}

export async function standaloneTypedSession(browser: Browser, signal: AbortSignal): Promise<SessionEvidence> {
  const options: SessionOptions = {
    createDriver: ({ signal: childSignal }) => createPlaywrightDriver(browser, {
      baseURL: 'http://127.0.0.1:4177/',
      signal: childSignal,
    }),
    signal,
    replay: { scope: 'authored-consumer-v1/standalone', store: createMemoryReplayStore() },
  };
  const session: Session = await openSession(options);
  await session.close();
  return session.evidence();
}
