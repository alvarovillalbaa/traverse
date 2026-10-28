import test from 'node:test';
import assert from 'node:assert/strict';
import { createUiFixture } from '../../src/vitest.js';
import { TraverseError } from '../../src/index.js';
import { authoredApp } from '../helpers/authored-app.mjs';

const task = state => ({ id: 'authored-vitest-task', result: { state } });
const code = expected => error => error instanceof TraverseError && error.code === expected && error.message === expected;

test('the actual Vitest fixture lazily owns setup use teardown and safe host metadata', async () => {
  const app = authoredApp(), controller = new AbortController(), hostTask = task('pass'), evidence = [];
  let setup = 0, received;
  const fixture = createUiFixture({ createDriver: context => { setup += 1; received = context; return app.driver; },
    onEvidence: (value, metadata) => evidence.push({ value, metadata }) });
  assert.equal(setup, 0, 'constructing a fixture does not allocate test resources');
  await fixture({ task: hostTask, signal: controller.signal }, async ui => {
    await ui.screen.getByRole('button', { name: 'Increment' }).click();
    await ui.check(ui.screen.getByTestId('counter')).hasText('1');
  });
  assert.equal(setup, 1); assert.equal(received.task, hostTask);
  assert.ok(received.signal instanceof AbortSignal); assert.notEqual(received.signal, controller.signal);
  assert.equal(app.calls.close.length, 1); assert.equal(evidence.length, 1);
  assert.equal(evidence[0].value.lifecycle, 'closed');
  assert.deepEqual(evidence[0].metadata, { taskId: hostTask.id, testState: 'pass' });
  assert.equal(Object.hasOwn(evidence[0].value, 'testPassed'), false);
});

test('direct body failures survive cleanup and recorded Vitest failures remain runner owned', async () => {
  const app = authoredApp(), body = new Error('AUTHORED_HOST_ASSERTION'), exported = [];
  const fixture = createUiFixture({ createDriver: () => app.driver, onEvidence: (value, metadata) => exported.push({ value, metadata }) });
  await assert.rejects(fixture({ task: task('fail') }, async () => { throw body; }), error => error === body);
  assert.equal(app.calls.close.length, 1); assert.equal(exported[0].metadata.testState, 'fail');
  const recorded = authoredApp(), hostTask = task('fail');
  hostTask.result.errors = [{ message: 'PRIVATE_RUNNER_ASSERTION' }];
  await createUiFixture({ createDriver: () => recorded.driver })({ task: hostTask }, async () => {});
  assert.equal(recorded.calls.close.length, 1, 'the fixture does not rethrow or rewrite errors already owned by Vitest');
});

test('cleanup failure after a successful body remains visible and excludes raw driver errors', async () => {
  const app = authoredApp(); app.hooks.close = () => { throw new Error('PRIVATE_DRIVER_CLEANUP_DETAIL'); };
  const fixture = createUiFixture({ createDriver: () => app.driver });
  await assert.rejects(fixture({ task: task('pass') }, async () => {}), code('cleanup_failed'));
  assert.equal(app.calls.close.length, 1);
});

test('body cleanup and evidence callback failures are all preserved without replacing the body verdict', async () => {
  const app = authoredApp(), body = new Error('AUTHORED_BODY_FAILURE');
  app.hooks.close = () => { throw new Error('PRIVATE_CLOSE_ERROR'); };
  const fixture = createUiFixture({ createDriver: () => app.driver, onEvidence: () => { throw new Error('PRIVATE_REPORTER_ERROR'); } });
  await assert.rejects(fixture({ task: task('fail') }, async () => { throw body; }), error => {
    assert.ok(error instanceof AggregateError); assert.equal(error.message, 'traverse_fixture_failed');
    assert.equal(error.errors[0], body);
    assert.ok(error.errors.some(item => code('cleanup_failed')(item)));
    assert.ok(error.errors.some(item => code('evidence_failed')(item)));
    return true;
  });
  assert.equal(app.calls.close.length, 1);
});

test('an evidence callback failure is visible after cleanup and caller cancellation reaches setup', async () => {
  const app = authoredApp();
  await assert.rejects(createUiFixture({ createDriver: () => app.driver, onEvidence: () => { throw new Error('PRIVATE_EVIDENCE_DETAIL'); } })
    ({ task: task('pass') }, async () => {}), code('evidence_failed'));
  assert.equal(app.calls.close.length, 1);
  const controller = new AbortController(); controller.abort(); let created = 0, used = 0;
  const fixture = createUiFixture({ createDriver: () => { created += 1; return authoredApp().driver; } });
  await assert.rejects(fixture({ task: task('fail'), signal: controller.signal }, async () => { used += 1; }), code('session_cancelled'));
  assert.equal(created, 0); assert.equal(used, 0);
  const idle = authoredApp(), cancelled = new AbortController();
  await assert.rejects(createUiFixture({ createDriver: () => idle.driver })({ task: task('pass'), signal: cancelled.signal },
    async () => { cancelled.abort(); }), code('session_cancelled'));
  assert.equal(idle.calls.close.length, 1, 'idle cancellation must fail teardown even when the host body resolves');
});
