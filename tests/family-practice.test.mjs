import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { livePoints } from '../dist/server/index.js';
import beginnerRounds from '../src/beginner.json' with { type: 'json' };

const origin = 'https://finance.example.test';
const firstRound = beginnerRounds[0];
// Practice must never create a guest, room, player, or saved live answer.
const env = { get DB() { throw new Error('Practice unexpectedly accessed results storage'); } };
const request = (path, body, headers = {}) => new Request(origin + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { ...(body === undefined ? {} : { origin, 'content-type': 'application/json' }), ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
const call = (path, body, headers) => worker.fetch(request(path, body, headers), env);

test('anytime practice exposes only the first beginner prompts without an account or storage', async () => {
  const response = await call('/api/practice/round');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const round = await response.json();
  assert.deepEqual(Object.keys(round).sort(), ['durationMs', 'practiceScoreOnly', 'questionCount', 'questions', 'setId', 'story', 'title']);
  assert.equal(round.setId, firstRound.setId);
  assert.equal(round.title, firstRound.title);
  assert.equal(round.questionCount, 8);
  assert.equal(round.durationMs, 40000);
  assert.equal(round.practiceScoreOnly, true);
  assert.deepEqual(round.questions.map(q => q.prompt), firstRound.questions.slice(0, 8).map(q => q.prompt));
  round.questions.forEach((q, index) => {
    assert.deepEqual(Object.keys(q).sort(), ['basis', 'index', 'options', 'prompt', 'reference', 'topic']);
    assert.equal(q.index, index);
    assert.equal(q.options.length, 4);
    assert.equal(q.basis, firstRound.questions[index].basis);
    assert.deepEqual(q.reference, { label: 'Where to learn this', url: '/prepare#' + firstRound.questions[index].learning.id });
  });
  for (const futureRound of beginnerRounds.slice(1)) {
    assert(!round.questions.some(q => futureRound.questions.some(future => future.prompt === q.prompt)));
  }
});

test('checking one practice answer reveals its explanation, learning links, and live-compatible score', async () => {
  for (const [questionIndex, q] of firstRound.questions.slice(0, 8).entries()) {
    const elapsedMs = 1000 + questionIndex * 3000;
    const response = await call('/api/practice/answer', { setId: firstRound.setId, questionIndex, selected: q.correct, elapsedMs });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), ['correct', 'discussion', 'explanation', 'learning', 'points', 'practiceScoreOnly', 'selected', 'sources', 'valueConnection']);
    assert.equal(result.correct, q.correct);
    assert.equal(result.selected, q.correct);
    assert.equal(result.points, livePoints(elapsedMs, true));
    assert.equal(result.practiceScoreOnly, true);
    assert.equal(result.explanation, q.explanation);
    assert.equal(result.discussion, q.discussion);
    assert.deepEqual(result.learning, q.learning);
    assert(result.learning.links.some(link => link.url === '/prepare#' + q.learning.id));
    assert(Array.isArray(result.sources));
    assert(result.valueConnection.name && result.valueConnection.why && result.valueConnection.source.url);
    assert(!('questions' in result));
    assert(!('results' in result));
  }
});

test('wrong answers, expired answers, and timeouts score zero without changing live data', async () => {
  const q = firstRound.questions[0];
  for (const [selected, elapsedMs, points] of [
    [q.correct, 0, 1000],
    [q.correct, 20000, 750],
    [q.correct, 39999, 500],
    [q.correct, 40000, 0],
    [(q.correct + 1) % 4, 0, 0],
    [null, 40000, 0],
    [null, 0, 0]
  ]) {
    const result = await (await call('/api/practice/answer', { questionIndex: 0, selected, elapsedMs, points: 999999, code: 'ABCDEF' })).json();
    assert.equal(result.selected, selected);
    assert.equal(result.points, points);
    assert.equal(result.correct, q.correct);
    assert.equal(result.practiceScoreOnly, true);
  }
});

test('practice answer validation rejects wrong origins, types, invalid bodies, and out-of-scope questions', async () => {
  const valid = { questionIndex: 0, selected: 1, elapsedMs: 1000 };
  assert.equal((await call('/api/practice/answer', valid, { origin: 'https://other.example.test' })).status, 403);
  assert.equal((await call('/api/practice/answer', valid, { origin: '' })).status, 403);
  assert.equal((await call('/api/practice/answer', valid, { 'content-type': 'text/plain' })).status, 415);
  for (const body of [null, [], 'answer', true, 1]) assert.equal((await call('/api/practice/answer', body)).status, 400);
  for (const questionIndex of [-1, 8, 100, 0.5, '0', null]) assert.equal((await call('/api/practice/answer', { ...valid, questionIndex })).status, 400);
  for (const selected of [-1, 4, 0.5, '1', false]) assert.equal((await call('/api/practice/answer', { ...valid, selected })).status, 400);
  assert.equal((await call('/api/practice/answer', { questionIndex: 0, elapsedMs: 1000 })).status, 400);
  for (const elapsedMs of [-1, 40001, '1000', null]) assert.equal((await call('/api/practice/answer', { ...valid, elapsedMs })).status, 400);
  assert.equal((await call('/api/practice/answer', { questionIndex: 0, selected: 1 })).status, 400);
  assert.equal((await call('/api/practice/answer', { ...valid, setId: 'outdated-set' })).status, 409);
  for (const [raw, status] of [['{broken', 400], [' '.repeat(4097), 413]]) {
    assert.equal((await worker.fetch(new Request(origin + '/api/practice/answer', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: raw }), env)).status, status);
  }
  assert.equal((await call('/api/practice/answer')).status, 404);
  assert.equal((await call('/api/practice/round', {})).status, 404);
  assert.equal((await call('/api/practice/future-round')).status, 404);
});

test('the public practice page and its assets are available independently of live sessions', async () => {
  for (const path of ['/try', '/try/']) {
    const response = await call(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.equal(response.headers.get('set-cookie'), null);
    const html = await response.text();
    assert(html.includes('/practice.js'));
    assert(html.includes('/practice.css'));
    assert(!/<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html));
  }
  for (const [path, type] of [['/practice.js', /^text\/javascript/], ['/practice.css', /^text\/css/]]) {
    const response = await call(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), type);
    assert((await response.text()).length > 0);
  }
});
