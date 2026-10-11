import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/live-app.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/\nstart\(\);\s*$/, '\n');

function decision(overrides = {}) {
  return {
    code: 'ABC234', title: 'Test round', phase: 'question', host: false,
    serverNow: 1_000, deadline: 61_000, questionDurationMs: 60_000,
    questionIndex: 0, questionCount: 3, playerCount: 1, answeredCount: 0,
    ownAnswer: null, top3: [], players: [], you: null,
    question: { topic: 'revenue', prompt: 'Choose a decision.', options: ['One', 'Two', 'Three', 'Four'], help: [] },
    ...overrides,
  };
}

// Load the production event handlers and rendering code. The small DOM stub captures
// rendered button attributes; these tests exercise state/API ordering, not CSS layout.
function game(initialRoom = decision(), { entry = null, search = '' } = {}) {
  let serverRoom = structuredClone(initialRoom), answerRequest;
  const requests = [], joins = [], listeners = new Map(), elements = new Map();
  const session = { guest: { name: 'Player' }, canHost: false, isOwner: false };
  const element = () => ({
    innerHTML: '', textContent: '', hidden: false, style: {}, dataset: {},
    classList: { toggle() {}, contains() { return false; } },
    focus() {}, setAttribute() {}, removeAttribute() {},
    querySelectorAll() { return []; },
  });
  const main = { ...element(), addEventListener(type, listener) { listeners.set(type, listener); } };
  const context = vm.createContext({
    document: {
      body: { dataset: {} }, activeElement: null,
      getElementById(id) {
        if (id === 'main') return main;
        if (['live-fact-panel', 'fact-panel-content', 'track-select'].includes(id)) return null;
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      querySelectorAll() { return []; }, addEventListener() {},
    },
    window: { matchMedia() { return { matches: true }; }, addEventListener() {} },
    location: { origin: 'https://finance.example.test', pathname: '/', search, hash: '' },
    URLSearchParams,
    history: { replaceState() {}, pushState() {} },
    performance: { now() { return 1_000; } },
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    escape(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'); },
    renderFactPanel() { return ''; }, renderValueConnection() { return ''; },
    sourceLinks() { return ''; }, bindReference() {},
    async fetch(path, options) {
      if (path.startsWith('/api/live/room?code=')) return { ok: true, json: async () => structuredClone(serverRoom) };
      if (path === '/api/session') return { ok: true, json: async () => structuredClone(session) };
      if (path === '/api/live/join') {
        joins.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ code: serverRoom.code, ...(entry ? { entry } : {}) }) };
      }
      assert.equal(path, '/api/live/answer');
      requests.push(JSON.parse(options.body));
      return await new Promise(resolve => { answerRequest = resolve; });
    },
  });
  vm.runInContext(source + '\nglobalThis.app = { state, poll, openRoom, renderRoom, home, start, tick };', context);
  const app = context.app;
  app.state.session = session;
  const options = () => [...main.innerHTML.matchAll(/<button\b([^>]*data-action="answer"[^>]*)>/g)].map(([, attributes]) => ({
    index: Number(attributes.match(/data-answer="(\d+)"/)[1]),
    chosen: /class="[^"]*\bchosen\b/.test(attributes),
    pressed: /aria-pressed="true"/.test(attributes),
    disabled: /\sdisabled(?:\s|$)/.test(attributes),
  }));
  return {
    app, requests, joins, options, html: () => main.innerHTML,
    setRoom(room) { serverRoom = structuredClone(room); },
    open(code = serverRoom.code, entry = null) { return app.openRoom(code, entry); },
    home() { return app.home(); },
    start() { return app.start(); },
    text(id) { return elements.get(id)?.textContent; },
    join() {
      context.document.getElementById('room-code').value = serverRoom.code;
      context.document.getElementById('player-name').value = 'Player';
      return listeners.get('submit')({
        preventDefault() {}, target: { id: 'join-form', querySelector() { return element(); } },
      });
    },
    poll() { return app.poll(); },
    click(index) {
      const option = options().find(option => option.index === index);
      assert(option, 'answer button exists');
      const button = { disabled: option.disabled, dataset: { action: 'answer', answer: String(index) } };
      return listeners.get('click')({ target: { closest() { return button; } } });
    },
    finishAnswer(ok = true) {
      assert(answerRequest, 'answer request is pending');
      answerRequest({ ok, json: async () => ok ? { selected: 2 } : { error: 'Previous question ended.' } });
      answerRequest = null;
    },
  };
}

function assertNeutral(game) {
  assert.equal(game.options().length, 4);
  assert(game.options().every(option => !option.chosen && !option.pressed && !option.disabled));
  assert.match(game.html(), /Choose your answer\. Your first choice is final\./);
}

function assertLockedC(game) {
  assert.deepEqual(game.options().filter(option => option.chosen).map(option => option.index), [2]);
  assert.deepEqual(game.options().filter(option => option.pressed).map(option => option.index), [2]);
  assert(game.options().every(option => option.disabled));
}

test('a chosen C stays locked during the current question and reveal, then the next question starts neutral', async () => {
  const round = game();
  await round.open();
  assertNeutral(round);
  const submitted = round.click(2);
  assert.deepEqual(round.requests, [{ code: 'ABC234', questionIndex: 0, selected: 2 }]);
  assertLockedC(round);

  // A player-count heartbeat redraws this question while the submission is pending.
  round.setRoom(decision({ playerCount: 2 }));
  await round.poll();
  assertLockedC(round);

  const saved = decision({ playerCount: 2, answeredCount: 1, ownAnswer: { selected: 2 } });
  round.setRoom(saved);
  round.finishAnswer();
  await submitted;
  assertLockedC(round);
  assert.match(round.html(), /Answer locked/);

  round.setRoom({ ...saved, phase: 'reveal', ownAnswer: { selected: 2, correct: false, points: 0 }, question: { ...saved.question, correct: 1, explanation: 'Two was the better decision.' } });
  await round.poll();
  assertLockedC(round);

  round.setRoom(decision({ questionIndex: 1, playerCount: 2 }));
  await round.poll();
  assertNeutral(round);
  assert.equal(round.app.state.pendingAnswer, null);
});

for (const succeeds of [true, false]) {
  test(`a delayed prior-question answer ${succeeds ? 'success' : 'failure'} cannot change the next question`, async () => {
    const round = game();
    await round.open();
    const submitted = round.click(2);
    assertLockedC(round);
    round.setRoom(decision({ questionIndex: 1 }));
    await round.poll();
    assertNeutral(round);

    round.finishAnswer(succeeds);
    await submitted;
    assertNeutral(round);
    assert.equal(round.app.state.error, '');
  });
}

test('opening another room clears its previous selection and ignores the old response', async () => {
  const round = game();
  await round.open();
  const submitted = round.click(2);
  assertLockedC(round);
  round.setRoom(decision({ code: 'DEF567' }));
  await round.open();
  assertNeutral(round);
  assert.equal(round.app.state.pendingAnswer, null);

  round.finishAnswer(false);
  await submitted;
  assertNeutral(round);
  assert.equal(round.app.state.error, '');
});

test('late joining uses the current decision and remaining timer, with a notice until the next phase', async () => {
  const current = decision({ questionIndex: 1, deadline: 10_000 });
  const round = game(current);
  await round.open(undefined, { kind: 'late', phase: 'question', questionIndex: 1, questionCount: 3 });
  assertNeutral(round);
  assert.match(round.html(), /You joined at Decision 2 of 3\. Missed decisions earn no points\. Answer before the current timer ends\./);
  assert.equal(round.text('seconds'), '9');
  assert.equal(round.app.state.deadlinePerf, 10_000);

  round.setRoom({ ...current, playerCount: 2 });
  await round.poll();
  assert.match(round.html(), /entry-notice/);
  round.setRoom({ ...current, phase: 'reveal', question: { ...current.question, correct: 1 } });
  await round.poll();
  assert.doesNotMatch(round.html(), /entry-notice/);
  assert.equal(round.app.state.entry, null);
});

test('late joining a reveal explains the closed decision and waits for the next one', async () => {
  const current = decision({ phase: 'reveal', questionIndex: 1 });
  const round = game(current);
  await round.open(undefined, { kind: 'late', phase: 'reveal', questionIndex: 1, questionCount: 3 });
  assert.match(round.html(), /This decision is closed\. Wait for your host to open the next decision\./);
  assert.match(round.html(), /Joined after this decision closed\. 0 points\./);
  assert.doesNotMatch(round.html(), /No answer received in time/);
  assert(round.options().every(option => option.disabled && !option.chosen));

  round.setRoom(decision({ questionIndex: 2 }));
  await round.poll();
  assertNeutral(round);
  assert.doesNotMatch(round.html(), /entry-notice/);
});

test('late joining the last reveal waits for final results', async () => {
  const round = game(decision({ phase: 'reveal', questionIndex: 2 }));
  await round.open(undefined, { kind: 'late', phase: 'reveal', questionIndex: 2, questionCount: 3 });
  assert.match(round.html(), /Wait for your host to show final results\./);
  assert.doesNotMatch(round.html(), /open the next decision/);
  assert(round.options().every(option => option.disabled));
});

test('rejoining retains saved selection and standing without implying a new late entry', async () => {
  const current = decision({ ownAnswer: { selected: 2 }, you: { rank: 2, score: 625 } });
  const round = game(current);
  await round.open(undefined, { kind: 'rejoin' });
  assertLockedC(round);
  assert.match(round.html(), /Welcome back\. Your saved answers and points are retained\./);
  assert.match(round.html(), /#2 · 625 pts/);
  assert.doesNotMatch(round.html(), /Missed decisions earn no points/);

  round.setRoom({ ...current, phase: 'reveal', ownAnswer: { selected: 2, correct: true, points: 625 }, question: { ...current.question, correct: 2 } });
  await round.poll();
  assertLockedC(round);
  assert.doesNotMatch(round.html(), /entry-notice/);
});

test('join form presents late-entry guidance and carries the join response into the room', async () => {
  const round = game(decision({ questionIndex: 1 }), { entry: { kind: 'late', phase: 'question', questionIndex: 1, questionCount: 3 } });
  await round.home();
  assert.match(round.html(), /Join anytime during a live round\. Missed questions earn no points\./);
  assert.match(round.html(), /Return using the same browser and cookies to keep your score\./);
  await round.join();
  assert.deepEqual(round.joins, [{ code: 'ABC234', name: 'Player' }]);
  assert.match(round.html(), /You joined at Decision 2 of 3/);
});

test('opening a shared room link with this browser session carries the join response into the room', async () => {
  const round = game(decision({ phase: 'reveal', questionIndex: 1 }), { search: '?room=ABC234', entry: { kind: 'late', phase: 'reveal', questionIndex: 1, questionCount: 3 } });
  await round.start();
  assert.deepEqual(round.joins, [{ code: 'ABC234', name: 'Player' }]);
  assert.match(round.html(), /This decision is closed\. Wait for your host to open the next decision\./);
  assert.doesNotMatch(round.html(), /Answer before the current timer ends/);
});

test('a completed-round rejoin shows saved results and a welcome-back notice', async () => {
  const round = game(decision({ phase: 'finished', questionIndex: 2, you: { rank: 2, score: 1_250, correct: 2 } }), { search: '?room=ABC234', entry: { kind: 'rejoin' } });
  await round.start();
  assert.match(round.html(), /Welcome back\. Your saved answers and points are retained\./);
  assert.match(round.html(), /1,250 points/);
  assert.equal(round.options().length, 0);
});

test('a round that finishes while a late join connects shows final results instead of an open-question prompt', async () => {
  const round = game(decision({ phase: 'finished', questionIndex: 2 }), { search: '?room=ABC234', entry: { kind: 'late', phase: 'question', questionIndex: 2, questionCount: 3 } });
  await round.start();
  assert.match(round.html(), /You joined as the round ended\. Missed decisions earn no points\. Here are the final results\./);
  assert.doesNotMatch(round.html(), /Answer before the current timer ends|open the next decision/);
  assert.equal(round.options().length, 0);
});

test('lobby guidance allows joining during play and ordinary lobby entry adds no status banner', async () => {
  const round = game(decision({ phase: 'lobby' }));
  await round.open();
  assert.match(round.html(), /Join anytime during a live round\. Missed questions earn no points\./);
  assert.match(round.html(), /same browser and cookies to keep their score/);
  assert.doesNotMatch(round.html(), /entry-notice/);
});

test('opening a different room does not retain the prior entry notice and hosts do not see player entry notices', async () => {
  const round = game();
  await round.open(undefined, { kind: 'late' });
  assert.match(round.html(), /entry-notice/);
  round.setRoom(decision({ code: 'DEF567' }));
  await round.open();
  assert.doesNotMatch(round.html(), /entry-notice/);
  round.setRoom(decision({ code: 'DEF567', host: true }));
  await round.open(undefined, { kind: 'rejoin' });
  assert.doesNotMatch(round.html(), /entry-notice/);
});

test('comparison reveal separates business changes, reported causes, and leadership interpretation', async () => {
  const question = {
    ...decision().question, correct: 1, explanation: 'Fallback summary should not repeat.',
    businessReasoning: {
      changed: 'North America sales declined 15%, while margin declined.',
      drivers: 'CNH reported lower shipment volumes and an unfavorable product mix.',
      decision: 'Align staffing with sustained production demand & monitor dealer inventory.',
    },
    discussion: 'What demand signal would change your staffing plan?',
  };
  const round = game(decision({ phase: 'reveal', question }));
  await round.open();
  assert.match(round.html(), /Why this matters<\/strong><div class="business-reasoning">/);
  assert.match(round.html(), /<strong>What changed<\/strong>North America sales declined 15%, while margin declined\./);
  assert.match(round.html(), /<strong>Why it changed · company-reported<\/strong>CNH reported lower shipment volumes and an unfavorable product mix\./);
  assert.match(round.html(), /<strong>Leadership implication · practical interpretation<\/strong>Align staffing with sustained production demand &amp; monitor dealer inventory\./);
  assert.match(round.html(), /What demand signal would change your staffing plan\?/);
  assert.doesNotMatch(round.html(), /Fallback summary should not repeat/);
});

test('older rounds and other banks keep their existing explanation when business reasoning is absent', async () => {
  const question = { ...decision().question, correct: 1, explanation: 'Inventory ties up cash until it sells.' };
  const round = game(decision({ phase: 'reveal', question }));
  await round.open();
  assert.match(round.html(), /<strong>Why this matters<\/strong><p>Inventory ties up cash until it sells\.<\/p>/);
  assert.doesNotMatch(round.html(), /business-reasoning|company-reported|practical interpretation/);
});

test('business reasoning stays hidden until reveal', async () => {
  const question = {
    ...decision().question,
    businessReasoning: { changed: 'A hidden change.', drivers: 'A hidden cause.', decision: 'A hidden implication.' },
  };
  const round = game(decision({ question }));
  await round.open();
  assert.doesNotMatch(round.html(), /A hidden change|A hidden cause|A hidden implication|business-reasoning/);
});
