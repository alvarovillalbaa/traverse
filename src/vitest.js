import { TraverseError, record } from './protocol.js';
import { openSession } from './session.js';

function isSignal(value) {
  return value === undefined || (value !== null && typeof value.aborted === 'boolean'
    && typeof value.addEventListener === 'function' && typeof value.removeEventListener === 'function');
}

/** Create a lazy test-scoped fixture; the consuming test runner remains Vitest. */
export function createUiFixture(options) {
  record(options, ['createDriver', 'signal', 'sessionTimeoutMs', 'stepTimeoutMs', 'cleanupTimeoutMs', 'maxActions', 'maxAgentSteps', 'executor', 'replay', 'onEvidence'], ['createDriver']);
  if (typeof options.createDriver !== 'function'
    || (options.onEvidence !== undefined && typeof options.onEvidence !== 'function')
    || !isSignal(options.signal)) throw new TraverseError('invalid_options');
  const { onEvidence, ...sessionOptions } = options;

  return async function uiFixture({ task, signal }, use) {
    if (!isSignal(signal) || typeof use !== 'function') throw new TraverseError('invalid_options');
    const controller = new AbortController();
    const sources = [...new Set([signal, sessionOptions.signal].filter(Boolean))];
    const abort = () => controller.abort();
    for (const source of sources) {
      source.addEventListener('abort', abort, { once: true });
      if (source.aborted) abort();
    }

    let ui;
    const failures = [];
    try {
      ui = await openSession({
        ...sessionOptions,
        signal: controller.signal,
        createDriver: ({ signal: sessionChildSignal }) => sessionOptions.createDriver({ task, signal: sessionChildSignal }),
      });
      try { await use(ui); } catch (error) { failures.push(error); }
    } catch (error) {
      failures.push(error);
    } finally {
      if (ui) {
        try { await ui.close(); } catch (error) { failures.push(error); }
        if (onEvidence) {
          try {
            const state = task?.result?.state;
            const testState = ['pass', 'fail', 'skip', 'todo', 'run', 'queued', 'pending'].includes(state) ? state : 'unknown';
            const taskId = typeof task?.id === 'string' ? task.id.slice(0, 256) : null;
            await onEvidence(ui.evidence(), Object.freeze({ taskId, testState }));
          } catch { failures.push(new TraverseError('evidence_failed')); }
        }
      }
      for (const source of sources) source.removeEventListener('abort', abort);
    }

    // Vitest normally stores body failures on task.result; use() resolves at
    // teardown. Those errors stay with Vitest. Preserve direct use() rejections
    // too when another compatible host supplies them.
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'traverse_fixture_failed');
  };
}
