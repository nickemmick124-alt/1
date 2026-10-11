import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/practice.js', import.meta.url), 'utf8').replace(/\nloadRound\(\);\s*$/, '\n');
const bank = {
  title: 'Beginner 1', setId: 'beginner-first-fixture', questionCount: 8, durationMs: 40_000,
  questions: Array.from({ length: 8 }, (_, index) => ({ index, topic: `Concept ${index + 1}`, prompt: `Question ${index + 1}?`, options: ['One', 'Two', 'Three', 'Four'], basis: 'Practice figures', reference: { label: 'Where to learn this', url: '/prepare#margin' } })),
};
function result(selected = 2, points = 750) {
  return { selected, correct: 2, points: selected === 2 ? points : 0, explanation: 'Product cost leaves a margin.', learning: { term: 'Margin', definition: 'A remaining share.', lookFor: 'Find the margin guide.', prepare: 'Explain a $100 sale.', links: [{ label: 'Margin guide', url: '/prepare#margin' }] }, sources: [], practiceScoreOnly: true };
}
function browser(storage = new Map()) {
  let now = 1_000_000, pendingFetch;
  const requests = [], elements = new Map(), listeners = new Map();
  const element = () => ({ innerHTML: '', textContent: '', hidden: false, style: {}, focus() {} });
  const main = { ...element(), addEventListener(type, listener) { listeners.set(type, listener); } };
  const context = vm.createContext({
    document: { hidden: false, addEventListener() {}, getElementById(id) { if (id === 'practice-main') return main; if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } },
    window: { addEventListener() {} },
    location: { origin: 'https://finance.example.test' }, URL, AbortController,
    navigator: { clipboard: { async writeText() {} } },
    Date: class extends Date { static now() { return now; } },
    localStorage: { setItem(key, value) { storage.set(key, value); }, getItem(key) { return storage.get(key) || null; } },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    async fetch(path, options) {
      if (path === '/api/practice/round') return { ok: true, json: async () => structuredClone(bank) };
      assert.equal(path, '/api/practice/answer');
      requests.push(JSON.parse(options.body));
      return await new Promise(resolve => { pendingFetch = resolve; });
    },
  });
  vm.runInContext(source + '\nglobalThis.app = {state,loadRound,startRound,nextQuestion,submit,tick,score,correctCount,safeUrl,sourceLinks,render};', context);
  const app = context.app;
  return {
    app, storage, requests, html: () => main.innerHTML,
    mount: () => app.loadRound(), start: () => app.startRound(), next: () => app.nextQuestion(),
    submit: selected => app.submit(selected), advance(ms) { now += ms; }, tick: () => app.tick(),
    finish(selected = 2, points = 750, ok = true) { assert(pendingFetch); pendingFetch({ ok, json: async () => ok ? result(selected, points) : { error: 'Connection interrupted. Try again.' } }); pendingFetch = null; },
    options() { return [...main.innerHTML.matchAll(/<button\b([^>]*data-action="answer"[^>]*)>/g)].map(([, attributes]) => ({ chosen: /\bchosen\b/.test(attributes), disabled: /\sdisabled/.test(attributes), selected: /aria-pressed="true"/.test(attributes) })); },
    text(id) { return elements.get(id)?.textContent; },
  };
}

test('first answer stays final, explanation has a source link, and the next question clears its selection', async () => {
  const game = browser(); await game.mount();
  assert.match(game.html(), /NO ACCOUNT NEEDED/);
  assert.match(game.html(), /href="\/prepare" target="_blank" rel="noopener noreferrer"/);
  game.start(); game.advance(5_000);
  const checking = game.submit(2);
  assert.deepEqual(game.options().map(option => option.chosen), [false, false, true, false]);
  assert(game.options().every(option => option.disabled));
  await game.submit(1);
  assert.equal(game.requests.length, 1);
  game.finish(); await checking;
  assert.equal(game.app.score(), 750);
  assert.match(game.html(), /WHERE TO LEARN THIS/);
  assert.match(game.html(), /href="\/prepare#margin" target="_blank" rel="noopener noreferrer"/);
  game.next();
  assert(game.options().every(option => !option.chosen && !option.selected && !option.disabled));
  assert.equal(game.text('practice-seconds'), '40');
});

test('checking failures keep the original answer and elapsed time on retry without adding score twice', async () => {
  const game = browser(); await game.mount(); game.start(); game.advance(8_000);
  const first = game.submit(2); game.finish(2, 750, false); await first;
  assert.match(game.html(), /Retry checking answer/);
  assert(game.options().every(option => option.disabled));
  game.advance(50_000);
  const retry = game.submit(0);
  assert.deepEqual(game.requests, [
    { setId: bank.setId, questionIndex: 0, selected: 2, elapsedMs: 8_000 },
    { setId: bank.setId, questionIndex: 0, selected: 2, elapsedMs: 8_000 },
  ]);
  game.finish(); await retry;
  await game.submit(2);
  assert.equal(game.requests.length, 2);
  assert.equal(game.app.score(), 750);
});

test('refresh resumes the original deadline and an expired question earns no retroactive points', async () => {
  const shared = new Map();
  const original = browser(shared); await original.mount(); original.start();
  const restored = browser(shared); restored.advance(25_000); await restored.mount();
  assert.equal(restored.text('practice-seconds'), '15');
  restored.advance(15_000); restored.tick();
  assert.deepEqual(restored.requests, [{ setId: bank.setId, questionIndex: 0, selected: null, elapsedMs: 40_000 }]);
  restored.finish(null, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(restored.html(), /Time’s up/);
  assert.equal(restored.app.score(), 0);
});

test('a pending answer restored after refresh retries the same original selection and elapsed time', async () => {
  const shared = new Map();
  const original = browser(shared); await original.mount(); original.start(); original.advance(2_000);
  const originalRequest = original.submit(2);
  const restored = browser(shared); restored.advance(30_000); await restored.mount();
  assert.deepEqual(restored.requests, [{ setId: bank.setId, questionIndex: 0, selected: 2, elapsedMs: 2_000 }]);
  restored.finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(restored.app.score(), 750);
  original.finish(); await originalRequest;
});

test('a late answer response cannot contaminate a restarted round', async () => {
  const game = browser(); await game.mount(); game.start();
  const stale = game.submit(2); game.start(); game.finish(); await stale;
  assert.equal(game.app.score(), 0);
  assert.equal(game.app.state.stage, 'question');
  assert(game.options().every(option => !option.chosen && !option.disabled));
});

test('eight completed questions produce a local final score and replay resets the run', async () => {
  const game = browser(); await game.mount(); game.start();
  for (let index = 0; index < 8; index++) {
    const request = game.submit(2); game.finish(2, 1000); await request; game.next();
  }
  assert.equal(game.app.state.stage, 'final');
  assert.equal(game.app.correctCount(), 8);
  assert.equal(game.app.score(), 8000);
  assert.match(game.html(), /Copy my score/);
  assert.match(game.html(), /separate from live games/);
  game.start();
  assert.equal(game.app.score(), 0);
  assert.equal(game.app.state.index, 0);
  assert(game.options().every(option => !option.chosen));
});

test('source rendering accepts vetted HTTPS and site links, escapes labels, and rejects unsafe protocols', async () => {
  const game = browser(); await game.mount();
  assert.equal(game.app.safeUrl('javascript:alert(1)'), null);
  assert.equal(game.app.safeUrl('//unsafe.example'), null);
  assert.equal(game.app.safeUrl('/\\unsafe.example'), null);
  assert.equal(game.app.safeUrl('data:text/html,hello'), null);
  const html = game.app.sourceLinks([{ label: '<Read>', url: 'https://example.test/report' }, { label: 'bad', url: 'javascript:alert(1)' }]);
  assert.match(html, /&lt;Read&gt;/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /javascript:|>bad</);
});
