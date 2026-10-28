import {
  MAX_OBSERVATION_BYTES,
  MAX_OBSERVATION_URL_LENGTH,
  TraverseError,
  record,
  safeError as safeTraverseError,
  validateAction,
  validateAssertion,
  validateObservation,
} from './protocol.js';

const MAX_TIMEOUT_MS = 300_000;

function timeout(value, fallback, maximum = MAX_TIMEOUT_MS) {
  const result = value === undefined ? fallback : value;
  if (!Number.isFinite(result) || result < 1 || result > maximum) throw new TraverseError('invalid_options');
  return result;
}

function signalLike(value) {
  return value === undefined || (value !== null && typeof value.aborted === 'boolean'
    && typeof value.addEventListener === 'function' && typeof value.removeEventListener === 'function');
}

function safeError(error, fallback) {
  try {
    return error?.name === 'TimeoutError' ? new TraverseError('step_timeout') : safeTraverseError(error, fallback);
  } catch {
    return new TraverseError(fallback);
  }
}

function httpUrl(value, base) {
  if (typeof value !== 'string' || !value || value.length > MAX_OBSERVATION_URL_LENGTH
    || /[\u0000-\u0020\u007f]/u.test(value)) throw new TraverseError('origin_denied');
  let url;
  try { url = new URL(value, base); } catch { throw new TraverseError('origin_denied'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TraverseError('origin_denied');
  return url;
}

/** Adopt a supplied Playwright Browser; only the fresh context belongs to Traverse. */
export async function createPlaywrightDriver(browser, options = {}) {
  record(options, ['baseURL', 'signal', 'setupTimeoutMs', 'defaultTimeoutMs', 'cleanupTimeoutMs', 'maxObservationBytes'], ['baseURL']);
  if (!browser || typeof browser.newContext !== 'function') throw new TraverseError('invalid_driver');
  if (!signalLike(options.signal)) throw new TraverseError('invalid_options');
  const callerSignal = options.signal;
  const base = httpUrl(options.baseURL);
  const setupTimeoutMs = timeout(options.setupTimeoutMs, 10_000);
  const defaultTimeoutMs = timeout(options.defaultTimeoutMs, 5_000);
  const cleanupTimeoutMs = timeout(options.cleanupTimeoutMs, 3_000, 30_000);
  const maxObservationBytes = options.maxObservationBytes ?? MAX_OBSERVATION_BYTES;
  if (!Number.isSafeInteger(maxObservationBytes) || maxObservationBytes < 1
    || maxObservationBytes > MAX_OBSERVATION_BYTES) throw new TraverseError('invalid_options');

  const lifetime = new AbortController();
  let context;
  let page;
  let stopped;
  let closePromise;
  let navigationRevision = 0;

  function closeOwnedContext() {
    if (!context) return Promise.resolve();
    if (closePromise) return closePromise;
    closePromise = new Promise((resolve, reject) => {
      const deadline = performance.now() + cleanupTimeoutMs;
      const timer = setTimeout(() => reject(new TraverseError('cleanup_timeout')), cleanupTimeoutMs);
      Promise.resolve().then(() => context.close()).then(
        () => performance.now() >= deadline ? reject(new TraverseError('cleanup_timeout')) : resolve(),
        () => reject(new TraverseError(performance.now() >= deadline ? 'cleanup_timeout' : 'cleanup_failed')),
      )
        .finally(() => clearTimeout(timer));
    });
    return closePromise;
  }

  function stop(code) {
    if (!stopped) {
      stopped = code;
      callerSignal?.removeEventListener('abort', cancelLifetime);
      lifetime.abort();
    }
    // A cancelled newContext may still resolve later; setup closes it on arrival.
    void closeOwnedContext().catch(() => {});
  }

  function cancelLifetime() { stop('session_cancelled'); }
  callerSignal?.addEventListener('abort', cancelLifetime, { once: true });
  if (callerSignal?.aborted) stop('session_cancelled');

  function currentUrl() {
    try {
      const url = httpUrl(page.url());
      if (url.origin !== base.origin) throw new TraverseError('origin_denied');
      return url.href;
    } catch {
      stop('origin_denied');
      throw new TraverseError('origin_denied');
    }
  }

  async function bounded(work, callOptions = {}, timeoutCode = 'step_timeout') {
    record(callOptions, ['signal', 'timeoutMs'], []);
    if (!signalLike(callOptions.signal)) throw new TraverseError('invalid_options');
    const timeoutMs = timeout(callOptions.timeoutMs, defaultTimeoutMs);
    if (stopped) throw new TraverseError(stopped);
    if (callOptions.signal?.aborted) {
      stop('session_cancelled');
      throw new TraverseError('session_cancelled');
    }
    let active = true;
    const deadline = performance.now() + timeoutMs;
    let rejectStop;
    const interrupted = new Promise((_, reject) => { rejectStop = reject; });
    const onLifetimeStop = () => rejectStop(new TraverseError(stopped ?? 'session_cancelled'));
    const onCallStop = () => stop('session_cancelled');
    lifetime.signal.addEventListener('abort', onLifetimeStop, { once: true });
    callOptions.signal?.addEventListener('abort', onCallStop, { once: true });
    const timer = setTimeout(() => stop(timeoutCode), timeoutMs);
    const live = () => {
      if (!active || stopped) throw new TraverseError(stopped ?? 'session_closed');
      if (callOptions.signal?.aborted) {
        stop('session_cancelled');
        throw new TraverseError('session_cancelled');
      }
      if (performance.now() >= deadline) {
        stop(timeoutCode);
        throw new TraverseError(timeoutCode);
      }
    };
    const remaining = () => {
      live();
      const milliseconds = deadline - performance.now();
      if (milliseconds <= 0) {
        stop(timeoutCode);
        throw new TraverseError(timeoutCode);
      }
      return Math.ceil(milliseconds);
    };
    try {
      const result = await Promise.race([Promise.resolve().then(() => { live(); return work({ live, remaining, deadline }); }), interrupted]);
      live();
      return result;
    } catch (error) {
      const safe = stopped ? new TraverseError(stopped) : safeError(error, 'driver_failed');
      if (safe.code === 'step_timeout') stop(safe.code);
      throw safe;
    } finally {
      active = false;
      clearTimeout(timer);
      lifetime.signal.removeEventListener('abort', onLifetimeStop);
      callOptions.signal?.removeEventListener('abort', onCallStop);
    }
  }

  try {
    await bounded(async ({ live }) => {
      context = await browser.newContext({ baseURL: base.href });
      if (stopped) { void closeOwnedContext().catch(() => {}); live(); }
      if (!context || typeof context.newPage !== 'function' || typeof context.close !== 'function') throw new TraverseError('invalid_driver');
      live();
      page = await context.newPage();
      live();
      if (!page || ['goto', 'url', 'locator', 'getByRole', 'getByLabel', 'getByText', 'getByTestId', 'on', 'mainFrame']
        .some(method => typeof page[method] !== 'function')) throw new TraverseError('invalid_driver');
      page.on('framenavigated', frame => {
        try {
          if (frame !== page.mainFrame()) return;
          navigationRevision += 1;
          // Detection happens after navigation commits; this is not a network
          // firewall. Foreign UI never becomes an executor observation.
          currentUrl();
        } catch { stop(stopped ?? 'driver_failed'); }
      });
    }, { timeoutMs: setupTimeoutMs }, 'driver_setup_failed');
  } catch (error) {
    const failure = safeError(error, 'driver_setup_failed');
    stop(failure.code);
    try { await closeOwnedContext(); } catch (cleanup) {
      throw new AggregateError([failure, cleanup], 'driver_setup_failed');
    }
    throw failure;
  }

  function locate(target) {
    switch (target.by) {
      case 'role': return page.getByRole(target.role, { name: target.name, exact: true });
      case 'label': return page.getByLabel(target.value, { exact: true });
      case 'text': return page.getByText(target.value, { exact: true });
      case 'testId': return page.getByTestId(target.value);
      default: throw new TraverseError('invalid_target');
    }
  }

  async function unique(locator, budget) {
    let count = await locator.count();
    budget.live();
    if (count === 0) {
      try { await locator.waitFor({ state: 'attached', timeout: budget.remaining() }); } catch (error) {
        budget.live();
        count = await locator.count();
        budget.live();
        if (count > 1) throw new TraverseError('target_ambiguous');
        throw error;
      }
      budget.live();
      count = await locator.count();
      budget.live();
    }
    if (count > 1) throw new TraverseError('target_ambiguous');
    if (count !== 1) throw new TraverseError('target_not_found');
    return locator;
  }

  return Object.freeze({
    async open(path, callOptions) {
      const url = httpUrl(path, base);
      if (url.origin !== base.origin) throw new TraverseError('origin_denied');
      await bounded(async budget => {
        await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: budget.remaining() });
        budget.live();
        currentUrl();
      }, callOptions);
    },
    async observe(callOptions) {
      return bounded(async budget => {
        const initialUrl = currentUrl();
        const revision = navigationRevision;
        const content = await page.locator('body').ariaSnapshot({ timeout: budget.remaining() });
        budget.live();
        const url = currentUrl();
        if (revision !== navigationRevision || url !== initialUrl) throw new TraverseError('invalid_observation');
        if (typeof content !== 'string') throw new TraverseError('invalid_observation');
        if (content.length > maxObservationBytes || new TextEncoder().encode(content).byteLength > maxObservationBytes) {
          throw new TraverseError('observation_too_large');
        }
        return validateObservation({ url, content });
      }, callOptions);
    },
    async perform(value, callOptions) {
      const action = validateAction(value);
      await bounded(async budget => {
        currentUrl();
        const locator = await unique(locate(action.target), budget);
        budget.live();
        if (action.kind === 'click') await locator.click({ timeout: budget.remaining() });
        else if (action.kind === 'fill') await locator.fill(action.value, { timeout: budget.remaining() });
        else await locator.press(action.value, { timeout: budget.remaining() });
        budget.live();
        currentUrl();
      }, callOptions);
    },
    async check(value, callOptions) {
      const assertion = validateAssertion(value);
      return bounded(async budget => {
        currentUrl();
        const locator = locate(assertion.target);
        while (true) {
          const count = await locator.count();
          budget.live();
          let matches;
          if (assertion.kind === 'count') matches = count === assertion.expected;
          else {
            if (count > 1) throw new TraverseError('target_ambiguous');
            matches = false;
            if (count === 1) {
              if (assertion.kind === 'visible') matches = await locator.isVisible();
              else if (assertion.kind === 'text') matches = await locator.textContent({ timeout: budget.remaining() }) === assertion.expected;
              else matches = await locator.inputValue({ timeout: budget.remaining() }) === assertion.expected;
            }
          }
          budget.live();
          currentUrl();
          if (matches) return true;
          const wait = budget.deadline - performance.now() - 5;
          if (wait <= 0) return false;
          await new Promise(resolve => setTimeout(resolve, Math.min(25, wait)));
          budget.live();
        }
      }, callOptions);
    },
    async close() {
      stop('session_closed');
      await closeOwnedContext();
    },
  });
}
