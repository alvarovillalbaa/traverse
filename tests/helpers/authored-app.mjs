// An independent stateful app boundary. It never launches a browser or a model.
export const increment = Object.freeze({ by: 'role', role: 'button', name: 'Increment' });
export const counter = Object.freeze({ by: 'testId', value: 'counter' });
export const nameInput = Object.freeze({ by: 'label', value: 'Name' });

export function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

export const turn = () => new Promise(resolve => setImmediate(resolve));

export function authoredApp({ count = 0, secret = 'PRIVATE_OBSERVATION_SENTINEL' } = {}) {
  const state = { count, name: '', status: 'Ready', url: 'https://fixture.invalid/counter', closed: false };
  const calls = { open: [], observe: [], perform: [], check: [], close: [] };
  const hooks = {};
  const multiplicity = new Map();
  function key(target) {
    if (target.by === 'role' && target.role === 'button' && target.name === 'Increment') return 'increment';
    if (target.by === 'testId' && target.value === 'counter') return 'counter';
    if (target.by === 'label' && target.value === 'Name') return 'name';
    if (target.by === 'text' && target.value === 'Ready') return 'status';
    return null;
  }
  function amount(target) { const identity = key(target); return identity === null ? 0 : multiplicity.get(identity) ?? 1; }
  function active(options = {}) {
    if (state.closed || options.signal?.aborted) throw new Error('PRIVATE_DRIVER_CLOSED_OR_CANCELLED');
  }
  const driver = {
    async open(path, options) {
      calls.open.push({ path, options }); active(options);
      if (hooks.open) await hooks.open(path, options);
      active(options); state.url = new URL(path, state.url).href;
    },
    async observe(options) {
      calls.observe.push(options); active(options);
      if (hooks.observe) await hooks.observe(options);
      active(options);
      return { url: state.url, content: `Counter: ${state.count}\nName: ${state.name}\n${state.status}\n${secret}` };
    },
    async perform(action, options) {
      calls.perform.push({ action: structuredClone(action), options }); active(options);
      if (hooks.perform) await hooks.perform(action, options);
      active(options);
      if (amount(action.target) !== 1) throw new Error('PRIVATE_TARGET_NOT_UNIQUE');
      const identity = key(action.target);
      if (action.kind === 'click' && identity === 'increment') state.count += 1;
      else if (action.kind === 'fill' && identity === 'name') state.name = action.value;
      else if (action.kind === 'press' && identity === 'name' && action.value === 'Enter') state.status = `Saved ${state.name}`;
      else throw new Error('PRIVATE_UNSUPPORTED_APP_ACTION');
    },
    async check(check, options) {
      calls.check.push({ check: structuredClone(check), options }); active(options);
      if (hooks.check) return hooks.check(check, options);
      const count = amount(check.target);
      if (check.kind === 'count') return count === check.expected;
      if (count !== 1) return false;
      const identity = key(check.target);
      if (check.kind === 'visible') return true;
      if (check.kind === 'text') return (identity === 'counter' ? String(state.count) : identity === 'status' ? state.status : '') === check.expected;
      if (check.kind === 'value') return identity === 'name' && state.name === check.expected;
      throw new Error('PRIVATE_UNSUPPORTED_APP_CHECK');
    },
    async close() {
      calls.close.push(true); state.closed = true;
      if (hooks.close) await hooks.close();
    },
  };
  return { driver, state, calls, hooks, multiplicity };
}

export function recordingStore(memory) {
  const reads = [], writes = [], deletions = [];
  return { reads, writes, deletions,
    store: {
      get(key) { reads.push(key); return memory.get(key); },
      set(key, record) { writes.push({ key, record: structuredClone(record) }); return memory.set(key, record); },
      delete(key) { deletions.push(key); return memory.delete(key); },
    },
  };
}
