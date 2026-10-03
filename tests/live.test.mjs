import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../scripts/local-db.mjs';
import worker, { livePoints } from '../dist/server/index.js';
import { weekKey, shiftWeek, challengeForWeek, safeCsv } from '../src/domain.mjs';
import bank from '../src/challenges.json' with { type: 'json' };
const origin = 'https://finance.example.test';
const host = { id: 'host', email: 'host@example.test' };
const fast = { id: 'fast', email: 'fast@example.test' }, slow = { id: 'slow', email: 'slow@example.test' }, wrong = { id: 'wrong', email: 'wrong@example.test' }, late = { id: 'late', email: 'late@example.test' };
function req(path, user, body, overrides = {}) {
  return new Request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(user ? { 'oai-authenticated-user-id': user.id, 'oai-authenticated-user-email': user.email } : {}), ...(body !== undefined ? { origin, 'content-type': 'application/json' } : {}), ...overrides }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
test('speed rewards only correct answers inside the 20-second window', () => {
  assert.equal(livePoints(0, true), 1000); assert.equal(livePoints(1000, true), 975); assert.equal(livePoints(10000, true), 750); assert.equal(livePoints(18000, true), 550);
  assert.equal(livePoints(20000, true), 0); assert.equal(livePoints(-1, true), 0); assert.equal(livePoints(1, false), 0);
});
test('week rollover and CSV exports are predictable', () => {
  assert.equal(weekKey(new Date('2026-10-05T00:00:00Z')), '2026-10-05');
  assert.equal(weekKey(new Date('2026-10-04T23:59:59Z')), '2026-09-28');
  assert.equal(safeCsv('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
  assert.notEqual(challengeForWeek([bank[0]], '2026-09-28').questions[0].prompt, challengeForWeek([bank[0]], '2026-10-05').questions[0].prompt);
});
test('currency variants keep working-capital and margin arithmetic coherent', () => {
  for (let i = 0; i < 40; i++) {
    const week = shiftWeek('2026-09-28', i), c = challengeForWeek([bank[0]], week);
    const working = c.questions.find(q => q.topic === 'working-capital');
    const amounts = [...working.prompt.matchAll(/\$([\d,]+)m/g)].map(m => Number(m[1].replaceAll(',', '')));
    assert.equal(Number(working.options[working.correct].match(/\$([\d,]+)m/)[1].replaceAll(',', '')), amounts[0] - amounts[1]);
    assert.equal(challengeForWeek([bank[1]], week).questions.find(q => q.topic === 'profit-margin').options[challengeForWeek([bank[1]], week).questions.find(q => q.topic === 'profit-margin').correct], '20%');
  }
});
test('full live round: joins, timed scoring, answer lock, reveal, podium and private export', async t => {
  let clock = 2000000; t.mock.method(Date, 'now', () => clock);
  const local = openDatabase(), env = { DB: local.DB, OWNER_EMAIL: host.email };
  async function call(path, user, body, headers) { return worker.fetch(req(path, user, body, headers), env); }
  try {
    assert.equal((await call('/api/live/create', null, {})).status, 401);
    assert.equal((await call('/api/live/create', fast, {})).status, 403);
    assert.equal((await call('/api/live/create', host, null)).status, 400);
    assert.equal((await call('/api/live/create', host, {}, { origin: 'https://other.test' })).status, 403);
    const code = (await (await call('/api/live/create', host, { round: 0 })).json()).code; assert.match(code, /^[A-Z2-9]{6}$/);
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: -1 })).status, 409);
    assert.equal((await call('/api/live/room?code=' + code, fast)).status, 403);
    for (const user of [fast, slow, wrong, late]) assert.equal((await call('/api/live/join', user, { code, name: user.id })).status, 200);
    assert.equal((await call('/api/live/join', fast, { code, name: 'duplicate' })).status, 200);
    const count = await env.DB.prepare('SELECT count(*) AS n FROM players').first(); assert.equal(count.n, 4);
    assert.equal((await call('/api/live/advance', fast, { code, questionIndex: -1 })).status, 403);
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: -1 })).status, 200);
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: 0 })).status, 409);
    const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first(), snapshot = JSON.parse(room.snapshot), correct = snapshot.questions[0].correct;
    const visible = await (await call('/api/live/room?code=' + code, fast)).json(); assert.equal(visible.phase, 'question'); assert.equal(visible.deadline, clock + 20000); assert.equal(visible.questionDurationMs, 20000); assert(!('correct' in visible.question)); assert(!('explanation' in visible.question));
    clock += 1000;
    const submission = { code, questionIndex: 0, selected: correct, points: 5000, elapsed: 0 };
    assert.equal((await call('/api/live/answer', fast, submission)).status, 200);
    const locked = await (await call('/api/live/answer', fast, { ...submission, selected: (correct + 1) % 4 })).json(); assert.equal(locked.selected, correct);
    assert.equal((await call('/api/live/answer', wrong, { ...submission, selected: (correct + 1) % 4 })).status, 200);
    const unrevealed = await (await call('/api/live/room?code=' + code, fast)).json(); assert.equal(unrevealed.you.score, 0); assert(!('points' in unrevealed.ownAnswer)); assert(unrevealed.top3.every(p => !('email' in p)));
    clock = room.started_at + 18000; assert.equal((await call('/api/live/answer', slow, submission)).status, 200);
    clock = room.started_at + 19999;
    const stillOpen = await (await call('/api/live/room?code=' + code, slow)).json(); assert.equal(stillOpen.phase, 'question'); assert(!('correct' in stillOpen.question));
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: 0 })).status, 409);
    clock = room.started_at + 20000; assert.equal((await call('/api/live/answer', late, submission)).status, 409);
    const revealed = await (await call('/api/live/room?code=' + code, fast)).json(); assert.equal(revealed.phase, 'reveal'); assert.equal(revealed.question.correct, correct); assert.equal(revealed.ownAnswer.points, 975); assert.equal(revealed.top3[0].name, 'fast'); assert.equal(revealed.top3[1].score, 550); assert.equal(revealed.top3[2].score, 0);
    assert.equal((await call('/api/live/join', { id: 'new', email: 'new@example.test' }, { code, name: 'new' })).status, 409);
    for (let i = 0; i < snapshot.questions.length; i++) {
      const current = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
      clock = current.started_at + 20000;
      assert.equal((await call('/api/live/advance', host, { code, questionIndex: current.question_index })).status, 200);
    }
    const final = await (await call('/api/live/room?code=' + code, host)).json(); assert.equal(final.phase, 'finished'); assert.equal(final.results.length, 4); assert.equal(final.top3.length, 3); assert.equal(final.review.length, 5);
    const playerFinal = await (await call('/api/live/room?code=' + code, fast)).json(); assert(!('results' in playerFinal)); assert(!JSON.stringify(playerFinal).includes(slow.email));
    assert.equal((await call('/api/live/results.csv?code=' + code, fast)).status, 403);
    const csv = await call('/api/live/results.csv?code=' + code, host); assert.equal(csv.status, 200); assert((await csv.text()).includes(fast.email));
    assert.equal((await call('/api/live/rooms', fast)).status, 403);
  } finally { local.close(); }
});
test('concurrent answer retries produce one scored answer', async t => {
  let clock = 3000000; t.mock.method(Date, 'now', () => clock);
  const local = openDatabase(), env = { DB: local.DB, OWNER_EMAIL: host.email };
  try {
    const code = (await (await worker.fetch(req('/api/live/create', host, {}), env)).json()).code;
    await worker.fetch(req('/api/live/join', fast, { code, name: 'fast' }), env);
    await worker.fetch(req('/api/live/advance', host, { code, questionIndex: -1 }), env);
    const room = await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first(); clock += 2000;
    const selected = JSON.parse(room.snapshot).questions[0].correct;
    const responses = await Promise.all(Array.from({ length: 8 }, () => worker.fetch(req('/api/live/answer', fast, { code, questionIndex: 0, selected }), env)));
    assert(responses.every(r => r.status === 200)); const count = await env.DB.prepare('SELECT count(*) AS n FROM answers').first(); assert.equal(count.n, 1);
    const score = await env.DB.prepare('SELECT points FROM answers').first(); assert.equal(score.points, 950);
  } finally { local.close(); }
});
