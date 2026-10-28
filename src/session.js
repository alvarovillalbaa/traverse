import {
  TraverseError, safeError, record, text, validateTarget, validateAction,
  validateAssertion, validateObservation,
} from "./protocol.js";
import { replayIdentity, replayFingerprint, validateReplayRecord } from "./replay.js";

function limit(value, fallback, maximum) {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new TraverseError("invalid_options");
  return result;
}

function cancellation(signal) {
  return safeError(signal.reason, "session_cancelled");
}

function raceSignal(promise, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => { dispose(); reject(cancellation(signal)); };
    const dispose = () => signal.removeEventListener("abort", aborted);
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve(promise).then(
      (value) => { dispose(); signal.aborted ? reject(cancellation(signal)) : resolve(value); },
      (error) => { dispose(); reject(error); },
    );
    if (signal.aborted) aborted();
  });
}

function cleanupDeadline(driver, milliseconds) {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + milliseconds;
    const timer = setTimeout(() => reject(new TraverseError("cleanup_timeout")), milliseconds);
    Promise.resolve().then(() => driver.close()).then(
      () => { clearTimeout(timer); performance.now() >= deadline ? reject(new TraverseError("cleanup_timeout")) : resolve(); },
      (error) => { clearTimeout(timer); reject(new TraverseError(performance.now() >= deadline || safeError(error).code === "cleanup_timeout" ? "cleanup_timeout" : "cleanup_failed")); },
    );
  });
}

function driverFrom(value) {
  if (!value || typeof value !== "object") throw new TraverseError("invalid_driver");
  const methods = {};
  for (const key of ["open", "observe", "perform", "check", "close"]) {
    const method = value[key];
    if (typeof method !== "function") throw new TraverseError("invalid_driver");
    methods[key] = method.bind(value);
  }
  return Object.freeze(methods);
}

export async function openSession(options) {
  record(options, ["createDriver", "signal", "sessionTimeoutMs", "stepTimeoutMs", "cleanupTimeoutMs", "maxActions", "maxAgentSteps", "executor", "replay"], ["createDriver"]);
  if (typeof options.createDriver !== "function" || (options.executor !== undefined && typeof options.executor !== "function")) throw new TraverseError("invalid_options");
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw new TraverseError("invalid_options");
  const configuration = Object.freeze({
    sessionTimeoutMs: limit(options.sessionTimeoutMs, 30_000, 300_000),
    stepTimeoutMs: limit(options.stepTimeoutMs, 5_000, 30_000),
    cleanupTimeoutMs: limit(options.cleanupTimeoutMs, 3_000, 30_000),
    maxActions: limit(options.maxActions, 20, 200),
    maxAgentSteps: limit(options.maxAgentSteps, 10, 100),
  });
  const executor = options.executor;
  const createDriver = options.createDriver;
  const callerSignal = options.signal;
  let replay = null;
  if (options.replay !== undefined) {
    record(options.replay, ["scope", "store"], ["scope", "store"]);
    const scope = text(options.replay.scope, 256, "invalid_options");
    const store = options.replay.store;
    if (!store || !["get", "set", "delete"].every((key) => typeof store[key] === "function")) throw new TraverseError("invalid_options");
    replay = Object.freeze({ scope, get: store.get.bind(store), set: store.set.bind(store), delete: store.delete.bind(store) });
  }
  if (callerSignal?.aborted) throw new TraverseError("session_cancelled");

  const lifetime = new AbortController();
  const sessionDeadline = performance.now() + configuration.sessionTimeoutMs;
  let lifecycle = "open";
  let terminal = null;
  let driver;
  let active = null;
  let pending = null;
  let cleanupPromise;
  let closePromise;
  let sessionTimer;
  let actions = 0;
  let agentSteps = 0;
  let sequence = 0;
  const steps = [];
  const locators = new WeakMap();

  const evidence = () => Object.freeze({
    schemaVersion: 1, lifecycle, actions, agentSteps,
    steps: Object.freeze([...steps].sort((left, right) => left.sequence - right.sequence).map((step) => Object.freeze({ ...step }))),
  });
  const finish = (id, type, started, error) => {
    const code = error ? safeError(error).code : null;
    const cancelled = ["session_closed", "session_cancelled", "session_timeout", "step_timeout"].includes(code);
    steps.push(Object.freeze({ sequence: id, type, status: error ? (cancelled ? "cancelled" : "failed") : "passed", durationMs: Math.max(0, Math.round(performance.now() - started)), code }));
  };
  const detachLifetime = () => {
    clearTimeout(sessionTimer);
    callerSignal?.removeEventListener("abort", callerAborted);
  };
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    const started = performance.now();
    const id = ++sequence;
    cleanupPromise = cleanupDeadline(driver, configuration.cleanupTimeoutMs).then(
      () => { if (lifecycle === "closing") lifecycle = "closed"; finish(id, "close", started); },
      (error) => { lifecycle = "failed"; finish(id, "close", started, error); throw error; },
    );
    cleanupPromise.catch(() => {});
    return cleanupPromise;
  };
  const stop = (code) => {
    if (terminal) return;
    terminal = code;
    pending = null;
    lifecycle = code === "session_closed" ? "closing"
      : code === "session_cancelled" ? "cancelled"
        : ["session_timeout", "step_timeout"].includes(code) ? "timed_out" : "failed";
    detachLifetime();
    lifetime.abort(new TraverseError(code));
    if (driver) cleanup();
  };
  function callerAborted() { stop("session_cancelled"); }
  callerSignal?.addEventListener("abort", callerAborted, { once: true });
  sessionTimer = setTimeout(() => stop("session_timeout"), configuration.sessionTimeoutMs);

  let obtained = false;
  let discarded = false;
  const discardDriver = (value) => {
    if (discarded) return;
    try {
      if (value && typeof value.close === "function") {
        discarded = true;
        cleanupDeadline(value, configuration.cleanupTimeoutMs).catch(() => {});
      }
    } catch { /* Late opaque setup values cannot publish a second outcome. */ }
  };
  const setupDeadline = performance.now() + configuration.stepTimeoutMs;
  const expireSetup = () => {
    if (performance.now() >= sessionDeadline) stop("session_timeout");
    else if (performance.now() >= setupDeadline) stop("step_timeout");
  };
  const setup = Promise.resolve().then(() => {
    expireSetup();
    if (lifetime.signal.aborted) throw cancellation(lifetime.signal);
    return createDriver({ signal: lifetime.signal });
  });
  setup.then((value) => {
    if (lifetime.signal.aborted && !obtained) discardDriver(value);
  }, () => {});
  const setupTimer = setTimeout(() => stop("step_timeout"), configuration.stepTimeoutMs);
  try {
    const raw = await raceSignal(setup, lifetime.signal);
    expireSetup();
    if (lifetime.signal.aborted) { discardDriver(raw); throw cancellation(lifetime.signal); }
    try { driver = driverFrom(raw); } catch (error) {
      discardDriver(raw);
      throw error;
    }
    obtained = true;
    expireSetup();
    if (lifetime.signal.aborted) { cleanup(); throw cancellation(lifetime.signal); }
  } catch (error) {
    expireSetup();
    stop(safeError(error, "driver_setup_failed").code);
    throw lifetime.signal.aborted ? cancellation(lifetime.signal) : safeError(error, "driver_setup_failed");
  } finally {
    clearTimeout(setupTimer);
  }

  const ensure = () => {
    if (performance.now() >= sessionDeadline) stop("session_timeout");
    if (terminal) throw new TraverseError(terminal);
  };
  const operation = (type, body) => {
    try {
      ensure();
      if (active) throw new TraverseError("operation_in_progress");
      if (sequence >= 999) { stop("step_limit"); throw new TraverseError("step_limit"); }
    } catch (error) { return Promise.reject(safeError(error)); }
    const token = {};
    const id = ++sequence;
    const started = performance.now();
    const deadline = started + configuration.stepTimeoutMs;
    const controller = new AbortController();
    const cancelled = () => controller.abort(cancellation(lifetime.signal));
    lifetime.signal.addEventListener("abort", cancelled, { once: true });
    const timer = setTimeout(() => stop("step_timeout"), configuration.stepTimeoutMs);
    const guard = () => {
      ensure();
      if (performance.now() >= deadline) { stop("step_timeout"); throw new TraverseError("step_timeout"); }
      if (active !== token || controller.signal.aborted) throw new TraverseError("step_inactive");
    };
    const context = {
      guard, signal: controller.signal,
      call: async (method, ...args) => {
        guard();
        let result;
        try { result = await raceSignal(driver[method](...args, { signal: controller.signal, timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())) }), controller.signal); }
        catch (error) { throw safeError(error, "driver_failed"); }
        guard();
        return result;
      },
    };
    active = token;
    const promise = raceSignal(Promise.resolve().then(() => { guard(); return body(context); }), controller.signal)
      .then(() => { guard(); finish(id, type, started); })
      .catch((error) => {
        let safe = safeError(error);
        try { guard(); } catch (expired) { safe = safeError(expired); }
        finish(id, type, started, safe); stop(safe.code); throw safe;
      })
      .finally(() => {
      clearTimeout(timer);
      lifetime.signal.removeEventListener("abort", cancelled);
      if (active === token) active = null;
    });
    promise.catch(() => {});
    return promise;
  };
  const observation = async (context) => validateObservation(await context.call("observe"));
  const perform = async (input, context) => {
    const action = validateAction(input);
    context.guard();
    if (actions >= configuration.maxActions) throw new TraverseError("action_limit");
    actions += 1;
    await context.call("perform", action);
    return action;
  };
  const driverCheck = async (assertion, context) => {
    const result = await context.call("check", assertion);
    if (typeof result !== "boolean") throw new TraverseError("driver_failed");
    return result;
  };
  const storeCall = async (method, context, ...args) => {
    context.guard();
    try {
      const result = await raceSignal(replay[method](...args), context.signal);
      context.guard();
      return result;
    } catch (error) { throw safeError(error, "replay_store_failed"); }
  };
  const replayAct = async (identity, context) => {
    const raw = await storeCall("get", context, identity.key);
    if (raw === undefined || raw === null) return false;
    const cached = validateReplayRecord(raw, identity.key);
    let began = false;
    try {
      for (const action of cached.actions) {
        if (!await driverCheck({ kind: "count", target: action.target, expected: 1 }, context)) {
          if (!began) { await storeCall("delete", context, identity.key); return false; }
          throw new TraverseError("replay_diverged");
        }
        began = true;
        await perform(action, context);
      }
      if (!await driverCheck(cached.check, context)) throw new TraverseError("replay_diverged");
      const end = replayFingerprint(await observation(context));
      if (end.urlHash !== cached.end.urlHash || end.contentHash !== cached.end.contentHash) throw new TraverseError("replay_diverged");
      return true;
    } catch (error) {
      if (context.signal.aborted) throw cancellation(context.signal);
      if (safeError(error).code === "action_limit") throw error;
      if (!began) throw error;
      await storeCall("delete", context, identity.key);
      throw new TraverseError("replay_diverged");
    }
  };
  const agentOperation = (mode, goal) => operation(mode === "act" ? "agent_act" : "agent_assert", async (context) => {
    text(goal, 2_000, "invalid_goal");
    if (mode === "act") pending = null;
    if (agentSteps >= configuration.maxAgentSteps) throw new TraverseError("agent_step_limit");
    agentSteps += 1;
    if (!executor && !(mode === "act" && replay)) throw new TraverseError("executor_required");
    const initial = await observation(context);
    const identity = replay && mode === "act" ? replayIdentity(replay.scope, goal, initial) : null;
    if (identity && await replayAct(identity, context)) return;
    if (!executor) throw new TraverseError("executor_required");
    let accepting = true;
    let actionPending = false;
    let actionFailure = null;
    let containsFill = false;
    const performed = [];
    const act = (input) => {
      const performAction = async () => {
        let ownsAction = false;
        try {
          context.guard();
          if (!accepting) throw new TraverseError("step_inactive");
          if (mode !== "act") throw new TraverseError("assertion_actions_forbidden");
          if (actionPending) throw new TraverseError("operation_in_progress");
          actionPending = true;
          ownsAction = true;
          const action = await perform(input, context);
          containsFill ||= action.kind === "fill";
          if (action.kind !== "fill") performed.push(action);
          return await observation(context);
        } catch (error) { actionFailure ??= safeError(error); throw safeError(error); }
        finally { if (ownsAction) actionPending = false; }
      };
      const result = performAction();
      result.catch(() => {});
      return result;
    };
    let result;
    try {
      try { result = await raceSignal(executor(Object.freeze({ mode, goal, observation: initial, signal: context.signal, act })), context.signal); }
      catch (error) { throw safeError(error, "executor_failed"); }
    } finally { accepting = false; }
    context.guard();
    if (actionPending) throw new TraverseError("incomplete_work");
    if (actionFailure) throw actionFailure;
    record(result, ["status"], ["status"], "invalid_executor_result");
    const statuses = mode === "act" ? ["done", "blocked"] : ["passed", "failed", "blocked"];
    if (!statuses.includes(result.status)) throw new TraverseError("invalid_executor_result");
    if (result.status === "blocked") throw new TraverseError("executor_blocked");
    if (result.status === "failed") throw new TraverseError("assertion_failed");
    if (identity && performed.length && !containsFill) pending = { ...identity, actions: Object.freeze(performed) };
  });
  const locator = (target) => {
    const frozen = validateTarget(target);
    const manual = (kind, value) => operation(kind, async (context) => {
      pending = null;
      await perform({ kind, target: frozen, ...(kind === "click" ? {} : { value }) }, context);
    });
    const result = Object.freeze({ click: () => manual("click"), fill: (value) => manual("fill", value), press: (value) => manual("press", value) });
    locators.set(result, frozen);
    return result;
  };
  const check = (selected) => {
    const target = locators.get(selected);
    if (!target) throw new TraverseError("invalid_target");
    const verify = (kind, expected) => operation("check", async (context) => {
      const assertion = validateAssertion({ kind, target, ...(kind === "visible" ? {} : { expected }) });
      if (!await driverCheck(assertion, context)) throw new TraverseError("assertion_failed");
      if (pending && kind !== "value") {
        const qualifying = pending;
        pending = null;
        const end = replayFingerprint(await observation(context));
        if (end.urlHash === qualifying.start.urlHash && end.contentHash === qualifying.start.contentHash) return;
        const value = validateReplayRecord({ schemaVersion: 1, ...qualifying, end, check: assertion, outcome: true });
        await storeCall("set", context, qualifying.key, value);
      }
    });
    return Object.freeze({ isVisible: () => verify("visible"), hasText: (expected) => verify("text", expected), hasValue: (expected) => verify("value", expected), count: (expected) => verify("count", expected) });
  };
  const close = () => {
    if (closePromise) return closePromise;
    const incomplete = active !== null;
    if (performance.now() >= sessionDeadline) stop("session_timeout");
    stop(incomplete ? "incomplete_work" : "session_closed");
    const failure = terminal === "session_closed" ? null : terminal;
    closePromise = cleanup().then(() => {
      if (failure) throw new TraverseError(failure);
    });
    closePromise.catch(() => {});
    return closePromise;
  };
  return Object.freeze({
    app: Object.freeze({ open: (path) => operation("open", async (context) => { text(path, 2_048, "invalid_options"); pending = null; await context.call("open", path); }) }),
    screen: Object.freeze({
      getByRole: (role, options) => { record(options, ["name"], ["name"], "invalid_target"); return locator({ by: "role", role, name: options.name }); },
      getByLabel: (value) => locator({ by: "label", value }),
      getByText: (value) => locator({ by: "text", value }),
      getByTestId: (value) => locator({ by: "testId", value }),
    }),
    check,
    agent: Object.freeze({ act: (goal) => agentOperation("act", goal), assert: (goal) => agentOperation("assert", goal) }),
    evidence, close,
  });
}
