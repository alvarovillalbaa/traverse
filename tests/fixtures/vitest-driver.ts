import { createUiFixture } from '@alvarovillalbaa/traverse/vitest';
import type { Action, Assertion, Driver, SessionEvidence } from '@alvarovillalbaa/traverse';

// T2 app state behind the real Vitest fixture. This is not a browser boundary.
type HostTask = {
  id: string;
  meta: Record<string, unknown>;
  result?: { state?: string; errors?: unknown[] };
};
type Receipt = {
  boundary: 'authored-driver-real-vitest';
  instanceId: number;
  factoryCalls: number;
  closeCalls: number;
  evidenceCalls: number;
  bodyEntered: boolean;
  taskMatched: boolean;
  childSignalForwarded: boolean;
  hostSignalAborted: boolean;
  childAbortedAtEvidence: boolean;
  bodyStateAtEvidence: string | null;
  bodyErrorsAtEvidence: number | null;
  lifecycle: SessionEvidence['lifecycle'] | null;
  finalCount: number | null;
  stepCodes: string[];
  events: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isHostTask(value: unknown): value is HostTask {
  if (!isRecord(value) || typeof value.id !== 'string' || !isRecord(value.meta)) return false;
  if (value.result === undefined) return true;
  return isRecord(value.result) && (value.result.state === undefined || typeof value.result.state === 'string')
    && (value.result.errors === undefined || Array.isArray(value.result.errors));
}

export function authoredFixture(options: {
  signal?: AbortSignal;
  cleanupFailure?: boolean;
  evidenceFailure?: boolean;
} = {}) {
  let factories = 0;
  const entries = new Map<string, { task: HostTask; signal: AbortSignal; receipt: Receipt; state: { count: number; closed: boolean; url: string } }>();
  const fixture = createUiFixture({
    ...(options.signal ? { signal: options.signal } : {}),
    sessionTimeoutMs: 5000,
    stepTimeoutMs: 1000,
    cleanupTimeoutMs: 1000,
    createDriver({ task, signal }) {
      if (!isHostTask(task)) throw new Error('AUTHORED_RUNNER_TASK_INVALID');
      const host = task;
      const state = { count: 0, closed: false, url: 'https://authored.invalid/counter' };
      const receipt: Receipt = {
        boundary: 'authored-driver-real-vitest', instanceId: ++factories,
        factoryCalls: 1, closeCalls: 0, evidenceCalls: 0, bodyEntered: false,
        taskMatched: false, childSignalForwarded: signal instanceof AbortSignal,
        hostSignalAborted: false, childAbortedAtEvidence: false,
        bodyStateAtEvidence: null, bodyErrorsAtEvidence: null, lifecycle: null,
        finalCount: null, stepCodes: [], events: ['setup'],
      };
      host.meta.traverse = receipt;
      entries.set(host.id, { task: host, signal, receipt, state });
      const live = () => {
        if (state.closed || signal.aborted) throw new Error('AUTHORED_DRIVER_INACTIVE');
      };
      const button = (target: Action['target']) => target.by === 'role' && target.role === 'button' && target.name === 'Increment';
      const counter = (target: Assertion['target']) => target.by === 'testId' && target.value === 'counter';
      const driver: Driver = {
        async open(path) { live(); receipt.events.push('open'); state.url = new URL(path, state.url).href; },
        async observe() { live(); return { url: state.url, content: `Counter ${state.count}` }; },
        async perform(action) {
          live();
          if (action.kind !== 'click' || !button(action.target)) throw new Error('AUTHORED_ACTION_UNSUPPORTED');
          receipt.events.push('perform'); state.count += 1;
        },
        async check(assertion) {
          live(); receipt.events.push('check');
          if (assertion.kind === 'count') return (button(assertion.target) || counter(assertion.target) ? 1 : 0) === assertion.expected;
          return counter(assertion.target) && (assertion.kind === 'visible' || assertion.kind === 'text' && assertion.expected === String(state.count));
        },
        async close() {
          receipt.closeCalls += 1; receipt.events.push('close'); state.closed = true;
          if (options.cleanupFailure) throw new Error('PRIVATE_TRAVERSE_CLEANUP_DETAIL');
        },
      };
      return driver;
    },
    onEvidence(evidence, metadata) {
      const entry = metadata.taskId === null ? undefined : entries.get(metadata.taskId);
      if (!entry) throw new Error('AUTHORED_RECEIPT_MISSING');
      const { task, signal, receipt, state } = entry;
      receipt.evidenceCalls += 1; receipt.events.push('evidence');
      receipt.bodyStateAtEvidence = task.result?.state ?? null;
      receipt.bodyErrorsAtEvidence = task.result?.errors?.length ?? 0;
      receipt.childAbortedAtEvidence = signal.aborted;
      receipt.lifecycle = evidence.lifecycle;
      receipt.finalCount = state.count;
      receipt.stepCodes = evidence.steps.flatMap(step => step.code === null ? [] : [step.code]);
      if (options.evidenceFailure) throw new Error('PRIVATE_TRAVERSE_EVIDENCE_DETAIL');
    },
  });
  return {
    fixture,
    get factoryCalls() { return factories; },
    markBody(task: HostTask) {
      const entry = entries.get(task.id);
      if (!entry) throw new Error('AUTHORED_FIXTURE_NOT_INITIALIZED');
      entry.receipt.bodyEntered = true; entry.receipt.taskMatched = entry.task === task;
      entry.receipt.events.push('body');
    },
    signalFor(taskId: string) { return entries.get(taskId)?.signal; },
    markHostAbort(taskId: string) {
      const entry = entries.get(taskId);
      if (entry) entry.receipt.hostSignalAborted = true;
    },
  };
}
