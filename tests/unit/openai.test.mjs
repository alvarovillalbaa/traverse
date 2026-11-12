import test from 'node:test';
import assert from 'node:assert/strict';
import { openSession, TraverseError } from '@alvarovillalbaa/traverse';
import { createOpenAIExecutor } from '@alvarovillalbaa/traverse/openai';
import { authoredApp, deferred, increment, turn } from '../helpers/authored-app.mjs';
import { terminal, step, wire, response } from '../helpers/authored-responses.mjs';

const secret = 'AUTHORED_PRIVATE_KEY';
const options = extra => ({ apiKey: secret, model: 'authored-model', ...extra });
const input = extra => ({ mode: 'act', goal: 'Increment', observation: { url: 'https://fixture.invalid/', content: 'Counter 0' },
  signal: new AbortController().signal, act: async () => ({ url: 'https://fixture.invalid/', content: 'Counter 1' }), ...extra });
const code = expected => error => error instanceof TraverseError && error.code === expected && error.message === expected && !('cause' in error);
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('construction and the main entrypoint perform no provider I/O or credential discovery', () => {
  let calls = 0;
  createOpenAIExecutor(options({ fetch() { calls++; throw new Error(secret); } }));
  assert.equal(calls, 0);
  for (const value of [{}, { apiKey: secret }, { model: 'authored-model' }]) assert.throws(() => createOpenAIExecutor(value), code('invalid_options'));
});

test('invalid options are rejected before any fetch, including accessors and unknown fields', () => {
  for (const change of [{ apiKey: '' }, { apiKey: 'key\nheader' }, { model: '' }, { model: 'model\rheader' },
    { maxRequests: 0 }, { maxRequests: 21 }, { maxRequests: 1.5 }, { maxOutputTokens: 0 }, { maxOutputTokens: 4097 },
    { allowLocalHTTP: 'yes' }, { fetch: 1 }, { unknown: true }]) {
    assert.throws(() => createOpenAIExecutor(options(change)), code('invalid_options'));
  }
  let accessed = false;
  assert.throws(() => createOpenAIExecutor({ model: 'authored-model', get apiKey() { accessed = true; return secret; } }), code('invalid_options'));
  assert.equal(accessed, false);
});

test('endpoints reject credentials, query, fragment, non-loopback HTTP and implicit HTTP permission', () => {
  for (const endpoint of ['http://127.0.0.1:1/', 'http://localhost:1/', 'file:///tmp/key',
    'https://user:pass@fixture.invalid/', 'https://fixture.invalid/?key=secret', 'https://fixture.invalid/#key']) {
    assert.throws(() => createOpenAIExecutor(options({ endpoint })), code('invalid_options'));
  }
  assert.throws(() => createOpenAIExecutor(options({ endpoint: 'http://fixture.invalid/', allowLocalHTTP: true })), code('invalid_options'));
  for (const endpoint of ['http://127.0.0.1:1/responses', 'http://[::1]:1/responses']) {
    createOpenAIExecutor(options({ endpoint, allowLocalHTTP: true }));
  }
});

test('the request explicitly sets model, storage, schema, limits, authorization and redirect policy', async () => {
  const supplied = input(); let calls = 0;
  const executor = createOpenAIExecutor(options({ maxRequests: 2, maxOutputTokens: 768, fetch: async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'error'); assert.equal(request.signal, supplied.signal);
    assert.equal(request.headers.Authorization, `Bearer ${secret}`);
    const body = JSON.parse(request.body);
    assert.equal(body.model, 'authored-model'); assert.equal(body.store, false); assert.equal(body.stream, false);
    assert.equal(body.max_output_tokens, 768); assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true); assert.equal(body.text.format.schema.additionalProperties, false);
    assert.deepEqual(JSON.parse(body.input), { mode: supplied.mode, goal: supplied.goal, observation: supplied.observation });
    assert.equal(body.previous_response_id, undefined); assert.equal(body.tools, undefined); assert.ok(!request.body.includes(secret));
    return response(terminal('done'));
  } }));
  assert.deepEqual(await executor(supplied), { status: 'done' }); assert.equal(calls, 1);
});

test('actions use the runtime callback sequentially and send its fresh observation next', async () => {
  const seen = [], actions = [];
  const executor = createOpenAIExecutor(options({ fetch: async (_url, request) => {
    seen.push(JSON.parse(JSON.parse(request.body).input));
    return response(seen.length === 1 ? step({ kind: 'click', target: increment }) : terminal('done'));
  } }));
  const result = await executor(input({ act: async action => { actions.push(action); return { url: 'https://fixture.invalid/changed', content: 'Counter 1' }; } }));
  assert.deepEqual(result, { status: 'done' }); assert.deepEqual(actions, [{ kind: 'click', target: increment }]);
  assert.equal(seen[0].observation.content, 'Counter 0'); assert.equal(seen[1].observation.content, 'Counter 1');
  assert.equal(seen[1].observation.url, 'https://fixture.invalid/changed');
});

test('all public target kinds and fill/press actions retain their exact values', async () => {
  const targets = [increment, { by: 'label', value: 'Name' }, { by: 'text', value: 'Ready' }, { by: 'testId', value: 'counter' }];
  const expected = targets.map(target => ({ kind: 'click', target })).concat([
    { kind: 'fill', target: targets[1], value: '' }, { kind: 'press', target: targets[1], value: 'Enter' },
  ]);
  const queue = [...expected.map(step), terminal('done')], received = [];
  const executor = createOpenAIExecutor(options({ maxRequests: 8, fetch: async () => response(queue.shift()) }));
  await executor(input({ act: async action => { received.push(action); return input().observation; } }));
  assert.deepEqual(received, expected);
});

test('invalid selectors, scripts, keys and irrelevant fields never dispatch an action', async () => {
  for (const action of [{ kind: 'evaluate', target: increment, value: 'code' }, { kind: 'click', target: { by: 'css', value: '*' } },
    { kind: 'click', target: increment, value: '' }, { kind: 'press', target: increment, value: 'Control+Q' },
    { kind: 'fill', target: increment, value: 'x'.repeat(4097) }, { kind: 'click', target: { ...increment, value: 'extra' } }]) {
    let actions = 0;
    const executor = createOpenAIExecutor(options({ fetch: async () => response(step(action)) }));
    await assert.rejects(executor(input({ act: async () => { actions++; return input().observation; } })), code('executor_failed'));
    assert.equal(actions, 0);
  }
});

test('assertions admit only explicit semantic verdicts and send a mutation-free schema', async () => {
  for (const status of ['passed', 'failed', 'blocked']) {
    const executor = createOpenAIExecutor(options({ fetch: async (_url, request) => {
      const body = JSON.parse(request.body);
      assert.deepEqual(body.text.format.schema.properties.action, { type: 'null' });
      assert.deepEqual(body.text.format.schema.properties.status.enum, ['passed', 'failed', 'blocked']);
      return response(terminal(status));
    } }));
    assert.deepEqual(await executor(input({ mode: 'assert', act: () => { assert.fail('assertion mutated'); } })), { status });
  }
});

test('assertion actions and mode-inappropriate verdicts fail closed', async () => {
  for (const [mode, result] of [['assert', step({ kind: 'click', target: increment })], ['assert', terminal('done')],
    ['act', terminal('passed')], ['act', { status: 'done', action: { kind: 'click', target: increment } }],
    ['act', { status: 'done' }], ['act', { ...terminal('done'), explanation: secret }]]) {
    const executor = createOpenAIExecutor(options({ fetch: async () => response(result) }));
    await assert.rejects(executor(input({ mode, act: () => { assert.fail('invalid decision mutated'); } })), code('executor_failed'));
  }
});

test('completed provider transport never substitutes for a semantic success', async () => {
  for (const value of [wire(terminal('unknown')), { status: 'completed', output: [] }, { output_text: JSON.stringify(terminal('done')) },
    { ...wire(terminal('done')), output: [{ type: 'function_call', name: 'done' }] }]) {
    await assert.rejects(createOpenAIExecutor(options({ fetch: async () => json(value) }))(input()), code('executor_failed'));
  }
});

test('refusal, incomplete, failed and provider error responses do not pass', async () => {
  const refusal = wire(terminal('done')); refusal.output[0].content = [{ type: 'refusal', refusal: secret }];
  for (const value of [refusal, { ...wire(terminal('done')), status: 'incomplete' }, { ...wire(terminal('done')), status: 'failed' },
    { ...wire(terminal('done')), error: { message: secret } }, { ...wire(terminal('done')), incomplete_details: { reason: 'max_output_tokens' } }]) {
    await assert.rejects(createOpenAIExecutor(options({ fetch: async () => json(value) }))(input()), code('executor_failed'));
  }
});

test('ambiguous messages, content and non-assistant output are rejected', async () => {
  const base = wire(terminal('done'));
  const values = [{ ...base, output: [...base.output, ...base.output] },
    { ...base, output: [{ ...base.output[0], role: 'user' }] },
    { ...base, output: [{ ...base.output[0], status: 'in_progress' }] },
    { ...base, output: [{ ...base.output[0], content: [...base.output[0].content, ...base.output[0].content] }] }];
  for (const value of values) await assert.rejects(createOpenAIExecutor(options({ fetch: async () => json(value) }))(input()), code('executor_failed'));
});

test('a reasoning item before one complete assistant decision is accepted', async () => {
  const value = wire(terminal('done')); value.output.unshift({ type: 'reasoning', summary: [] });
  assert.deepEqual(await createOpenAIExecutor(options({ fetch: async () => json(value) }))(input()), { status: 'done' });
});

test('HTTP failures, redirects and wrong content types receive no retry and expose no body', async () => {
  for (const make of [() => new Response(secret, { status: 429 }), () => new Response(secret, { status: 500 }),
    () => new Response(secret, { status: 302, headers: { Location: 'https://elsewhere.invalid/' } }),
    () => new Response(JSON.stringify(wire(terminal('done'))), { headers: { 'Content-Type': 'text/html' } })]) {
    let calls = 0;
    const executor = createOpenAIExecutor(options({ fetch: async () => { calls++; return make(); } }));
    await assert.rejects(executor(input()), code('executor_failed')); assert.equal(calls, 1);
  }
});

test('malformed JSON, malformed decision JSON and invalid UTF-8 are finite errors', async () => {
  const bad = wire(terminal('done')); bad.output[0].content[0].text = secret;
  for (const make of [() => new Response(secret, { headers: { 'Content-Type': 'application/json' } }), () => json(bad),
    () => new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } })]) {
    await assert.rejects(createOpenAIExecutor(options({ fetch: async () => make() }))(input()), code('executor_failed'));
  }
});

test('response bytes are capped while streaming even without content-length', async () => {
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(32769)); }, cancel() { cancelled = true; } });
  const executor = createOpenAIExecutor(options({ fetch: async () => new Response(body, { headers: { 'Content-Type': 'application/json' } }) }));
  await assert.rejects(executor(input()), code('executor_failed')); assert.equal(cancelled, true);
});

test('an oversized declared body is cancelled without reading it', async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const executor = createOpenAIExecutor(options({ fetch: async () => new Response(body,
    { headers: { 'Content-Type': 'application/json', 'Content-Length': '65537' } }) }));
  await assert.rejects(executor(input()), code('executor_failed')); assert.equal(cancelled, true);
});

test('request exhaustion reports blocked without retries or claimed success', async () => {
  let calls = 0, actions = 0;
  const executor = createOpenAIExecutor(options({ maxRequests: 2, fetch: async () => { calls++; return response(step({ kind: 'click', target: increment })); } }));
  assert.deepEqual(await executor(input({ act: async () => { actions++; return input().observation; } })), { status: 'blocked' });
  assert.equal(calls, 2); assert.equal(actions, 2);
});

test('already-aborted work never sends a request or dispatches an action', async () => {
  const controller = new AbortController(); controller.abort(new Error(secret)); let calls = 0;
  const executor = createOpenAIExecutor(options({ fetch: async () => { calls++; return response(terminal('done')); } }));
  await assert.rejects(executor(input({ signal: controller.signal })), code('session_cancelled')); assert.equal(calls, 0);
});

test('cancellation fences a late fetch and disposes its body even when transport ignores abort', async () => {
  const pending = deferred(), entered = deferred(), controller = new AbortController(); let cancelled = false, actions = 0;
  const executor = createOpenAIExecutor(options({ fetch: async () => { entered.resolve(); return pending.promise; } }));
  const running = executor(input({ signal: controller.signal, act: async () => { actions++; return input().observation; } }));
  await entered.promise; controller.abort(new TraverseError('step_timeout'));
  await assert.rejects(running, code('step_timeout'));
  pending.resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }));
  await turn(); assert.equal(cancelled, true); assert.equal(actions, 0);
});

test('cancellation interrupts a pending response read and cancels the stream', async () => {
  const reading = deferred(), controller = new AbortController(); let cancelled = false;
  const body = new ReadableStream({ pull() { reading.resolve(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const executor = createOpenAIExecutor(options({ fetch: async () => new Response(body, { headers: { 'Content-Type': 'application/json' } }) }));
  const running = executor(input({ signal: controller.signal }));
  await reading.promise; controller.abort(); await assert.rejects(running, code('session_cancelled'));
  assert.equal(cancelled, true);
});

test('aborting at the transport boundary prevents the returned action', async () => {
  const controller = new AbortController(); let actions = 0;
  const executor = createOpenAIExecutor(options({ fetch: async () => { controller.abort(); return response(step({ kind: 'click', target: increment })); } }));
  await assert.rejects(executor(input({ signal: controller.signal, act: async () => { actions++; return input().observation; } })), code('session_cancelled'));
  assert.equal(actions, 0);
});

test('cancellation after an action starts prevents another provider request', async () => {
  const pending = deferred(), entered = deferred(), controller = new AbortController(); let calls = 0;
  const executor = createOpenAIExecutor(options({ fetch: async () => { calls++; return response(step({ kind: 'click', target: increment })); } }));
  const running = executor(input({ signal: controller.signal, act: async () => { entered.resolve(); return pending.promise; } }));
  await entered.promise; controller.abort(); await assert.rejects(running, code('session_cancelled'));
  pending.resolve(input().observation); await turn(); assert.equal(calls, 1);
});

test('opaque transport failures are redacted while runtime action errors retain their code', async () => {
  await assert.rejects(createOpenAIExecutor(options({ fetch: async () => { throw new Error(secret); } }))(input()), code('executor_failed'));
  const executor = createOpenAIExecutor(options({ fetch: async () => response(step({ kind: 'click', target: increment })) }));
  await assert.rejects(executor(input({ act: async () => { throw new TraverseError('action_limit'); } })), code('action_limit'));
});

test('oversized observations fail before transport, including fresh action observations', async () => {
  let calls = 0;
  const executor = createOpenAIExecutor(options({ fetch: async () => { calls++; return response(step({ kind: 'click', target: increment })); } }));
  const oversized = { url: 'https://fixture.invalid/', content: 'é'.repeat(32769) };
  await assert.rejects(executor(input({ observation: oversized })), code('observation_too_large')); assert.equal(calls, 0);
  await assert.rejects(executor(input({ act: async () => oversized })), code('observation_too_large')); assert.equal(calls, 1);
});

test('real session action limits remain sticky and cleanup preserves the failed verdict', async () => {
  const app = authoredApp(); let calls = 0;
  const executor = createOpenAIExecutor(options({ fetch: async () => { calls++; return response(step({ kind: 'click', target: increment })); } }));
  const ui = await openSession({ createDriver: () => app.driver, executor, maxActions: 1 });
  await assert.rejects(ui.agent.act('PRIVATE_GOAL'), code('action_limit'));
  assert.equal(app.state.count, 1); assert.equal(calls, 2);
  await assert.rejects(ui.close(), code('action_limit')); assert.equal(app.calls.close.length, 1);
  const evidence = JSON.stringify(ui.evidence());
  assert.ok(!evidence.includes(secret)); assert.ok(!evidence.includes('PRIVATE_GOAL')); assert.ok(!evidence.includes('PRIVATE_OBSERVATION'));
});
