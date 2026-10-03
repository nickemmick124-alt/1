import challenges from './challenges.json' with { type: 'json' };
import { weekKey, challengeIndex, challengeForWeek, safeCsv } from './domain.mjs';
import { assets } from './assets.mjs';
export const QUESTION_MS = 20000;
export function livePoints(elapsed, correct) { return !correct || elapsed < 0 || elapsed >= QUESTION_MS ? 0 : 500 + Math.round(500 * (1 - elapsed / QUESTION_MS)); }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
function identity(request) {
  const id = request.headers.get('oai-authenticated-user-id'), email = request.headers.get('oai-authenticated-user-email');
  if (!id || !email) return null;
  let name = request.headers.get('oai-authenticated-user-full-name');
  if (name && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') { try { name = decodeURIComponent(name); } catch { name = null; } }
  return { id, email, name: name || email.split('@')[0] };
}
function isOwner(user, env) { return !!user && !!env.OWNER_EMAIL && user.email.toLowerCase() === env.OWNER_EMAIL.toLowerCase(); }
function db(env) { if (!env.DB) throw new Error('Results storage unavailable'); return env.DB; }
function codeValue(value) { return typeof value === 'string' && /^[A-Z2-9]{6}$/.test(value.toUpperCase()) ? value.toUpperCase() : null; }
async function roomOf(env, code) { return db(env).prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first(); }
async function playerOf(env, code, uid) { return db(env).prepare('SELECT * FROM players WHERE room_code = ? AND user_id = ?').bind(code, uid).first(); }
function phaseOf(room, now) { return room.phase === 'question' && now >= room.started_at + QUESTION_MS ? 'reveal' : room.phase; }
async function standings(env, code, beforeQuestion = 999) {
  const { results } = await db(env).prepare('SELECT p.user_id, p.name, p.email, p.joined_at, COALESCE(SUM(a.points), 0) AS score, COALESCE(SUM(a.is_correct), 0) AS correct, COALESCE(SUM(CASE WHEN a.is_correct = 1 THEN a.elapsed_ms ELSE 0 END), 0) AS answer_time FROM players p LEFT JOIN answers a ON a.room_code = p.room_code AND a.user_id = p.user_id AND a.question_index < ? WHERE p.room_code = ? GROUP BY p.user_id ORDER BY score DESC, correct DESC, answer_time ASC, p.joined_at ASC, p.user_id ASC').bind(beforeQuestion, code).all();
  return results.map((p, i) => ({ ...p, rank: i + 1 }));
}
async function roomState(env, room, user, now) {
  const host = room.host_id === user.id, player = await playerOf(env, room.code, user.id);
  if (!host && !player) return json({ error: 'Join this room to see the round.' }, 403);
  const challenge = JSON.parse(room.snapshot), phase = phaseOf(room, now);
  const scores = await standings(env, room.code, phase === 'question' ? room.question_index : 999), q = room.question_index >= 0 ? challenge.questions[room.question_index] : null;
  const answer = q && player ? await db(env).prepare('SELECT selected, points, is_correct FROM answers WHERE room_code = ? AND user_id = ? AND question_index = ?').bind(room.code, user.id, room.question_index).first() : null;
  const counts = q ? await db(env).prepare('SELECT count(*) AS count FROM answers WHERE room_code = ? AND question_index = ?').bind(room.code, room.question_index).first() : { count: 0 };
  const revealed = phase === 'reveal' || phase === 'finished';
  const safeScores = scores.map(({ user_id, email, joined_at, answer_time, ...p }) => ({ ...p, isYou: user_id === user.id }));
  return json({ code: room.code, title: challenge.title, story: challenge.story, phase, host, serverNow: now, questionDurationMs: QUESTION_MS, deadline: room.started_at ? room.started_at + QUESTION_MS : null, questionIndex: room.question_index, questionCount: challenge.questions.length, playerCount: scores.length, answeredCount: counts.count, question: q ? { topic: q.topic, prompt: q.prompt, options: q.options, ...(revealed ? { correct: q.correct, explanation: q.explanation } : {}) } : null, ownAnswer: answer ? { selected: answer.selected, ...(revealed ? { points: answer.points, correct: !!answer.is_correct } : {}) } : null, top3: safeScores.slice(0, 3), you: safeScores.find(p => p.isYou) || null, players: phase === 'lobby' || host && phase === 'finished' ? safeScores : [], ...(host && phase === 'finished' ? { results: scores.map(({ user_id, joined_at, answer_time, ...p }) => p), review: challenge.questions } : {}) });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname, user = identity(request), owner = isOwner(user, env), now = Date.now();
    try {
      if (path === '/api/session') return json({ user: user ? { name: user.name, email: user.email } : null, isOwner: owner, week: weekKey(), rounds: challenges.map((c, index) => ({ index, title: c.title })), defaultRound: challengeIndex(weekKey(), challenges.length) });
      if (path.startsWith('/api/live/')) {
        if (!user) return json({ error: 'Sign in with ChatGPT to join or host a live round.' }, 401);
        if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return json({ error: 'Request origin was rejected.' }, 403);
        if (request.method === 'POST' && !request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Send a JSON request.' }, 415);
        let body = {}, answeredAt = now;
        if (request.method === 'POST') {
          const raw = await request.text(); if (raw.length > 4096) return json({ error: 'Request is too large.' }, 413);
          try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
          if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request.' }, 400);
          answeredAt = Date.now();
        }
        if (path === '/api/live/rooms' && request.method === 'GET') {
          if (!owner) return json({ error: 'Only the assessment owner can see saved rounds.' }, 403);
          const { results } = await db(env).prepare('SELECT code, title, phase, created_at FROM rooms WHERE host_id = ? ORDER BY created_at DESC LIMIT 30').bind(user.id).all(); return json({ rooms: results });
        }
        if (path === '/api/live/create' && request.method === 'POST') {
          if (!owner) return json({ error: 'Only the assessment owner can host a round.' }, 403);
          const index = body.round ?? challengeIndex(weekKey(), challenges.length);
          if (!Number.isInteger(index) || index < 0 || index >= challenges.length) return json({ error: 'Choose a valid round.' }, 400);
          const challenge = challengeForWeek([challenges[index]], weekKey()), alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          for (let attempt = 0; attempt < 3; attempt++) {
            const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join('');
            try { await db(env).prepare('INSERT INTO rooms (code, host_id, title, snapshot, phase, question_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(code, user.id, challenge.title, JSON.stringify(challenge), 'lobby', -1, new Date(now).toISOString()).run(); return json({ code }); }
            catch (e) { if (!e.message.includes('UNIQUE')) throw e; }
          }
          return json({ error: 'A room could not be created. Please try again.' }, 503);
        }
        const code = codeValue(body.code || url.searchParams.get('code'));
        if (!code) return json({ error: 'Enter the six-character room code.' }, 400);
        const room = await roomOf(env, code);
        if (!room) return json({ error: 'That room was not found. Check the code with your host.' }, 404);
        if (path === '/api/live/join' && request.method === 'POST') {
          if (room.host_id === user.id || await playerOf(env, code, user.id)) return json({ code });
          if (room.phase !== 'lobby') return json({ error: 'This round has already started. Join the next round.' }, 409);
          const name = typeof body.name === 'string' ? body.name.trim() : user.name;
          if (!name || name.length > 40 || /[\u0000-\u001f]/.test(name)) return json({ error: 'Enter a display name between 1 and 40 characters.' }, 400);
          await db(env).prepare('INSERT INTO players (id, room_code, user_id, name, email, joined_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM players WHERE room_code = ?) < 100 AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND phase = ?) ON CONFLICT(room_code, user_id) DO NOTHING').bind(crypto.randomUUID(), code, user.id, name, user.email, new Date(now).toISOString(), code, code, 'lobby').run();
          if (!await playerOf(env, code, user.id)) return json({ error: 'This room is full or has started. Ask your host for the next round.' }, 409);
          return json({ code });
        }
        if (path === '/api/live/room' && request.method === 'GET') return roomState(env, room, user, Date.now());
        if (path === '/api/live/advance' && request.method === 'POST') {
          if (room.host_id !== user.id || !owner) return json({ error: 'Only this room’s host can advance the game.' }, 403);
          if (body.questionIndex !== room.question_index) return json({ error: 'The room has already advanced. Refresh the round.' }, 409);
          if (room.phase === 'finished') return json({ code });
          if (room.phase === 'question' && phaseOf(room, Date.now()) !== 'reveal') return json({ error: 'Wait for the twenty-second timer to finish.' }, 409);
          const challenge = JSON.parse(room.snapshot);
          if (room.phase === 'lobby') { const count = await db(env).prepare('SELECT count(*) AS count FROM players WHERE room_code = ?').bind(code).first(); if (!count.count) return json({ error: 'At least one player needs to join before you start.' }, 409); }
          const next = room.question_index + 1, finished = next >= challenge.questions.length;
          await db(env).prepare('UPDATE rooms SET phase = ?, question_index = ?, started_at = ? WHERE code = ? AND question_index = ? AND phase = ?').bind(finished ? 'finished' : 'question', finished ? room.question_index : next, finished ? room.started_at : Date.now(), code, room.question_index, room.phase).run(); return json({ code });
        }
        if (path === '/api/live/answer' && request.method === 'POST') {
          if (room.host_id === user.id) return json({ error: 'The host runs the round; only players answer.' }, 403);
          if (!await playerOf(env, code, user.id)) return json({ error: 'Join the room before answering.' }, 403);
          const challenge = JSON.parse(room.snapshot), q = challenge.questions[room.question_index];
          if (!q || !Number.isInteger(body.selected) || body.selected < 0 || body.selected >= q.options.length) return json({ error: 'Choose one valid answer.' }, 400);
          if (body.questionIndex !== room.question_index) return json({ error: 'This question has ended.' }, 409);
          const previous = await db(env).prepare('SELECT selected FROM answers WHERE room_code = ? AND user_id = ? AND question_index = ?').bind(code, user.id, room.question_index).first();
          if (previous) return json({ accepted: true, selected: previous.selected });
          const receivedAt = answeredAt, elapsed = receivedAt - room.started_at;
          if (room.phase !== 'question' || elapsed < 0 || elapsed >= QUESTION_MS) return json({ error: 'Time is up. Your answer arrived after the deadline.' }, 409);
          const correct = body.selected === q.correct, points = livePoints(elapsed, correct);
          await db(env).prepare('INSERT INTO answers (id, room_code, user_id, question_index, selected, is_correct, points, elapsed_ms, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(room_code, user_id, question_index) DO NOTHING').bind(crypto.randomUUID(), code, user.id, room.question_index, body.selected, correct ? 1 : 0, points, elapsed, new Date(receivedAt).toISOString()).run();
          const saved = await db(env).prepare('SELECT selected FROM answers WHERE room_code = ? AND user_id = ? AND question_index = ?').bind(code, user.id, room.question_index).first(); return json({ accepted: true, selected: saved.selected });
        }
        if (path === '/api/live/results.csv' && request.method === 'GET') {
          if (room.host_id !== user.id || !owner) return json({ error: 'Only the host can export team results.' }, 403);
          if (room.phase !== 'finished') return json({ error: 'Finish the round before exporting results.' }, 409);
          const scores = await standings(env, code), rows = [['Rank', 'Name', 'Email', 'Score', 'Correct', 'Room', 'Round'], ...scores.map(s => [s.rank, s.name, s.email, s.score, s.correct, code, room.title])];
          return new Response(rows.map(row => row.map(safeCsv).join(',')).join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="cnh-finance-${code}.csv"`, 'cache-control': 'no-store' } });
        }
        return json({ error: 'Not found.' }, 404);
      }
      if (path.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
      const asset = assets[path === '/' || path === '/results' ? '/index.html' : path];
      if (!asset) return new Response('Not found', { status: 404 });
      return new Response(asset.body, { headers: { 'content-type': asset.type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.openai.com" } });
    } catch (e) { console.error('Live round failed', path, e.message); return json({ error: 'The live round could not connect. Please retry; accepted answers are saved.' }, 503); }
  }
};
