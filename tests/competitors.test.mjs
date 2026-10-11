import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openDatabase } from '../scripts/local-db.mjs';
import worker from '../dist/server/index.js';
import competitorRound from '../src/competitors.json' with { type: 'json' };
import { renderCompetitorSheet } from '../public/competitors.js';

const origin = 'https://finance.example.test';
const host = { id: 'competitor-host', email: 'host@example.test' };
const player = { id: 'competitor-player', email: 'player@example.test' };
const latePlayer = { id: 'competitor-late', email: 'late@example.test' };
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
  const local = openDatabase(), env = { DB: local.DB, OWNER_EMAIL: host.email };
  return { local, env, call: (path, user, body) => worker.fetch(request(path, user, body), env) };
}
async function stored(env, code) {
  const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
  return { ...room, challenge: JSON.parse(room.snapshot) };
}

test('current comparison keeps Deere-only scope and reconciles equipment sales, costs and profits', () => {
  const facts = competitorRound.factSheet;
  assert(!/AGCO|Caterpillar|Komatsu|Kubota/.test(JSON.stringify(competitorRound)));
  assert.equal(facts.comparison.periods.cnh.periodEnd, '2026-06-30');
  assert.equal(facts.comparison.periods.deere.periodEnd, '2026-08-02');
  const metric = id => facts.comparison.metrics.find(row=>row.id===id);
  for (const company of ['cnh', 'deere']) {
    for (const period of ['current', 'prior']) {
      const sales = metric('equipment-sales')[company][period];
      const costs = metric('equipment-cogs')[company][period];
      const gross = metric('gross-profit')[company][period];
      assert.equal(sales-costs, gross);
      assert(Math.abs(metric('gross-margin')[company][period] - gross/sales*100) < 0.05);
      const profits = facts.comparison.drivers.flatMap(group=>group.rows).filter(row=>company==='cnh' ? row.company==='CNH' : /deere/i.test(row.company));
      assert.equal(profits.reduce((sum,row)=>sum+row[period==='current'?'revenueMillion':'priorRevenueMillion'],0), sales);
      if (company==='deere') assert.equal(profits.reduce((sum,row)=>sum+row[period==='current'?'profitMillion':'priorProfitMillion'],0), metric('equipment-op')[company][period]);
    }
  }
  assert.equal(metric('net-income').cnh.current, 138);
  assert.equal(metric('net-income').cnh.prior, 213);
  for(const question of competitorRound.questions) {
    assert.equal(new Set(question.options).size, 4);
    assert(question.correct>=0 && question.correct<4);
    assert(question.sources.every(source=>facts.sources.some(s=>s.id===source.id)));
  }
});

test('full and compact comparisons show detailed figures and explanations while archived references remain renderable', () => {
  const facts = competitorRound.factSheet;
  for (const compact of [false,true]) {
    const html = renderCompetitorSheet(facts, {compact});
    for (const text of ['John Deere','Current','Prior year','YoY change','What it means','Why it matters','Why it changed','2026-06-30','2026-08-02','$138m','$1,379m','27.72%','9.75 percentage points']) assert(html.includes(text), text);
    assert(!/AGCO|Caterpillar|Komatsu|Kubota|NaN|undefined/.test(html));
    const legacy = structuredClone(facts);
    delete legacy.comparison;
    legacy.headcount.push({company:'Archived peer',count:123,asOf:'2020-01-01',definition:'Historical count'});
    const legacyHtml=renderCompetitorSheet(legacy,{compact});
    assert(legacyHtml.includes('Archived peer'));
    assert(!legacyHtml.includes('comparison-metric-card'));
  }
});

test('competitor reference is public while creating the separate eight-question round still requires hosting access', async () => {
  const { local, env, call } = setup();
  try {
    const facts = await (await call('/api/competitor-facts')).json();
    assert.equal(facts.kind, 'competitors');
    assert.deepEqual(facts, competitorRound.factSheet);
    const session = await (await call('/api/session')).json();
    assert.deepEqual(session.competitorRound, {
      title: competitorRound.title, story: competitorRound.story, questionCount: 8,
      durationMs: 25000, period: competitorRound.period || null
    });
    for (const publicData of [facts, session.competitorRound]) {
      const serialized = JSON.stringify(publicData);
      assert(!/"(?:questions|correct|options|valueConnection|reviewOf)"\s*:/.test(serialized));
      for (const question of competitorRound.questions) assert(!serialized.includes(JSON.stringify(question.prompt)), 'quiz prompts must stay out of public reference data');
    }
    for (const path of ['/competitors', '/competitors.js', '/competitors.css']) assert.equal((await call(path)).status, 200);
    assert.equal((await call('/api/live/create', null, { track: 'competitors' })).status, 401);
    assert.equal((await call('/api/live/create', player, { track: 'competitors' })).status, 403);
    const response = await call('/api/live/create', host, { track: 'competitors', format: 'current', questionDurationMs: 1 });
    assert.equal(response.status, 200);
    const { code } = await response.json(), room = await stored(env, code);
    assert.equal(room.challenge.track, 'competitors');
    assert.equal(room.challenge.questions.length, 8);
    assert.equal(room.challenge.questionDurationMs, 25000);
    assert.equal(room.challenge.setId, competitorRound.setId);
    assert.deepEqual(room.challenge.factSheet, facts);
    assert.deepEqual(room.challenge.sources, competitorRound.sources);
    const lobby = await (await call('/api/live/room?code=' + code, host)).json();
    assert.deepEqual(lobby.factSheet, facts);
    assert.equal(lobby.question, null);
    assert(!('review' in lobby));
    assert.equal((await call('/api/live/room?code=' + code, player)).status, 403);
  } finally { local.close(); }
});

test('competitor answers remain hidden until the saved twenty-five-second deadline', async t => {
  let clock = 40000000;
  t.mock.method(Date, 'now', () => clock);
  const { local, env, call } = setup();
  try {
    const { code } = await (await call('/api/live/create', host, { track: 'competitors' })).json();
    const original = await stored(env, code), question = original.challenge.questions[0];
    for (const user of [player, latePlayer]) await call('/api/live/join', user, { code, name: user.id });
    await call('/api/live/advance', host, { code, questionIndex: -1 });
    const start = clock;
    clock += 12500;
    assert.equal((await call('/api/live/answer', player, { code, questionIndex: 0, selected: question.correct })).status, 200);
    clock = start + 24999;
    const active = await (await call('/api/live/room?code=' + code, player)).json();
    assert.equal(active.phase, 'question');
    assert.equal(active.questionDurationMs, 25000);
    assert.equal(active.deadline, start + 25000);
    assert.deepEqual(active.factSheet, original.challenge.factSheet);
    for (const key of ['correct', 'explanation', 'discussion', 'valueConnection', 'learning', 'reviewOf', 'sources']) assert(!Object.hasOwn(active.question, key));
    assert.deepEqual(active.ownAnswer, { selected: question.correct });
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: 0 })).status, 409);
    clock++;
    const reveal = await (await call('/api/live/room?code=' + code, player)).json();
    assert.equal(reveal.phase, 'reveal');
    assert.equal(reveal.question.correct, question.correct);
    assert.equal(reveal.question.explanation, question.explanation);
    assert.deepEqual(reveal.question.sources, question.sources);
    assert.equal(reveal.ownAnswer.points, 750);
    assert.equal((await call('/api/live/answer', latePlayer, { code, questionIndex: 0, selected: question.correct })).status, 409);
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: 0 })).status, 200);
    assert.equal((await stored(env, code)).snapshot, original.snapshot);
  } finally { local.close(); }
});

test('competitor replay preserves archived reference and questions across a bank update and rejects review mixes', async () => {
  const { local, env, call } = setup();
  try {
    const { code } = await (await call('/api/live/create', host, { track: 'competitors' })).json();
    const original = await stored(env, code);
    await env.DB.prepare('UPDATE rooms SET phase = ?, question_index = ? WHERE code = ?').bind('finished', 7, code).run();
    for (const body of [
      { track: 'competitors', format: 'mixed', sourceCode: code },
      { track: 'beginner', format: 'mixed', sourceCode: code },
      { track: 'legacy', round: 0, format: 'mixed', sourceCode: code }
    ]) {
      const response = await call('/api/live/create', host, body);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /fact sheet/i);
    }
    const changedBank = structuredClone(competitorRound);
    changedBank.factSheet = { kind: 'competitors', title: 'Hypothetical future comparison' };
    changedBank.questionDurationMs = 35000;
    changedBank.questions[0].prompt = 'Hypothetical revised competitor question';
    const [builtSource, bankSource] = await Promise.all([
      readFile(new URL('../dist/server/index.js', import.meta.url), 'utf8'),
      readFile(new URL('../src/competitors.json', import.meta.url), 'utf8')
    ]);
    const declaration = `const competitorRound = ${bankSource};`;
    assert(builtSource.includes(declaration));
    const changedSource = builtSource.replace(declaration, `const competitorRound = ${JSON.stringify(changedBank)};`);
    const updatedWorker = (await import('data:text/javascript;base64,' + Buffer.from(changedSource).toString('base64'))).default;
    const updatedCall = (path, user, body) => updatedWorker.fetch(request(path, user, body), env);
    assert.deepEqual(await (await updatedCall('/api/competitor-facts')).json(), changedBank.factSheet);
    const response = await updatedCall('/api/live/create', host, { format: 'replay', sourceCode: code });
    assert.equal(response.status, 200);
    const replay = (await stored(env, (await response.json()).code)).challenge;
    assert.equal(replay.track, 'competitors');
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
    assert.equal((await stored(env, code)).snapshot, original.snapshot);
  } finally { local.close(); }
});
