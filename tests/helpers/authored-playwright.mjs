import assert from 'node:assert/strict';

// A Playwright-shaped authored app, not a browser implementation or browser proof.
export function authoredBrowser() {
  const contexts = [], hooks = {};
  let browserCloses = 0;
  const browser = {
    async newContext(options) {
      const state = { count: 0, name: '', status: 'Ready', url: 'about:blank', closed: false };
      const calls = { newContext: [options], newPage: [], goto: [], selectors: [], native: [], aria: [], close: [] };
      const events = new Map(), mainFrame = {};
      const record = { state, calls, multiplicity: new Map(), hooks: {}, snapshot: undefined, redirect: null };
      record.navigate = url => { state.url = url; events.get('framenavigated')?.(mainFrame); };
      const active = () => { if (state.closed) throw new Error('PRIVATE_CONTEXT_CLOSED'); };
      function locator(by, value, role) {
        const key = by === 'role' ? `${by}:${role}:${value}` : `${by}:${value}`;
        const known = key === 'role:button:Increment' || key === 'label:Name' || key === 'testId:counter' || key === 'text:Ready';
        const count = () => record.multiplicity.get(key) ?? Number(known);
        return {
          async count() { active(); return count(); },
          async waitFor(options) {
            calls.native.push({ method: 'waitFor', key, options }); active();
            if (count() === 0) throw Object.assign(new Error('PRIVATE_NATIVE_TIMEOUT'), { name: 'TimeoutError' });
          },
          async click(options) {
            calls.native.push({ method: 'click', key, options }); active();
            if (record.hooks.action) await record.hooks.action('click');
            active(); assert.equal(count(), 1); assert.equal(key, 'role:button:Increment'); state.count += 1;
          },
          async fill(value, options) {
            calls.native.push({ method: 'fill', key, value, options }); active();
            if (record.hooks.action) await record.hooks.action('fill');
            active(); assert.equal(count(), 1); assert.equal(key, 'label:Name'); state.name = value;
          },
          async press(value, options) {
            calls.native.push({ method: 'press', key, value, options }); active();
            if (record.hooks.action) await record.hooks.action('press');
            active(); assert.equal(count(), 1); assert.equal(key, 'label:Name'); assert.equal(value, 'Enter'); state.status = `Saved ${state.name}`;
          },
          async isVisible() { active(); return count() === 1; },
          async innerText() { throw new Error('INNER_TEXT_WOULD_LOSE_EXACT_DOM_WHITESPACE'); },
          async textContent(options) {
            calls.native.push({ method: 'textContent', key, options }); active();
            return record.textContentValue !== undefined ? record.textContentValue : key === 'testId:counter' ? String(state.count) : state.status;
          },
          async inputValue(options) { calls.native.push({ method: 'inputValue', key, options }); active(); return state.name; },
        };
      }
      const page = {
        url() { return state.url; },
        async goto(url, options) {
          calls.goto.push({ url, options }); active();
          if (record.hooks.goto) await record.hooks.goto(url, options);
          active(); record.navigate(record.redirect ?? url);
        },
        locator(selector) {
          assert.equal(selector, 'body', 'only the documented body ARIA snapshot is collected');
          return { async ariaSnapshot(options) {
            calls.aria.push(options); active();
            if (record.hooks.aria) await record.hooks.aria();
            return record.snapshot ?? `Counter ${state.count}\nName ${state.name}\n${state.status}\nPRIVATE_ARIA_OBSERVATION`;
          } };
        },
        getByRole(role, options) { assert.equal(options.exact, true); calls.selectors.push({ by: 'role', role, ...options }); return locator('role', options.name, role); },
        getByLabel(value, options) { assert.deepEqual(options, { exact: true }); calls.selectors.push({ by: 'label', value, ...options }); return locator('label', value); },
        getByText(value, options) { assert.deepEqual(options, { exact: true }); calls.selectors.push({ by: 'text', value, ...options }); return locator('text', value); },
        getByTestId(value) { calls.selectors.push({ by: 'testId', value }); return locator('testId', value); },
        on(event, callback) { events.set(event, callback); },
        mainFrame() { return mainFrame; },
      };
      const context = {
        async newPage() { calls.newPage.push(true); if (record.hooks.newPage) await record.hooks.newPage(); active(); return page; },
        async close() { calls.close.push(true); state.closed = true; if (record.hooks.close) await record.hooks.close(); },
      };
      Object.assign(record, { context, page }); contexts.push(record);
      if (hooks.newContext) await hooks.newContext(record);
      return context;
    },
    async close() { browserCloses += 1; throw new Error('CONSUMER_BROWSER_MUST_NOT_CLOSE'); },
  };
  return { browser, contexts, hooks, get browserCloses() { return browserCloses; } };
}
