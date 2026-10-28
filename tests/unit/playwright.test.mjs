import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaywrightDriver } from '../../src/playwright.js';
import { TraverseError } from '../../src/index.js';
import { authoredBrowser } from '../helpers/authored-playwright.mjs';
import { counter, deferred, increment, nameInput, turn } from '../helpers/authored-app.mjs';

const baseURL = 'https://fixture.invalid';
const operation = { timeoutMs: 100 };
const code = expected => error => error instanceof TraverseError && error.code === expected && error.message === expected;

test('Playwright adapter drives exact native locators and preserves explicit operation timeouts', async () => {
  const app = authoredBrowser(), driver = await createPlaywrightDriver(app.browser, { baseURL });
  await driver.open('/counter', operation);
  await driver.perform({ kind: 'click', target: increment }, operation);
  await driver.perform({ kind: 'fill', target: nameInput, value: 'Ada' }, operation);
  await driver.perform({ kind: 'press', target: nameInput, value: 'Enter' }, operation);
  assert.equal(await driver.check({ kind: 'text', target: counter, expected: '1' }, operation), true);
  app.contexts[0].textContentValue = ' 1 \n';
  assert.equal(await driver.check({ kind: 'text', target: counter, expected: ' 1 \n' }, operation), true);
  assert.equal(await driver.check({ kind: 'value', target: nameInput, expected: 'Ada' }, operation), true);
  const context = app.contexts[0];
  assert.equal(context.state.count, 1); assert.equal(context.state.status, 'Saved Ada');
  assert.deepEqual(context.calls.newContext, [{ baseURL: 'https://fixture.invalid/' }]);
  assert.equal(context.calls.goto[0].url, 'https://fixture.invalid/counter');
  assert.equal(context.calls.goto[0].options.waitUntil, 'domcontentloaded');
  assert.ok(context.calls.native.every(call => call.options === undefined || call.options.timeout > 0 && call.options.timeout <= 100));
  assert.ok(context.calls.selectors.some(selector => selector.by === 'role' && selector.role === 'button' && selector.name === 'Increment' && selector.exact));
  await driver.close(); assert.equal(context.calls.close.length, 1); assert.equal(app.browserCloses, 0);
});

test('explicit navigation rejects foreign origins and credentials and detects redirects after navigation was attempted', async () => {
  const app = authoredBrowser(), driver = await createPlaywrightDriver(app.browser, { baseURL });
  for (const path of ['https://other.invalid/', 'https://user:password@fixture.invalid/', 'javascript:alert(1)', '//other.invalid/']) {
    await assert.rejects(driver.open(path, operation), code('origin_denied'));
  }
  assert.equal(app.contexts[0].calls.goto.length, 0);
  app.contexts[0].redirect = 'https://other.invalid/redirected';
  await assert.rejects(driver.open('/counter', operation), code('origin_denied'));
  assert.equal(app.contexts[0].calls.goto.length, 1, 'redirect detection does not claim to prevent the browser request');
  await driver.close(); assert.equal(app.contexts[0].calls.close.length, 1); assert.equal(app.browserCloses, 0);
});

test('ambiguous or absent action targets never dispatch a native click', async () => {
  for (const amount of [0, 2]) {
    const app = authoredBrowser(), driver = await createPlaywrightDriver(app.browser, { baseURL });
    await driver.open('/counter', operation);
    app.contexts[0].multiplicity.set('role:button:Increment', amount);
    await assert.rejects(driver.perform({ kind: 'click', target: increment }, operation), error =>
      error instanceof TraverseError && ['target_ambiguous', 'target_not_found', 'step_timeout'].includes(error.code));
    assert.equal(app.contexts[0].state.count, 0);
    assert.equal(app.contexts[0].calls.native.some(call => call.method === 'click'), false);
    await driver.close();
  }
});

test('deterministic checks return observed booleans and count zero without inventing elements', async () => {
  const app = authoredBrowser(), driver = await createPlaywrightDriver(app.browser, { baseURL });
  await driver.open('/counter', operation);
  assert.equal(await driver.check({ kind: 'count', target: { by: 'testId', value: 'absent' }, expected: 0 }, operation), true);
  assert.equal(await driver.check({ kind: 'visible', target: { by: 'text', value: 'Ready' } }, operation), true);
  let matched = false;
  try { matched = await driver.check({ kind: 'text', target: counter, expected: '999' }, { timeoutMs: 50 }); }
  catch (error) { assert.ok(code('step_timeout')(error)); }
  assert.equal(matched, false, 'an unmet condition must never be reported as passed');
  await driver.close();
});

test('unsupported targets keys and oversized fills fail before native interaction', async () => {
  const app = authoredBrowser(), driver = await createPlaywrightDriver(app.browser, { baseURL });
  await driver.open('/counter', operation);
  const invalid = [
    { kind: 'click', target: { by: 'css', value: 'button' } },
    { kind: 'click', target: { ...increment, script: 'PRIVATE_SCRIPT' } },
    { kind: 'press', target: nameInput, value: 'Control+Shift+Escape' },
    { kind: 'fill', target: nameInput, value: 'x'.repeat(4097) },
  ];
  for (const action of invalid) await assert.rejects(driver.perform(action, operation), error => error instanceof TraverseError);
  assert.equal(app.contexts[0].calls.native.length, 0);
  await driver.close();
});

test('observation reads only body ARIA and rejects incomplete oversized UTF-8 content', async () => {
  const app = authoredBrowser(), driver = await createPlaywrightDriver(app.browser, { baseURL, maxObservationBytes: 64 });
  await driver.open('/counter', operation);
  app.contexts[0].snapshot = 'Counter 0';
  assert.deepEqual(await driver.observe(operation), { url: 'https://fixture.invalid/counter', content: 'Counter 0' });
  app.contexts[0].snapshot = 'é'.repeat(33);
  await assert.rejects(driver.observe(operation), code('observation_too_large'));
  assert.equal(app.contexts[0].calls.aria.length, 2);
  app.contexts[0].snapshot = 'Counter 0';
  app.contexts[0].hooks.aria = () => { app.contexts[0].navigate('https://fixture.invalid/another-document'); };
  await assert.rejects(driver.observe(operation), code('invalid_observation'));
  await driver.close(); assert.equal(app.browserCloses, 0);
});

test('cancelled setup closes a late context and never touches the supplied browser', async () => {
  const app = authoredBrowser(), gate = deferred(), entered = deferred(), controller = new AbortController();
  app.hooks.newContext = () => { entered.resolve(); return gate.promise; };
  const opening = createPlaywrightDriver(app.browser, { baseURL, signal: controller.signal });
  const rejected = assert.rejects(opening, code('session_cancelled'));
  await entered.promise; controller.abort(); await rejected;
  gate.resolve(); await turn(); await turn();
  assert.equal(app.contexts[0].calls.close.length, 1);
  assert.equal(app.contexts[0].calls.newPage.length, 0); assert.equal(app.browserCloses, 0);
});

test('caller cancellation closes an in-flight owned context and fences late native effects', async () => {
  const app = authoredBrowser(), driver = await createPlaywrightDriver(app.browser, { baseURL });
  await driver.open('/counter', operation);
  const gate = deferred(), entered = deferred(), controller = new AbortController();
  app.contexts[0].hooks.action = () => { entered.resolve(); return gate.promise; };
  const pending = driver.perform({ kind: 'click', target: increment }, { signal: controller.signal, timeoutMs: 500 });
  const rejected = assert.rejects(pending, code('session_cancelled'));
  await entered.promise; controller.abort(); await rejected;
  gate.resolve(); await turn();
  assert.equal(app.contexts[0].state.count, 0);
  await driver.close(); assert.equal(app.contexts[0].calls.close.length, 1);
});

test('a setup deadline closes a context whose page promise completes too late', async () => {
  const app = authoredBrowser(), gate = deferred();
  app.hooks.newContext = record => { record.hooks.newPage = () => gate.promise; };
  await assert.rejects(createPlaywrightDriver(app.browser, { baseURL, setupTimeoutMs: 20 }), code('driver_setup_failed'));
  gate.resolve(); await turn();
  assert.equal(app.contexts[0].calls.close.length, 1); assert.equal(app.browserCloses, 0);
});

test('native failures and cleanup failures expose finite codes rather than private driver messages', async () => {
  const app = authoredBrowser(), driver = await createPlaywrightDriver(app.browser, { baseURL });
  await driver.open('/counter', operation);
  app.contexts[0].hooks.action = () => { throw new Error('PRIVATE_NATIVE_ERROR_WITH_ACCOUNT_DATA'); };
  await assert.rejects(driver.perform({ kind: 'click', target: increment }, operation), code('driver_failed'));
  app.contexts[0].hooks.action = () => { throw Object.defineProperty({}, 'name', { get() { throw new Error('PRIVATE_ERROR_GETTER'); } }); };
  await assert.rejects(driver.perform({ kind: 'click', target: increment }, operation), code('driver_failed'));
  app.contexts[0].hooks.close = () => { throw new Error('PRIVATE_CLEANUP_ACCOUNT_DATA'); };
  await assert.rejects(driver.close(), code('cleanup_failed'));
  assert.equal(app.browserCloses, 0);
});

test('closing one adapter is idempotent and leaves another context and consumer browser usable', async () => {
  const app = authoredBrowser();
  const first = await createPlaywrightDriver(app.browser, { baseURL });
  const second = await createPlaywrightDriver(app.browser, { baseURL });
  await first.open('/counter', operation); await second.open('/counter', operation);
  await Promise.all([first.close(), first.close()]);
  await second.perform({ kind: 'click', target: increment }, operation);
  assert.equal(app.contexts[0].calls.close.length, 1); assert.equal(app.contexts[1].state.count, 1);
  assert.equal(app.contexts[1].calls.close.length, 0); assert.equal(app.browserCloses, 0);
  await second.close();
});
