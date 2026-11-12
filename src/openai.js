import { TraverseError, record, text, validateAction, validateObservation, safeError } from './protocol.js';
import { instructions } from './prompts/openai-v1.js';

const MAX_RESPONSE_BYTES = 65_536;
const fail = () => new TraverseError('executor_failed');
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string' };
const target = { anyOf: [
  object({ by: { type: 'string', enum: ['role'] }, role: string, name: string }),
  object({ by: { type: 'string', enum: ['label', 'text', 'testId'] }, value: string }),
] };
const action = { anyOf: [
  { type: 'null' },
  object({ kind: { type: 'string', enum: ['click'] }, target }),
  object({ kind: { type: 'string', enum: ['fill', 'press'] }, target, value: string }),
] };

function boundedInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TraverseError('invalid_options');
  return value;
}
function guard(signal) {
  if (signal.aborted) throw safeError(signal.reason, 'session_cancelled');
}
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const dispose = () => signal.removeEventListener('abort', aborted);
    const aborted = () => { dispose(); reject(safeError(signal.reason, 'session_cancelled')); };
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(value => {
      dispose();
      try { guard(signal); resolve(value); } catch (error) { reject(error); }
    }, error => { dispose(); reject(error); });
    if (signal.aborted) aborted();
  });
}
function cancel(body) {
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* Preserve the original finite error. */ }
}
async function responseJSON(response, signal) {
  if (!response.ok || response.redirected || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
    || Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    cancel(response.body); throw fail();
  }
  const reader = response.body?.getReader();
  if (!reader) throw fail();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      guard(signal);
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw fail();
      chunks.push(value);
    }
    guard(signal);
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } finally {
    cancel(reader);
    try { reader.releaseLock(); } catch { /* Cancellation can leave an opaque read pending. */ }
  }
}
function decision(response, mode) {
  if (!response || response.status !== 'completed' || response.error != null || response.incomplete_details != null
    || !Array.isArray(response.output) || response.output.length > 16) throw fail();
  const messages = response.output.filter(item => item?.type === 'message');
  if (messages.length !== 1 || response.output.some(item => !['message', 'reasoning'].includes(item?.type))) throw fail();
  const message = messages[0];
  if (message.role !== 'assistant' || message.status !== 'completed' || !Array.isArray(message.content)
    || message.content.length !== 1 || message.content[0]?.type !== 'output_text'
    || typeof message.content[0].text !== 'string') throw fail();
  const result = JSON.parse(message.content[0].text);
  record(result, ['status', 'action'], ['status', 'action'], 'executor_failed');
  const statuses = mode === 'act' ? ['action', 'done', 'blocked'] : ['passed', 'failed', 'blocked'];
  if (!statuses.includes(result.status)) throw fail();
  if (result.status === 'action') {
    try { return { status: 'action', action: validateAction(result.action) }; } catch { throw fail(); }
  }
  if (result.action !== null) throw fail();
  return { status: result.status };
}

/** Explicit Responses API transport; importing or constructing it performs no I/O. */
export function createOpenAIExecutor(options) {
  record(options, ['apiKey', 'model', 'endpoint', 'allowLocalHTTP', 'fetch', 'maxRequests', 'maxOutputTokens'], ['apiKey', 'model']);
  const apiKey = text(options.apiKey, 512, 'invalid_options');
  const model = text(options.model, 128, 'invalid_options');
  if (/\s/.test(apiKey) || /[\x00-\x1f\x7f]/.test(model)) throw new TraverseError('invalid_options');
  if (options.allowLocalHTTP !== undefined && typeof options.allowLocalHTTP !== 'boolean') throw new TraverseError('invalid_options');
  let endpoint;
  try {
    const url = new URL(text(options.endpoint ?? 'https://api.openai.com/v1/responses', 2048, 'invalid_options'));
    const local = options.allowLocalHTTP === true && ['127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error();
    endpoint = url.href;
  } catch { throw new TraverseError('invalid_options'); }
  const fetchResponse = options.fetch ?? globalThis.fetch;
  if (typeof fetchResponse !== 'function') throw new TraverseError('invalid_options');
  const maxRequests = boundedInteger(options.maxRequests, 6, 20);
  const maxOutputTokens = boundedInteger(options.maxOutputTokens, 512, 4096);
  return async input => {
    try {
      record(input, ['mode', 'goal', 'observation', 'signal', 'act'], ['mode', 'goal', 'observation', 'signal', 'act']);
      const { mode, goal, signal, act } = input;
      if (!['act', 'assert'].includes(mode) || !(signal instanceof AbortSignal) || typeof act !== 'function') throw new TraverseError('invalid_options');
      text(goal, 2000, 'invalid_goal');
      let observation = validateObservation(input.observation);
      for (let request = 0; request < maxRequests; request++) {
        guard(signal);
        const schema = object({ status: { type: 'string', enum: mode === 'act' ? ['action', 'done', 'blocked'] : ['passed', 'failed', 'blocked'] },
          action: mode === 'act' ? action : { type: 'null' } });
        const pending = Promise.resolve(fetchResponse(endpoint, {
          method: 'POST', redirect: 'error', signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, store: false, stream: false, max_output_tokens: maxOutputTokens,
            instructions, input: JSON.stringify({ mode, goal, observation }),
            text: { format: { type: 'json_schema', name: 'traverse_decision_v1', strict: true, schema } } }),
        })).then(response => { if (signal.aborted) { cancel(response.body); guard(signal); } return response; });
        const response = await abortable(pending, signal);
        const result = decision(await responseJSON(response, signal), mode);
        guard(signal);
        if (result.status !== 'action') return Object.freeze(result);
        // The runtime-owned callback retains action counts, deadlines and sticky failures.
        observation = validateObservation(await abortable(act(result.action), signal));
      }
      guard(signal);
      return Object.freeze({ status: 'blocked' });
    } catch (error) { throw safeError(error, 'executor_failed'); }
  };
}
