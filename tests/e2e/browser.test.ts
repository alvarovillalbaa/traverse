import { afterAll, beforeAll, describe, expect, test as base } from 'vitest';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import {
  createMemoryReplayStore,
  openSession,
  type Executor,
  type ExecutorInput,
  type Session,
  type SessionEvidence,
  type SessionOptions,
} from '@alvarovillalbaa/traverse';
import { createPlaywrightDriver } from '@alvarovillalbaa/traverse/playwright';
import { createUiFixture } from '@alvarovillalbaa/traverse/vitest';

// Real Chromium + the authored loopback app. Scripted executors below exercise
// the public executor contract; they are not model/provider acceptance.
const baseURL = 'http://127.0.0.1:4177/';
const privateProject = 'PRIVATE_AUTHORED_PROJECT_00123';
let browser: Browser | undefined;
const fixtureEvidence: { evidence: SessionEvidence; taskId: string | null; testState: string | null }[] = [];
let fixtureTaskId: string | undefined;

function consumerBrowser(): Browser {
  if (!browser) throw new Error('authored_browser_not_started');
  return browser;
}

const createDriver = ({ signal }: { signal: AbortSignal }) =>
  createPlaywrightDriver(consumerBrowser(), { baseURL, signal });

const test = base.extend<{ ui: Session }>({
  ui: createUiFixture({
    createDriver,
    onEvidence(evidence, metadata) { fixtureEvidence.push({ evidence, ...metadata }); },
  }),
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

async function withSession<T>(
  options: SessionOptions,
  body: (ui: Session) => Promise<T>,
  expectedCloseCode?: string,
): Promise<T> {
  const ui = await openSession(options);
  let result: T | undefined;
  const failures: unknown[] = [];
  try { result = await body(ui); } catch (error) { failures.push(error); }
  try {
    if (expectedCloseCode) await expect(ui.close()).rejects.toMatchObject({ code: expectedCloseCode, message: expectedCloseCode });
    else await ui.close();
  } catch (error) { failures.push(error); }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'authored_body_and_teardown_failed');
  return result as T;
}

describe.sequential('Traverse Chromium acceptance', () => {
  beforeAll(async () => { browser = await chromium.launch({ headless: true, timeout: 20_000 }); }, 30_000);

  afterAll(async () => {
    if (!browser) return;
    try {
      expect(browser.contexts()).toHaveLength(0);
      expect(fixtureEvidence).toHaveLength(1);
      expect(fixtureEvidence[0].taskId).toBe(fixtureTaskId);
      expect(fixtureEvidence[0].evidence.lifecycle).toBe('closed');
      expect(fixtureEvidence[0].evidence.steps.at(-1)).toMatchObject({ type: 'close', status: 'passed', code: null });
      expect(JSON.stringify(fixtureEvidence)).not.toContain(privateProject);
      expect(fixtureEvidence[0].evidence).not.toHaveProperty('testPassed');
    } finally { await browser.close(); }
  });

  test('Vitest fixture fills and submits exact controls through public exports', async ({ ui, task }) => {
    fixtureTaskId = task.id;
    await ui.app.open('/');
    await ui.check(ui.screen.getByRole('heading', { name: 'Launch checklist' })).isVisible();
    await ui.screen.getByLabel('Project name').fill(privateProject);
    await ui.check(ui.screen.getByLabel('Project name')).hasValue(privateProject);
    await ui.screen.getByRole('button', { name: 'Add project' }).click();
    await ui.check(ui.screen.getByText(privateProject)).count(1);
    await ui.check(ui.screen.getByLabel('Project name')).hasValue('');
    const evidence = JSON.stringify(ui.evidence());
    expect(evidence).not.toContain(privateProject);
    expect(evidence).not.toContain('Launch checklist');
    expect(ui.evidence().steps.filter(step => step.type === 'fill')).toHaveLength(1);
  });

  test('scripted executor receives real observations and assertions always run live', async ({ signal }) => {
    const observations: ExecutorInput['observation'][] = [];
    const calls = { act: 0, assert: 0 };
    const executor: Executor = async ({ mode, observation, act }) => {
      observations.push(observation);
      if (mode === 'act') {
        calls.act += 1;
        observations.push(await act({ kind: 'click', target: { by: 'role', role: 'button', name: 'Mark reviewed' } }));
        return { status: 'done' };
      }
      calls.assert += 1;
      return { status: observation.content.includes('Ready for review') ? 'passed' : 'failed' };
    };
    const closed = await withSession({ createDriver, executor, signal,
      replay: { scope: 'authored-web-v1/live-semantic-checks', store: createMemoryReplayStore() } }, async ui => {
      await ui.app.open('/');
      await ui.agent.act('SCRIPTED: mark this checklist reviewed');
      await ui.check(ui.screen.getByRole('status', { name: '' })).hasText('Ready for review');
      await ui.agent.assert('SCRIPTED: the status says Ready for review');
      await ui.agent.assert('SCRIPTED: the status says Ready for review');
      return ui;
    });
    expect(calls).toEqual({ act: 1, assert: 2 });
    expect(observations[0].url).toBe(baseURL);
    expect(observations[0].content).toContain('Awaiting review');
    expect(observations[1].content).toContain('Ready for review');
    expect(observations.every(value => Object.keys(value).sort().join(',') === 'content,url')).toBe(true);
    expect(JSON.stringify(closed.evidence())).not.toContain('SCRIPTED:');
    expect(JSON.stringify(closed.evidence())).not.toContain('Launch checklist');
  });

  test('a later checked action replays in a fresh context without a second executor call', async ({ signal }) => {
    const store = createMemoryReplayStore();
    let calls = 0;
    const executor: Executor = async ({ mode, act }) => {
      if (mode !== 'act') return { status: 'blocked' };
      calls += 1;
      await act({ kind: 'click', target: { by: 'role', role: 'button', name: 'Mark reviewed' } });
      return { status: 'done' };
    };
    const contexts: BrowserContext[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await withSession({ createDriver, signal, replay: { scope: 'authored-web-v1/checked-review', store },
        ...(attempt === 0 ? { executor } : {}) }, async ui => {
        contexts.push(consumerBrowser().contexts()[0]);
        await ui.app.open('/');
        await ui.check(ui.screen.getByRole('status', { name: '' })).hasText('Awaiting review');
        await ui.agent.act('SCRIPTED: review the unchanged authored checklist');
        await ui.check(ui.screen.getByRole('status', { name: '' })).hasText('Ready for review');
      });
      expect(consumerBrowser().contexts()).toHaveLength(0);
    }
    expect(contexts[0]).not.toBe(contexts[1]);
    expect(calls).toBe(1);
  });

  test('an unchecked successful action is not replayed in another context', async ({ signal }) => {
    const store = createMemoryReplayStore();
    let calls = 0;
    const executor: Executor = async ({ act }) => {
      calls += 1;
      await act({ kind: 'click', target: { by: 'role', role: 'button', name: 'Mark reviewed' } });
      return { status: 'done' };
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await withSession({ createDriver, executor, signal, replay: { scope: 'authored-web-v1/unchecked-review', store } }, async ui => {
        await ui.app.open('/');
        await ui.agent.act('SCRIPTED: review without a qualifying check');
        // The executor completed and UI changed, but there is deliberately no
        // locator check after this action; normal close must not confirm it.
      });
    }
    expect(calls).toBe(2);
    expect(consumerBrowser().contexts()).toHaveLength(0);
  });

  test('owned contexts isolate UI data and preserve a consumer context', async ({ signal }) => {
    const supplied = consumerBrowser();
    const consumer = await supplied.newContext();
    const unrelatedPage = await consumer.newPage();
    try {
      await unrelatedPage.goto(baseURL, { timeout: 5_000, waitUntil: 'domcontentloaded' });
      await unrelatedPage.getByLabel('Project name', { exact: true }).fill('Consumer-owned input', { timeout: 5_000 });
      await withSession({ createDriver, signal }, async first => {
        await first.app.open('/');
        await first.screen.getByLabel('Project name').fill('Private first-context input');
        await withSession({ createDriver, signal }, async second => {
          await second.app.open('/');
          await second.check(second.screen.getByLabel('Project name')).hasValue('');
          await second.check(second.screen.getByRole('listitem', { name: '' })).count(0);
          expect(supplied.contexts()).toHaveLength(3);
        });
        expect(supplied.contexts()).toHaveLength(2);
        await first.check(first.screen.getByLabel('Project name')).hasValue('Private first-context input');
      });
      expect(supplied.isConnected()).toBe(true);
      expect(supplied.contexts()).toEqual([consumer]);
      expect(await unrelatedPage.getByLabel('Project name', { exact: true }).inputValue({ timeout: 5_000 })).toBe('Consumer-owned input');
    } finally { await consumer.close(); }
  });

  test('cancellation closes a real page and fences a late executor action', async ({ signal }) => {
    const entered = deferred();
    const release = deferred();
    const completed = deferred();
    const controller = new AbortController();
    let lateCode: string | undefined;
    const executor: Executor = async ({ act }) => {
      entered.resolve();
      await release.promise;
      try { await act({ kind: 'click', target: { by: 'role', role: 'button', name: 'Mark reviewed' } }); }
      catch (error) { lateCode = (error as { code?: string }).code; }
      finally { completed.resolve(); }
      return { status: 'done' };
    };
    try {
      await withSession({ createDriver, executor, signal: AbortSignal.any([signal, controller.signal]) }, async ui => {
        await ui.app.open('/');
        const pending = ui.agent.act('SCRIPTED: wait before a late click');
        const outcome = pending.then(() => ({ error: undefined }), error => ({ error }));
        await Promise.race([entered.promise, outcome.then(({ error }) => { throw error ?? new Error('executor_finished_before_entry'); })]);
        controller.abort();
        expect((await outcome).error).toMatchObject({ code: 'session_cancelled', message: 'session_cancelled' });
      }, 'session_cancelled');
      expect(consumerBrowser().contexts()).toHaveLength(0);
      release.resolve();
      await completed.promise;
      expect(lateCode).toBe('session_cancelled');
      expect(consumerBrowser().contexts()).toHaveLength(0);
    } finally { release.resolve(); }
  });

  test('a failed protocol step remains visible at real-page teardown', async ({ signal }) => {
    await withSession({ createDriver, signal }, async ui => {
      await ui.app.open('/');
      await ui.screen.getByLabel('Project name').fill('PRIVATE_FAILED_STEP_INPUT');
      await expect(ui.screen.getByLabel('Project name').press('Control+Shift+Escape'))
        .rejects.toMatchObject({ code: 'invalid_action', message: 'invalid_action' });
      expect(ui.evidence().lifecycle).toBe('failed');
      expect(JSON.stringify(ui.evidence())).not.toContain('PRIVATE_FAILED_STEP_INPUT');
      expect(ui.evidence().steps.at(-1)).toMatchObject({ type: 'press', status: 'failed', code: 'invalid_action' });
    }, 'invalid_action');
    expect(consumerBrowser().contexts()).toHaveLength(0);
    expect(consumerBrowser().isConnected()).toBe(true);
  });

  test('a native locator deadline cannot turn into a passing session', async ({ signal }) => {
    // Prepare the real page before the short operation budget, so cold page
    // setup is not mistaken for the missing-control deadline being checked.
    const driver = await createDriver({ signal });
    try {
      await driver.open('/', { signal, timeoutMs: 5_000 });
      await withSession({ createDriver: () => driver, signal, stepTimeoutMs: 200 }, async ui => {
        await expect(ui.screen.getByRole('button', { name: 'Never rendered authored button' }).click())
          .rejects.toMatchObject({ code: 'step_timeout', message: 'step_timeout' });
        expect(ui.evidence().lifecycle).toBe('timed_out');
        expect(ui.evidence().steps.some(step => step.type === 'click' && step.status === 'passed')).toBe(false);
      }, 'step_timeout');
      expect(consumerBrowser().contexts()).toHaveLength(0);
      expect(consumerBrowser().isConnected()).toBe(true);
    } finally { await driver.close(); }
  });
});
