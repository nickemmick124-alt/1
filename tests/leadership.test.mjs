import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openDatabase } from '../scripts/local-db.mjs';
import worker, { livePoints } from '../dist/server/index.js';
import leadershipRound from '../src/leadership.json' with { type: 'json' };

const origin = 'https://finance.example.test';
const host = { id: 'leadership-host', email: 'host@example.test' };
const player = { id: 'leadership-player', email: 'player@example.test' };
const latePlayer = { id: 'leadership-late', email: 'late@example.test' };
function request(path, user, body) {
  return new Request(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(user ? { 'oai-authenticated-user-id': user.id, 'oai-authenticated-user-email': user.email } : {}),
      ...(body !== undefined ? { origin, 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}
function setup() {
  const local = openDatabase();
  const env = { DB: local.DB, OWNER_EMAIL: host.email };
  return { local, env, call: (path, user, body) => worker.fetch(request(path, user, body), env) };
}
async function stored(env, code) {
  const row = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
  return { ...row, challenge: JSON.parse(row.snapshot) };
}
function assertQuestionHidden(state) {
  assert(!('review' in state));
  assert(!('results' in state));
  assert(!('learningReview' in state));
  if (state.question) for (const key of ['correct', 'explanation', 'discussion', 'valueConnection', 'learning', 'reviewOf', 'sources']) assert(!Object.hasOwn(state.question, key), `${key} must stay hidden until reveal`);
}

test('leadership facts and metadata are public while question answers and room access remain protected', async () => {
  const { local, env, call } = setup();
  try {
    const session = await (await call('/api/session')).json();
    assert.deepEqual(session.leadershipRound, {
      title: leadershipRound.title, story: leadershipRound.story, questionCount: 8,
      durationMs: 25000, period: 'Q2 2026'
    });
    const facts = await (await call('/api/leadership-facts')).json();
    assert.deepEqual(facts, leadershipRound.factSheet);
    for (const publicData of [facts, session.leadershipRound]) {
      const serialized = JSON.stringify(publicData);
      assert(!/"(?:questions|correct|options|valueConnection|reviewOf)"\s*:/.test(serialized));
      for (const question of leadershipRound.questions) assert(!serialized.includes(JSON.stringify(question.prompt)), 'public reference must not contain quiz prompts');
    }
    for (const path of ['/facts', '/leadership.js', '/leadership-style.css']) assert.equal((await call(path)).status, 200);
    assert.equal((await call('/api/live/create', null, { track: 'leadership' })).status, 401);
    assert.equal((await call('/api/live/create', player, { track: 'leadership' })).status, 403);
    const response = await call('/api/live/create', host, { track: 'leadership', format: 'current', questionDurationMs: 1 });
    assert.equal(response.status, 200);
    const { code } = await response.json(), room = await stored(env, code);
    assert.equal(room.challenge.track, 'leadership');
    assert.equal(room.challenge.setId, leadershipRound.setId);
    assert.equal(room.challenge.questionDurationMs, 25000);
    assert.equal(room.challenge.questions.length, 8);
    assert.deepEqual(room.challenge.factSheet, facts);
    assert.deepEqual(room.challenge.sources, leadershipRound.sources);
    assert.equal((await call('/api/live/room?code=' + code, player)).status, 403);
    assert.equal((await call('/api/live/room?code=' + code)).status, 401);
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: -1 })).status, 409);
    const lobby = await (await call('/api/live/room?code=' + code, host)).json();
    assert.equal(lobby.question, null);
    assert.deepEqual(lobby.factSheet, facts);
    assertQuestionHidden(lobby);
    const mixed = await call('/api/live/create', host, { track: 'leadership', format: 'mixed', sourceCode: code });
    assert.equal(mixed.status, 400);
    assert.match((await mixed.json()).error, /fact sheet/i);
  } finally { local.close(); }
});

test('leadership deadlines, scoring, reveals and a full completed round use the saved twenty-five-second duration', async t => {
  let clock = 20000000;
  t.mock.method(Date, 'now', () => clock);
  const { local, env, call } = setup();
  try {
    const { code } = await (await call('/api/live/create', host, { track: 'leadership', format: 'current' })).json();
    const original = await stored(env, code), expected = original.challenge;
    for (const user of [player, latePlayer]) assert.equal((await call('/api/live/join', user, { code, name: user.id })).status, 200);
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: -1 })).status, 200);
    let expectedScore = 0;
    for (let index = 0; index < expected.questions.length; index++) {
      const row = await stored(env, code), start = row.started_at;
      const live = await (await call('/api/live/room?code=' + code, player)).json();
      assert.equal(live.phase, 'question');
      assert.equal(live.deadline, start + 25000);
      assert.equal(live.questionDurationMs, 25000);
      assert.deepEqual(live.factSheet, expected.factSheet);
      assertQuestionHidden(live);
      if (index === 0) {
        clock = start + 10000;
        assert.equal((await call('/api/live/advance', host, { code, questionIndex: index })).status, 409);
        assert.equal((await (await call('/api/live/room?code=' + code, player)).json()).phase, 'question');
      }
      const elapsed = index === 0 ? 12500 : 1000;
      clock = start + elapsed;
      const accepted = await call('/api/live/answer', player, { code, questionIndex: index, selected: expected.questions[index].correct });
      assert.equal(accepted.status, 200);
      assert.deepEqual(Object.keys(await accepted.json()).sort(), ['accepted', 'selected']);
      expectedScore += livePoints(elapsed, true, 25000);
      clock = start + 24999;
      assert.equal((await (await call('/api/live/room?code=' + code, player)).json()).phase, 'question');
      clock++;
      const reveal = await (await call('/api/live/room?code=' + code, player)).json();
      assert.equal(reveal.phase, 'reveal');
      assert.equal(reveal.question.correct, expected.questions[index].correct);
      assert.deepEqual(reveal.question.sources, expected.questions[index].sources);
      assert.equal(reveal.ownAnswer.points, livePoints(elapsed, true, 25000));
      assert(reveal.question.valueConnection.name);
      assert.equal((await call('/api/live/answer', latePlayer, { code, questionIndex: index, selected: expected.questions[index].correct })).status, 409);
      clock += 120000;
      const paused = await (await call('/api/live/room?code=' + code, player)).json();
      assert.equal(paused.phase, 'reveal');
      assert.equal(paused.questionIndex, index);
      assert.equal((await call('/api/live/advance', host, { code, questionIndex: index })).status, 200);
    }
    const final = await (await call('/api/live/room?code=' + code, player)).json();
    assert.equal(final.phase, 'finished');
    assert.equal(final.you.correct, 8);
    assert.equal(final.you.score, expectedScore);
    assert(Array.isArray(final.learningReview));
    assert.equal(final.learningReview.length, expected.questions.filter(question => question.learning).length);
    assert(!('results' in final));
    const hostFinal = await (await call('/api/live/room?code=' + code, host)).json();
    assert.equal(hostFinal.results.length, 2);
    assert.equal(hostFinal.review.length, 8);
    assert.equal((await stored(env, code)).snapshot, original.snapshot);
    assert.equal((await call('/api/live/results.csv?code=' + code, player)).status, 403);
    const csv = await (await call('/api/live/results.csv?code=' + code, host)).text();
    assert(csv.includes(String(expectedScore)));
  } finally { local.close(); }
});

test('legacy snapshots without a duration retain forty-second deadlines and existing default behavior', async t => {
  let clock = 30000000;
  t.mock.method(Date, 'now', () => clock);
  const { local, env, call } = setup();
  try {
    const { code } = await (await call('/api/live/create', host, {})).json();
    const original = await stored(env, code), legacy = original.challenge;
    assert.equal(legacy.track, 'beginner');
    assert.equal(legacy.questionDurationMs, 40000);
    delete legacy.questionDurationMs;
    await env.DB.prepare('UPDATE rooms SET snapshot = ? WHERE code = ?').bind(JSON.stringify(legacy), code).run();
    await call('/api/live/join', player, { code, name: 'Legacy participant' });
    await call('/api/live/advance', host, { code, questionIndex: -1 });
    const start = clock;
    clock += 39999;
    const state = await (await call('/api/live/room?code=' + code, player)).json();
    assert.equal(state.phase, 'question');
    assert.equal(state.questionDurationMs, 40000);
    assert.equal(state.deadline, start + 40000);
    assert.equal(state.factSheet, null);
    clock++;
    assert.equal((await call('/api/live/answer', player, { code, questionIndex: 0, selected: legacy.questions[0].correct })).status, 409);
    assert.equal((await (await call('/api/live/room?code=' + code, player)).json()).phase, 'reveal');
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: 0 })).status, 200);
    assert(!Object.hasOwn((await stored(env, code)).challenge, 'questionDurationMs'));
  } finally { local.close(); }
});

test('replay keeps archived facts, sources and timing when the deployed question bank changes', async () => {
  const { local, env, call } = setup();
  try {
    const { code } = await (await call('/api/live/create', host, { track: 'leadership' })).json();
    const original = await stored(env, code);
    await env.DB.prepare('UPDATE rooms SET phase = ?, question_index = ? WHERE code = ?').bind('finished', 7, code).run();
    const changedBank = structuredClone(leadershipRound);
    changedBank.factSheet = { title: 'Hypothetical later quarter', period: 'Q3 2099', metrics: [] };
    changedBank.questionDurationMs = 120000;
    changedBank.questions[0].prompt = 'Hypothetical revised question';
    const [builtSource, bankSource] = await Promise.all([
      readFile(new URL('../dist/server/index.js', import.meta.url), 'utf8'),
      readFile(new URL('../src/leadership.json', import.meta.url), 'utf8')
    ]);
    const originalDeclaration = `const leadershipRound = ${bankSource};`;
    assert(builtSource.includes(originalDeclaration), 'the bank replacement must affect the deployed worker');
    const changedSource = builtSource.replace(originalDeclaration, `const leadershipRound = ${JSON.stringify(changedBank)};`);
    const updatedWorker = (await import('data:text/javascript;base64,' + Buffer.from(changedSource).toString('base64'))).default;
    const updatedCall = (path, user, body) => updatedWorker.fetch(request(path, user, body), env);
    assert.deepEqual(await (await updatedCall('/api/leadership-facts')).json(), changedBank.factSheet);
    const fresh = await (await updatedCall('/api/live/create', host, { track: 'leadership' })).json();
    assert.deepEqual((await stored(env, fresh.code)).challenge.factSheet, changedBank.factSheet);
    assert.equal((await updatedCall('/api/live/create', player, { format: 'replay', sourceCode: code })).status, 403);
    const replayResponse = await updatedCall('/api/live/create', host, { format: 'replay', sourceCode: code });
    assert.equal(replayResponse.status, 200);
    const replayCode = (await replayResponse.json()).code, replay = (await stored(env, replayCode)).challenge;
    assert.equal(replay.track, 'leadership');
    assert.equal(replay.questionDurationMs, 25000);
    assert.deepEqual(replay.factSheet, original.challenge.factSheet);
    assert.deepEqual(replay.sources, original.challenge.sources);
    for (const [index, question] of replay.questions.entries()) {
      const previous = original.challenge.questions[index];
      assert.equal(question.prompt, previous.prompt);
      assert.equal(question.options[question.correct], previous.options[previous.correct]);
      assert.deepEqual(question.sources, previous.sources);
      assert.equal(question.reviewOf.code, code);
    }
    const state = await (await updatedCall('/api/live/room?code=' + replayCode, host)).json();
    assert.deepEqual(state.factSheet, original.challenge.factSheet);
    assert.equal(state.questionDurationMs, 25000);
    const mixed = await updatedCall('/api/live/create', host, { track: 'beginner', format: 'mixed', sourceCode: code });
    assert.equal(mixed.status, 400);
    assert.match((await mixed.json()).error, /fact sheet/i);
    assert.equal((await stored(env, code)).snapshot, original.snapshot);
  } finally { local.close(); }
});

test('correct-answer points scale with the proportion of each question duration', () => {
  for (const duration of [40000, 25000]) {
    assert.equal(livePoints(0, true, duration), 1000);
    assert.equal(livePoints(duration / 2, true, duration), 750);
    assert.equal(livePoints(duration - 1, true, duration), 500);
    assert.equal(livePoints(duration, true, duration), 0);
    assert.equal(livePoints(-1, true, duration), 0);
    assert.equal(livePoints(0, false, duration), 0);
  }
  assert.equal(livePoints(20000, true), 750);
  assert.equal(livePoints(NaN, true), 0);
  assert.equal(livePoints(0, true, 0), 0);
});
