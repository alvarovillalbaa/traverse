import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryReplayStore, openSession, TraverseError } from '../../src/index.js';
import { authoredApp, deferred, increment, nameInput, recordingStore, turn } from '../helpers/authored-app.mjs';

const code = expected => error => error instanceof TraverseError && error.code === expected && error.message === expected;
const options = (app, extra = {}) => ({ createDriver: () => app.driver, sessionTimeoutMs: 2000, stepTimeoutMs: 500, cleanupTimeoutMs: 100, ...extra });
const clickExecutor = async ({ act }) => { await act({ kind: 'click', target: increment }); return { status: 'done' }; };
async function closeAfterFailure(session) {
  const failure = session.evidence().steps.find(step => step.type !== 'close' && step.code !== null);
  assert.ok(failure, 'an awaited failed step must remain in evidence');
  await assert.rejects(session.close(), code(failure.code));
}

test('locators are inert and exact deterministic actions change independently observed app state', async () => {
  const app = authoredApp(), session = await openSession(options(app));
  const button = session.screen.getByRole('button', { name: 'Increment' });
  assert.ok(Object.isFrozen(button)); assert.equal(app.calls.perform.length, 0);
  await session.app.open('/counter'); await button.click();
  await session.screen.getByLabel('Name').fill('Ada'); await session.screen.getByLabel('Name').press('Enter');
  await session.check(session.screen.getByTestId('counter')).hasText('1');
  await session.check(session.screen.getByLabel('Name')).hasValue('Ada');
  assert.equal(app.state.count, 1); assert.equal(app.state.status, 'Saved Ada');
  assert.deepEqual(app.calls.perform[0].action.target, increment);
  const other = await openSession(options(authoredApp()));
  assert.throws(() => other.check(button), code('invalid_target'));
  await other.close(); await session.close(); assert.equal(app.calls.close.length, 1);
});

test('invalid options fail before constructing a driver', async () => {
  for (const change of [{ maxActions: 0 }, { maxActions: 201 }, { maxAgentSteps: 101 }, { stepTimeoutMs: Infinity },
    { sessionTimeoutMs: 300001 }, { cleanupTimeoutMs: true }, { unknown: true }, { executor: 'implicit-provider' }]) {
    let calls = 0;
    await assert.rejects(openSession({ createDriver: () => { calls += 1; return authoredApp().driver; }, ...change }), code('invalid_options'));
    assert.equal(calls, 0);
  }
});

test('executor actions return fresh bounded observations for a genuinely sequential journey', async () => {
  const app = authoredApp(), seen = []; let savedAct;
  const session = await openSession(options(app, { executor: async ({ observation, act }) => {
    savedAct = act;
    seen.push(observation);
    seen.push(await act({ kind: 'click', target: increment }));
    seen.push(await act({ kind: 'click', target: increment }));
    return { status: 'done' };
  } }));
  await session.agent.act('Increment twice');
  assert.match(seen[0].content, /Counter: 0/); assert.match(seen[1].content, /Counter: 1/); assert.match(seen[2].content, /Counter: 2/);
  assert.ok(seen.every(Object.isFrozen)); assert.equal(app.state.count, 2);
  await assert.rejects(savedAct({ kind: 'click', target: increment }), code('step_inactive'));
  assert.equal(app.state.count, 2);
  await session.check(session.screen.getByTestId('counter')).hasText('2'); await session.close();
});

test('an absent executor reports setup required instead of pretending a semantic step passed', async () => {
  const app = authoredApp(), session = await openSession(options(app));
  await assert.rejects(session.agent.act('PRIVATE_GOAL'), code('executor_required'));
  assert.equal(app.calls.perform.length, 0); await closeAfterFailure(session);
});

test('unknown blocked or mode-inappropriate executor outcomes fail closed', async () => {
  for (const result of [{ status: 'blocked' }, { status: 'passed' }, { status: 'done', secret: 'PRIVATE_EXTRA' }, null]) {
    const app = authoredApp(), session = await openSession(options(app, { executor: async () => result }));
    await assert.rejects(session.agent.act('Inspect the app'), code(result?.status === 'blocked' ? 'executor_blocked' : 'invalid_executor_result'));
    assert.equal(app.state.count, 0); await closeAfterFailure(session);
  }
});

test('semantic assertions always execute live and failed assertions remain failed steps', async () => {
  const app = authoredApp(); let calls = 0;
  const session = await openSession(options(app, { executor: async ({ mode }) => {
    assert.equal(mode, 'assert'); calls += 1; return { status: calls === 1 ? 'passed' : 'failed' };
  } }));
  await session.agent.assert('Is the app ready?');
  await assert.rejects(session.agent.assert('Is the impossible condition true?'), code('assertion_failed'));
  assert.equal(calls, 2); assert.equal(app.calls.perform.length, 0);
  assert.ok(session.evidence().steps.some(step => step.type === 'agent_assert' && step.status === 'failed' && step.code === 'assertion_failed'));
  await closeAfterFailure(session);
});

test('assertion mode cannot mutate even when an executor catches the attempted action error', async () => {
  const app = authoredApp(), session = await openSession(options(app, { executor: async ({ act }) => {
    await assert.rejects(act({ kind: 'click', target: increment }), code('assertion_actions_forbidden'));
    return { status: 'passed' };
  } }));
  await assert.rejects(session.agent.assert('Do not change state'), code('assertion_actions_forbidden'));
  assert.equal(app.state.count, 0); assert.equal(app.calls.perform.length, 0); await closeAfterFailure(session);
});

test('concurrent operations on one session are rejected rather than silently queued', async () => {
  const app = authoredApp(), gate = deferred(), entered = deferred();
  app.hooks.perform = () => { entered.resolve(); return gate.promise; };
  const session = await openSession(options(app));
  const first = session.screen.getByRole('button', { name: 'Increment' }).click();
  await entered.promise;
  await assert.rejects(session.app.open('/another-route'), code('operation_in_progress'));
  assert.equal(app.calls.open.length, 0);
  gate.resolve(); await first; assert.equal(app.state.count, 1); await session.close();
});

test('concurrent executor actions cannot consume a second action or hide their failure', async () => {
  const app = authoredApp(), gate = deferred(), entered = deferred();
  app.hooks.perform = () => { entered.resolve(); return gate.promise; };
  const session = await openSession(options(app, { executor: async ({ act }) => {
    const first = act({ kind: 'click', target: increment });
    await entered.promise;
    await assert.rejects(act({ kind: 'click', target: increment }), code('operation_in_progress'));
    gate.resolve(); await first;
    return { status: 'done' };
  } }));
  await assert.rejects(session.agent.act('Two concurrent actions'), code('operation_in_progress'));
  assert.equal(app.calls.perform.length, 1); assert.equal(app.state.count, 1); await closeAfterFailure(session);
});

test('an executor cannot report done while one of its owned actions is still pending', async () => {
  const app = authoredApp(), gate = deferred();
  app.hooks.perform = () => gate.promise;
  const session = await openSession(options(app, { executor: async ({ act }) => {
    void act({ kind: 'click', target: increment }); return { status: 'done' };
  } }));
  await assert.rejects(session.agent.act('Return too early'), code('incomplete_work'));
  gate.resolve(); await turn(); assert.equal(app.state.count, 0); await closeAfterFailure(session);
});

test('manual and executor actions share one action budget without extra dispatch', async () => {
  const app = authoredApp(), session = await openSession(options(app, { maxActions: 2, executor: clickExecutor }));
  await session.screen.getByRole('button', { name: 'Increment' }).click();
  await session.agent.act('Increment again');
  await assert.rejects(session.screen.getByRole('button', { name: 'Increment' }).click(), code('action_limit'));
  assert.equal(app.state.count, 2); assert.equal(app.calls.perform.length, 2); await closeAfterFailure(session);
});

test('agent action and assertion calls share an explicit agent-step budget', async () => {
  const app = authoredApp(); let calls = 0;
  const session = await openSession(options(app, { maxAgentSteps: 1, executor: async () => { calls += 1; return { status: 'passed' }; } }));
  await session.agent.assert('Ready?');
  await assert.rejects(session.agent.act('Do another step'), code('agent_step_limit'));
  assert.equal(calls, 1); assert.equal(app.calls.perform.length, 0); await closeAfterFailure(session);
});

test('cancelled setup closes a driver that arrives later and never opens a usable session', async () => {
  const app = authoredApp(), gate = deferred(), entered = deferred(), controller = new AbortController();
  const opening = openSession({ createDriver: () => { entered.resolve(); return gate.promise; }, signal: controller.signal, cleanupTimeoutMs: 100 });
  const rejected = assert.rejects(opening, code('session_cancelled'));
  await entered.promise; controller.abort(); await rejected;
  gate.resolve(app.driver); await turn(); await turn(); assert.equal(app.calls.close.length, 1);
});

test('setup has an owned deadline and a late driver is still cleaned exactly once', async () => {
  const app = authoredApp(), gate = deferred();
  await assert.rejects(openSession({ createDriver: () => gate.promise, stepTimeoutMs: 20, cleanupTimeoutMs: 100 }), code('step_timeout'));
  gate.resolve(app.driver); await turn(); await turn(); assert.equal(app.calls.close.length, 1);
});

test('session and step deadlines fence late executor results and their saved action callbacks', async () => {
  for (const timeout of ['step_timeout', 'session_timeout']) {
    const app = authoredApp(), result = deferred(), entered = deferred(); let act;
    const session = await openSession(options(app, { stepTimeoutMs: timeout === 'step_timeout' ? 20 : 500,
      sessionTimeoutMs: timeout === 'session_timeout' ? 20 : 2000,
      executor: input => { act = input.act; entered.resolve(); return result.promise; } }));
    const pending = session.agent.act('PRIVATE_LATE_GOAL'); const rejected = assert.rejects(pending, code(timeout));
    await entered.promise; await rejected;
    await assert.rejects(act({ kind: 'click', target: increment }), code(timeout));
    result.resolve({ status: 'done' }); await turn(); assert.equal(app.state.count, 0);
    assert.equal(session.evidence().lifecycle, 'timed_out'); await closeAfterFailure(session);
  }
});

test('a synchronous executor cannot acknowledge success after blocking past its monotonic deadline', async () => {
  const app = authoredApp();
  const blocked = await openSession(options(app, { stepTimeoutMs: 10, executor: () => {
    const until = performance.now() + 25;
    while (performance.now() < until) { /* Authored opaque synchronous callback; no latency claim. */ }
    return { status: 'done' };
  } }));
  await assert.rejects(blocked.agent.act('A callback that returns after its budget'), code('step_timeout'));
  assert.equal(app.state.count, 0); await closeAfterFailure(blocked);
});

test('caller cancellation stops a pending executor and prevents its later action dispatch', async () => {
  const app = authoredApp(), result = deferred(), entered = deferred(), controller = new AbortController(); let act;
  const session = await openSession(options(app, { signal: controller.signal, executor: input => { act = input.act; entered.resolve(); return result.promise; } }));
  const pending = session.agent.act('Await cancellation'); const rejected = assert.rejects(pending, code('session_cancelled'));
  await entered.promise; controller.abort(); await rejected;
  await assert.rejects(act({ kind: 'click', target: increment }), code('session_cancelled'));
  result.resolve({ status: 'done' }); await turn(); assert.equal(app.calls.perform.length, 0); await closeAfterFailure(session);
});

test('closing pending work cancels it reports incompleteness and closes only once', async () => {
  const app = authoredApp(), result = deferred(), entered = deferred();
  const session = await openSession(options(app, { executor: () => { entered.resolve(); return result.promise; } }));
  const pending = session.agent.act('Pending work'); const rejected = assert.rejects(pending, code('incomplete_work'));
  await entered.promise;
  await assert.rejects(session.close(), code('incomplete_work'));
  await assert.rejects(session.close(), code('incomplete_work'));
  await rejected; result.resolve({ status: 'done' }); await turn();
  assert.equal(app.calls.close.length, 1); assert.equal(session.evidence().lifecycle, 'failed');
});

test('idle cancellation and session expiry remain terminal failures at every close', async () => {
  for (const reason of ['session_cancelled', 'session_timeout']) {
    const app = authoredApp(), cleaned = deferred(), controller = new AbortController();
    app.hooks.close = () => { cleaned.resolve(); };
    const session = await openSession(options(app, { signal: controller.signal,
      sessionTimeoutMs: reason === 'session_timeout' ? 40 : 2000 }));
    if (reason === 'session_cancelled') controller.abort();
    await cleaned.promise;
    await assert.rejects(session.close(), code(reason));
    await assert.rejects(session.close(), code(reason));
    assert.equal(app.calls.perform.length, 0); assert.equal(app.calls.close.length, 1);
    assert.equal(session.evidence().lifecycle, reason === 'session_timeout' ? 'timed_out' : 'cancelled');
  }
});

test('cleanup failures and deadlines remain finite visible outcomes', async () => {
  for (const failure of ['reject', 'timeout']) {
    const app = authoredApp(), gate = deferred();
    app.hooks.close = failure === 'reject' ? () => { throw new Error('PRIVATE_CLEANUP_DATA'); } : () => gate.promise;
    const session = await openSession(options(app, { cleanupTimeoutMs: 20 }));
    await assert.rejects(session.close(), code(failure === 'reject' ? 'cleanup_failed' : 'cleanup_timeout'));
    assert.equal(app.calls.close.length, 1); assert.equal(session.evidence().lifecycle, 'failed');
    gate.resolve(); await turn();
  }
});

test('evidence is detached frozen and redacted while preserving a failed awaited step', async () => {
  const app = authoredApp(), goal = 'PRIVATE_EXECUTOR_GOAL', fill = 'PRIVATE_FILL_VALUE';
  const session = await openSession(options(app, { executor: async () => { throw new Error('PRIVATE_EXECUTOR_ACCOUNT_ERROR'); } }));
  await session.screen.getByLabel('Name').fill(fill);
  const before = session.evidence();
  await assert.rejects(session.agent.act(goal), code('executor_failed'));
  const evidence = session.evidence();
  assert.ok(Object.isFrozen(evidence)); assert.ok(Object.isFrozen(evidence.steps)); assert.ok(Object.isFrozen(evidence.steps[0]));
  assert.equal(before.steps.length, 1); assert.ok(evidence.steps.some(step => step.type === 'agent_act' && step.status === 'failed' && step.code === 'executor_failed'));
  for (const value of [goal, fill, 'PRIVATE_OBSERVATION_SENTINEL', 'PRIVATE_EXECUTOR_ACCOUNT_ERROR', 'Name']) assert.equal(JSON.stringify(evidence).includes(value), false);
  assert.equal(Object.hasOwn(evidence, 'testPassed'), false); await closeAfterFailure(session);
});

test('agent success semantic verdicts value checks and close do not qualify replay records', async () => {
  const observed = recordingStore(createMemoryReplayStore()), app = authoredApp();
  const session = await openSession(options(app, { replay: { scope: 'fixture/v1/pending', store: observed.store },
    executor: async input => input.mode === 'assert' ? { status: 'passed' } : clickExecutor(input) }));
  await session.agent.act('Increment'); assert.equal(observed.writes.length, 0);
  await session.check(session.screen.getByLabel('Name')).hasValue(''); assert.equal(observed.writes.length, 0);
  await session.agent.assert('The count looks correct'); assert.equal(observed.writes.length, 0);
  await session.close(); assert.equal(observed.writes.length, 0);
});

test('a semantic assertion preserves pending actions but only a later deterministic check records them', async () => {
  const semanticStore = recordingStore(createMemoryReplayStore());
  const semantic = await openSession(options(authoredApp(), { replay: { scope: 'fixture/v1/semantic', store: semanticStore.store },
    executor: input => input.mode === 'assert' ? { status: 'passed' } : clickExecutor(input) }));
  await semantic.agent.act('Increment'); await semantic.agent.assert('The count looks correct');
  assert.equal(semanticStore.writes.length, 0);
  await semantic.check(semantic.screen.getByTestId('counter')).hasText('1');
  assert.equal(semanticStore.writes.length, 1, 'only the later deterministic check qualifies the still-pending action');
  await semantic.close();
});

test('an already true unrelated check cannot cache an action when the observed UI did not change', async () => {
  const noOp = authoredApp(), noOpStore = recordingStore(createMemoryReplayStore());
  noOp.driver.perform = async (action, callOptions) => { noOp.calls.perform.push({ action, options: callOptions }); };
  const unchanged = await openSession(options(noOp, { replay: { scope: 'fixture/v1/no-op', store: noOpStore.store }, executor: clickExecutor }));
  await unchanged.agent.act('An action that does nothing');
  await unchanged.check(unchanged.screen.getByText('Ready')).isVisible();
  assert.equal(noOp.state.count, 0); assert.equal(noOpStore.writes.length, 0, 'an already-true unrelated check cannot qualify a no-op');
  await unchanged.close();
});

test('a later successful locator check enables replay in a fresh journey without an executor', async () => {
  const observed = recordingStore(createMemoryReplayStore()), replay = { scope: 'fixture/v1/confirmed', store: observed.store };
  const first = authoredApp(), session = await openSession(options(first, { replay, executor: clickExecutor }));
  await session.agent.act('Increment'); await session.check(session.screen.getByTestId('counter')).hasText('1');
  assert.equal(observed.writes.length, 1); await session.close();
  const second = authoredApp(), repeated = await openSession(options(second, { replay }));
  await repeated.agent.act('Increment');
  assert.equal(second.state.count, 1); assert.equal(second.calls.perform.length, 1);
  await repeated.check(repeated.screen.getByTestId('counter')).hasText('1'); await repeated.close();
});

test('manual intervention or a fill prevents pending actions from becoming replayable', async () => {
  for (const mode of ['manual', 'fill']) {
    const observed = recordingStore(createMemoryReplayStore()), app = authoredApp();
    const session = await openSession(options(app, { replay: { scope: `fixture/v1/${mode}`, store: observed.store }, executor: async input => {
      await input.act({ kind: 'click', target: increment });
      if (mode === 'fill') await input.act({ kind: 'fill', target: nameInput, value: 'PRIVATE_FILL_NOT_CACHED' });
      return { status: 'done' };
    } }));
    await session.agent.act('Perform the authored step');
    if (mode === 'manual') await session.screen.getByRole('button', { name: 'Increment' }).click();
    await session.check(session.screen.getByTestId('counter')).hasText(mode === 'manual' ? '2' : '1');
    assert.equal(observed.writes.length, 0); await session.close();
  }
});

test('replay divergence after dispatch cannot repeat the action through a live executor', async () => {
  for (const divergence of ['check', 'ending UI']) {
    const observed = recordingStore(createMemoryReplayStore()), replay = { scope: `fixture/v1/divergence/${divergence}`, store: observed.store };
    const first = await openSession(options(authoredApp(), { replay, executor: clickExecutor }));
    await first.agent.act('Increment'); await first.check(first.screen.getByTestId('counter')).hasText('1'); await first.close();
    const app = authoredApp(); let live = 0;
    if (divergence === 'check') app.hooks.check = check => check.kind === 'count' ? true : false;
    else {
      const observe = app.driver.observe;
      app.driver.observe = async callOptions => {
        const view = await observe(callOptions);
        return app.state.count ? { ...view, content: view.content + '\nUnexpected extra UI' } : view;
      };
    }
    const second = await openSession(options(app, { replay, executor: async () => { live += 1; return { status: 'done' }; } }));
    await assert.rejects(second.agent.act('Increment'), code('replay_diverged'));
    assert.equal(app.state.count, 1); assert.equal(app.calls.perform.length, 1); assert.equal(live, 0);
    assert.equal(observed.deletions.length, 1); await closeAfterFailure(second);
  }
});

test('replay is bound to explicit scope and starting UI while assertions remain live', async () => {
  const observed = recordingStore(createMemoryReplayStore()), replay = { scope: 'fixture/v1/context', store: observed.store };
  const first = await openSession(options(authoredApp(), { replay, executor: clickExecutor }));
  await first.agent.act('Increment'); await first.check(first.screen.getByTestId('counter')).hasText('1'); await first.close();
  for (const change of ['scope', 'context']) {
    const app = authoredApp({ count: change === 'context' ? 5 : 0 }); let calls = 0;
    const session = await openSession(options(app, { replay: { ...replay, scope: change === 'scope' ? 'fixture/v2/context' : replay.scope },
      executor: async input => { calls += 1; return input.mode === 'assert' ? { status: 'passed' } : clickExecutor(input); } }));
    await session.agent.act('Increment'); await session.agent.assert('Check it semantically');
    assert.equal(calls, 2); assert.equal(app.state.count, change === 'context' ? 6 : 1); await session.close();
  }
});

test('exact scope goal and UI strings distinguish isolated UTF-16 units from Unicode replacement characters', async () => {
  for (const field of ['scope', 'goal', 'content']) {
    const observed = recordingStore(createMemoryReplayStore());
    const scope = field === 'scope' ? '\ud800' : 'fixture/v1/unicode';
    const goal = field === 'goal' ? '\ud800' : 'Increment Unicode';
    const first = await openSession(options(authoredApp({ secret: field === 'content' ? '\ud800' : 'same UI' }),
      { replay: { scope, store: observed.store }, executor: clickExecutor }));
    await first.agent.act(goal); await first.check(first.screen.getByTestId('counter')).hasText('1'); await first.close();
    const app = authoredApp({ secret: field === 'content' ? '\ufffd' : 'same UI' }); let live = 0;
    const second = await openSession(options(app, { replay: { scope: field === 'scope' ? '\ufffd' : scope, store: observed.store },
      executor: async input => { live += 1; return clickExecutor(input); } }));
    await second.agent.act(field === 'goal' ? '\ufffd' : goal);
    assert.equal(live, 1, `distinct exact ${field} strings must not collide through UTF-8 replacement`);
    assert.equal(app.state.count, 1); await second.close();
  }
});
