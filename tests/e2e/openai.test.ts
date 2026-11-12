import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { openSession, createMemoryReplayStore, type Session, type SessionOptions } from '@alvarovillalbaa/traverse';
import { createPlaywrightDriver } from '@alvarovillalbaa/traverse/playwright';
import { createOpenAIExecutor } from '@alvarovillalbaa/traverse/openai';

// Real HTTP, installed package, Vitest and Chromium; authored decisions only.
// This does not connect to OpenAI or qualify model intelligence.
const servers: Server[] = [];
let browser: Browser | undefined;
let baseURL = '', endpoint = '';
let decide: (body: any) => unknown = () => { throw new Error('no_authored_decision'); };
const fixtureErrors: unknown[] = [];
const requests: any[] = [];

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture_address_missing');
  return `http://127.0.0.1:${address.port}/`;
}
const wire = (value: unknown) => ({ status: 'completed', error: null, incomplete_details: null, output: [
  { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
] });
function executor() {
  return createOpenAIExecutor({ apiKey: 'AUTHORED_ONLY_NOT_A_REAL_KEY', model: 'authored-model', endpoint, allowLocalHTTP: true, maxRequests: 3 });
}
function createDriver({ signal }: { signal: AbortSignal }) {
  if (!browser) throw new Error('browser_not_owned');
  return createPlaywrightDriver(browser, { baseURL, signal });
}
async function session(options: Partial<SessionOptions>, body: (ui: Session) => Promise<void>, closeCode?: string) {
  const ui = await openSession({ createDriver, stepTimeoutMs: 4000, ...options });
  const errors: unknown[] = [];
  try { await body(ui); } catch (error) { errors.push(error); }
  try {
    if (closeCode) await expect(ui.close()).rejects.toMatchObject({ code: closeCode, message: closeCode });
    else await ui.close();
  } catch (error) { errors.push(error); }
  expect(browser?.contexts()).toHaveLength(0);
  if (errors.length) throw new AggregateError(errors, 'authored_body_or_close_failed');
}

beforeAll(async () => {
  const html = await readFile(new URL('../../examples/app/index.html', import.meta.url));
  baseURL = await listen(createServer((request, response) => {
    if (request.url !== '/' || request.method !== 'GET') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html);
  }));
  endpoint = `${await listen(createServer(async (request, response) => {
    try {
      expect(request.method).toBe('POST'); expect(request.url).toBe('/v1/responses');
      expect(request.headers.authorization).toBe('Bearer AUTHORED_ONLY_NOT_A_REAL_KEY');
      let bytes = 0; const chunks: Buffer[] = [];
      for await (const chunk of request) {
        bytes += chunk.length; if (bytes > 131072) throw new Error('fixture_request_too_large'); chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      expect(body.model).toBe('authored-model'); expect(body.store).toBe(false); expect(body.stream).toBe(false);
      expect(body.text.format.strict).toBe(true); expect(body.tools).toBeUndefined();
      const value = JSON.parse(body.input); requests.push(value);
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(wire(decide({ ...value, schema: body.text.format.schema }))));
    } catch (error) { fixtureErrors.push(error); response.writeHead(500).end('authored_fixture_failed'); }
  }))}v1/responses`;
  browser = await chromium.launch({ headless: true, timeout: 20000 });
}, 30000);

afterAll(async () => {
  const errors: unknown[] = [];
  try { expect(browser?.contexts() ?? []).toHaveLength(0); expect(fixtureErrors).toEqual([]); } catch (error) { errors.push(error); }
  try { await browser?.close(); } catch (error) { errors.push(error); }
  for (const server of servers) {
    try { await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }); }
    catch (error) { errors.push(error); }
  }
  expect(servers.every(server => !server.listening)).toBe(true);
  if (errors.length) throw new AggregateError(errors, 'authored_owned_teardown_failed');
});

test('Responses HTTP actions change Chromium and exact checks qualify provider-free replay', async () => {
  requests.length = 0;
  decide = body => {
    expect(body.mode).toBe('act'); expect(body.goal).toBe('AUTHORED: review checklist');
    if (requests.length === 1) {
      expect(body.observation.content).toContain('Awaiting review');
      return { status: 'action', action: { kind: 'click', target: { by: 'role', role: 'button', name: 'Mark reviewed' } } };
    }
    expect(requests).toHaveLength(2); expect(body.observation.content).toContain('Ready for review');
    return { status: 'done', action: null };
  };
  const store = createMemoryReplayStore();
  const options = { executor: executor(), replay: { scope: 'authored-openai-http-v1', store } };
  await session(options, async ui => {
    await ui.app.open('/'); await ui.agent.act('AUTHORED: review checklist');
    await ui.check(ui.screen.getByRole('status', { name: '' })).hasText('Ready for review');
    expect(ui.evidence().actions).toBe(1);
    const evidence = JSON.stringify(ui.evidence());
    expect(evidence).not.toContain('AUTHORED: review checklist'); expect(evidence).not.toContain('Awaiting review');
    expect(evidence).not.toContain('AUTHORED_ONLY_NOT_A_REAL_KEY');
  });
  expect(requests).toHaveLength(2);
  await session({ ...options, executor: async () => { throw new Error('replay_must_not_invoke_provider'); } }, async ui => {
    await ui.app.open('/'); await ui.agent.act('AUTHORED: review checklist');
    await ui.check(ui.screen.getByRole('status', { name: '' })).hasText('Ready for review');
  });
  expect(requests).toHaveLength(2); expect(fixtureErrors).toEqual([]);
});

test('Responses assertions execute live without mutations and preserve an explicit failed verdict', async () => {
  requests.length = 0;
  decide = body => {
    expect(body.mode).toBe('assert'); expect(body.observation.content).toContain('Awaiting review');
    expect(body.schema.properties.action).toEqual({ type: 'null' });
    return { status: requests.length === 3 ? 'failed' : 'passed', action: null };
  };
  await session({ executor: executor() }, async ui => {
    await ui.app.open('/');
    await ui.agent.assert('AUTHORED: inspect pending checklist');
    await ui.agent.assert('AUTHORED: inspect pending checklist');
    await expect(ui.agent.assert('AUTHORED: return a failed verdict')).rejects.toMatchObject({ code: 'assertion_failed' });
    expect(ui.evidence().actions).toBe(0);
    expect(ui.evidence().steps.filter(step => step.type === 'agent_assert').map(step => step.status)).toEqual(['passed', 'passed', 'failed']);
  }, 'assertion_failed');
  expect(requests).toHaveLength(3); expect(fixtureErrors).toEqual([]);
});
