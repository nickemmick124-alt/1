import weeklyBank from './weekly-bank.json' with { type: 'json' };
import {questionDuration, availableHelp, assistanceStage, weeklyEdition} from './weekly.mjs';
import beginnerRounds from './beginner.json' with { type: 'json' };
import leadershipRound from './leadership.json' with { type: 'json' };
import competitorRound from './competitors.json' with { type: 'json' };
import challenges from './challenges.json' with { type: 'json' };
import questionLevels from './question-levels.json' with { type: 'json' };
import businessContext from './business-context.json' with { type: 'json' };
import { weekKey, challengeIndex, challengeForWeek, safeCsv } from './domain.mjs';
import { resolveValueConnection } from '../public/values.js';
import { levels, roundForLevel, shuffleRoundOptions, withReview, replayRound } from './rounds.mjs';
import { hostEmail, isApprovedHost } from './access.mjs';
import { guestIdentity, createGuest } from './guests.mjs';
import { assets } from './assets.mjs';
export const QUESTION_MS = 40000;
export function livePoints(elapsed, correct, durationMs = QUESTION_MS) { return !correct || !Number.isFinite(elapsed) || !Number.isFinite(durationMs) || durationMs <= 0 || elapsed < 0 || elapsed >= durationMs ? 0 : 500 + Math.round(500 * (1 - elapsed / durationMs)); }
const durationOf = (challenge, index = -1) => questionDuration(challenge, index);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const sourceItems = ids => (ids || []).map(id => ({ id, ...businessContext.sources[id] })).filter(s => s.url);
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
async function ownerRooms(env, uid) {
  const { results } = await db(env).prepare('SELECT code, title, phase, created_at, snapshot FROM rooms WHERE host_id = ? ORDER BY created_at DESC, code ASC LIMIT 100').bind(uid).all();
  return results.map(({ snapshot, ...room }) => { const saved=JSON.parse(snapshot); return { ...room, weekNumber: saved.weekNumber || null, level: saved.level || null, format: saved.format || 'current', track: saved.track || null, questionCount: saved.questions.length }; });
}
async function reviewScores(env, code, questions, scores) {
  const indexes = questions.flatMap((q, index) => q.reviewOf ? [index] : []);
  if (!indexes.length) return scores;
  const { results } = await db(env).prepare(`SELECT user_id, SUM(is_correct) AS correct FROM answers WHERE room_code = ? AND question_index IN (${indexes.map(()=>'?').join(',')}) GROUP BY user_id`).bind(code, ...indexes).all();
  return scores.map(player => ({ ...player, reviewCorrect: results.find(row=>row.user_id===player.user_id)?.correct || 0, reviewTotal: indexes.length }));
}
const randomRoundNumber = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
function phaseOf(room, now, challenge) { return room.phase === 'question' && now >= room.started_at + durationOf(challenge, room.question_index) ? 'reveal' : room.phase; }
async function standings(env, code, beforeQuestion = 999) {
  const { results } = await db(env).prepare('SELECT p.user_id, p.name, p.email, p.participant_type AS participantType, p.joined_at, COALESCE(SUM(a.points), 0) AS score, COALESCE(SUM(a.is_correct), 0) AS correct, COALESCE(SUM(CASE WHEN a.is_correct = 1 THEN a.elapsed_ms ELSE 0 END), 0) AS answer_time FROM players p LEFT JOIN answers a ON a.room_code = p.room_code AND a.user_id = p.user_id AND a.question_index < ? WHERE p.room_code = ? GROUP BY p.user_id ORDER BY score DESC, correct DESC, answer_time ASC, p.joined_at ASC, p.user_id ASC').bind(beforeQuestion, code).all();
  return results.map((p, i) => ({ ...p, rank: i + 1 }));
}
async function roomState(env, room, user, now) {
  const host = room.host_id === user.id, player = await playerOf(env, room.code, user.id);
  if (!host && !player) return json({ error: 'Join this room to see the round.' }, 403);
  const challenge = JSON.parse(room.snapshot), durationMs = durationOf(challenge, room.question_index), phase = phaseOf(room, now, challenge);
  challenge.questions = challenge.questions.map(q => ({ ...q, valueConnection: resolveValueConnection(q, businessContext.values) }));
  let scores = await standings(env, room.code, phase === 'question' ? room.question_index : 999);
  if (phase === 'finished') scores = await reviewScores(env, room.code, challenge.questions, scores);
  const q = room.question_index >= 0 ? challenge.questions[room.question_index] : null;
  const answer = q && player ? await db(env).prepare('SELECT selected, points, is_correct FROM answers WHERE room_code = ? AND user_id = ? AND question_index = ?').bind(room.code, user.id, room.question_index).first() : null;
  const counts = q ? await db(env).prepare('SELECT count(*) AS count FROM answers WHERE room_code = ? AND question_index = ?').bind(room.code, room.question_index).first() : { count: 0 };
  const revealed = phase === 'reveal' || phase === 'finished';
  const safeScores = scores.map(({ user_id, email, joined_at, answer_time, ...p }) => ({ ...p, isYou: user_id === user.id }));
  return json({ code: room.code, title: challenge.title, story: challenge.story, format: challenge.format || 'current', level: challenge.level || null, weekNumber: challenge.weekNumber || null, reviewCount: challenge.questions.filter(q=>q.reviewOf).length, track:challenge.track || null, sources: challenge.sources || [], factSheet: challenge.factSheet || null, phase, host, serverNow: now, questionDurationMs: durationMs, timingRange: challenge.track === 'weekly' ? '45–75' : null, deadline: room.started_at !== null ? room.started_at + durationMs : null, questionIndex: room.question_index, questionCount: challenge.questions.length, playerCount: scores.length, answeredCount: counts.count, question: q ? { topic: q.topic, stage:q.stage || null, prompt: q.prompt, options: q.options, basis: q.basis, help: revealed ? [] : availableHelp(q, now - room.started_at, durationMs), ...(revealed ? { correct: q.correct, explanation: q.explanation, valueConnection: q.valueConnection, learning:q.learning || null, reviewOf: q.reviewOf || null, discussion: q.discussion, sources: q.sources || [] } : {}) } : null, ownAnswer: answer ? { selected: answer.selected, ...(revealed ? { points: answer.points, correct: !!answer.is_correct } : {}) } : null, top3: safeScores.slice(0, 3), you: safeScores.find(p => p.isYou) || null, players: phase === 'lobby' || host && phase === 'finished' ? safeScores : [], ...(phase==='finished' && player ? {learningReview:await learningReview(env,room.code,user.id,challenge.questions)} : {}), ...(host && phase === 'finished' ? { results: scores.map(({ user_id, joined_at, answer_time, ...p }) => p), review: challenge.questions, questionAnalytics: await questionAnalytics(env, room.code, challenge, scores.length) } : {}) });
}
async function questionAnalytics(env, code, challenge, playerCount) {
  const {results} = await db(env).prepare('SELECT question_index, selected, is_correct, elapsed_ms FROM answers WHERE room_code = ?').bind(code).all();
  return challenge.questions.map((q,index)=>{
    const answers=results.filter(a=>a.question_index===index), times=answers.map(a=>a.elapsed_ms).sort((a,b)=>a-b);
    const stages={unassisted:0,clue:0,setup:0,answer:0}, stageCorrect={unassisted:0,clue:0,setup:0,answer:0};
    for(const a of answers) { const stage=assistanceStage(q,a.elapsed_ms,durationOf(challenge,index)); stages[stage]++; if(a.is_correct)stageCorrect[stage]++; }
    const mid=Math.floor(times.length/2), medianMs=!times.length?null:times.length%2?times[mid]:(times[mid-1]+times[mid])/2;
    return {index,prompt:q.prompt,submitted:answers.length,unanswered:Math.max(0,playerCount-answers.length),correct:answers.filter(a=>a.is_correct).length,medianMs,stages,stageCorrect,options:q.options.map((text,selected)=>({text,count:answers.filter(a=>a.selected===selected).length,correct:selected===q.correct}))};
  });
}
async function learningReview(env,code,uid,questions) {
  const {results}=await db(env).prepare('SELECT question_index, is_correct FROM answers WHERE room_code = ? AND user_id = ?').bind(code,uid).all();
  return questions.flatMap((q,index)=>q.learning ? [{prompt:q.prompt,correct:!!results.find(a=>a.question_index===index)?.is_correct,learning:q.learning}] : []);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname, user = identity(request), owner = isOwner(user, env), now = Date.now();
    try {
      let hostPermission;
      const canHost=async()=>hostPermission ??= owner || await isApprovedHost(user,env);
      let guestPermission;
      const guest=async()=>guestPermission ??= await guestIdentity(request,env,now);
      if (path === '/api/session') { const hosting=await canHost(), participant=!user?await guest():null; return json({ user: user ? { name: user.name, email: user.email } : null, guest: participant ? { name: participant.name } : null, isOwner: owner, canHost: hosting, role: owner ? 'owner' : hosting ? 'host' : 'player', weeklyRound: (()=>{ const r=weeklyEdition(weeklyBank,new Date(now)); return {title:r.title,story:r.story,questionCount:r.questions.length,durationMs:r.questionDurationMs,timingRange:'45–75',bankCount:24,editionCount:4}; })(), beginnerRounds: beginnerRounds.map((r,index)=>({index,title:r.title,story:r.story,questionCount:r.questions.length})), defaultBeginnerRound:0, leadershipRound:{title:leadershipRound.title,story:leadershipRound.story,questionCount:leadershipRound.questions.length,durationMs:durationOf(leadershipRound),period:leadershipRound.period || 'Q2 2026'}, competitorRound:{title:competitorRound.title,story:competitorRound.story,questionCount:competitorRound.questions.length,durationMs:durationOf(competitorRound),period:competitorRound.period || null}, week: weekKey(), verifiedOn: businessContext.verifiedOn, levels, questionSetCount: challenges.length * levels.length, questionCount: challenges.reduce((n,c)=>n+c.questions.length,0) + questionLevels.reduce((n,c)=>n+c.questions.length,0), rounds: challenges.map((c, index) => ({ index, weekNumber: index + 1, title: c.title, story: c.story })), defaultRound: challengeIndex(weekKey(), challenges.length) }); }
      if (path === '/api/competitor-facts' && request.method === 'GET') return json(competitorRound.factSheet);
      if (path === '/api/leadership-facts' && request.method === 'GET') return json(leadershipRound.factSheet);
      if (path === '/api/learning' && request.method === 'GET') return json({topics:beginnerRounds.flatMap(r=>r.questions.map(q=>q.learning)).filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index)});
      if (path === '/api/business-context' && request.method === 'GET') return json({ ...businessContext, values: { source: businessContext.values.source, items: businessContext.values.items, fallback: businessContext.values.fallback } });
      if (path.startsWith('/api/live/')) {
        const participantRoute=['/api/live/join','/api/live/room','/api/live/answer'].includes(path);
        if (!user && !participantRoute) return json({ error: 'Sign in with ChatGPT to use hosting controls.' }, 401);
        if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return json({ error: 'Request origin was rejected.' }, 403);
        if (request.method === 'POST' && !request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Send a JSON request.' }, 415);
        let body = {}, answeredAt = now;
        if (request.method === 'POST') {
          const raw = await request.text(); if (raw.length > 4096) return json({ error: 'Request is too large.' }, 413);
          try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
          if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request.' }, 400);
          answeredAt = Date.now();
        }
        if (['/api/live/hosts','/api/live/hosts/grant','/api/live/hosts/revoke'].includes(path)) {
          if (!owner) return json({ error: 'Only the owner can manage host access.' }, 403);
          if (path === '/api/live/hosts' && request.method === 'GET') {
            const {results}=await db(env).prepare('SELECT email, display_name, granted_at FROM host_access ORDER BY granted_at DESC, email ASC').all();
            return json({ hosts: results.map(row=>({email:row.email,name:row.display_name,grantedAt:row.granted_at})) });
          }
          if (request.method !== 'POST' || path === '/api/live/hosts') return json({error:'Not found.'},404);
          const email=hostEmail(body.email);
          if (!email) return json({error:'Enter the email this person uses to sign in with ChatGPT.'},400);
          if (email===hostEmail(env.OWNER_EMAIL)) return json({error:'Your owner account already has permanent hosting access.'},400);
          if (path === '/api/live/hosts/grant') {
            const name=body.name===undefined?'':typeof body.name==='string'?body.name.trim():null;
            if (name===null || name.length>80 || /[\u0000-\u001f\u007f]/.test(name)) return json({error:'Use a name of 80 characters or fewer.'},400);
            await db(env).prepare('INSERT INTO host_access (email, display_name, granted_by, granted_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name').bind(email,name,user.id,new Date(now).toISOString()).run();
            return json({email,granted:true});
          }
          await db(env).prepare('DELETE FROM host_access WHERE email = ?').bind(email).run();
          return json({email,removed:true});
        }
        if (path === '/api/live/rooms' && request.method === 'GET') {
          if (!await canHost()) return json({ error: 'Hosting access is required to see saved rounds.' }, 403);
          return json({ rooms: await ownerRooms(env, user.id) });
        }
        if (path === '/api/live/create' && request.method === 'POST') {
          if (!await canHost()) return json({ error: 'Ask the owner to add your ChatGPT email to Host access.' }, 403);
          const beginner=body.track==='beginner' || body.track===undefined && body.round===undefined && body.level===undefined;
          if(body.track!==undefined && !['beginner','legacy','leadership','competitors','weekly'].includes(body.track)) return json({error:'Choose a valid learning track.'},400);
          const beginnerIndex=body.beginnerRound ?? 0;
          if(beginner && (!Number.isInteger(beginnerIndex)||!beginnerRounds[beginnerIndex])) return json({error:'Choose a valid beginner round.'},400);
          const index = body.round ?? challengeIndex(weekKey(), challenges.length), level = body.level ?? 'foundation', format = body.format ?? 'current';
          if (!Number.isInteger(index) || index < 0 || index >= challenges.length) return json({ error: 'Choose a valid week.' }, 400);
          if (!levels.some(item=>item.id===level)) return json({ error: 'Choose a valid question level.' }, 400);
          if (!['current','mixed','replay'].includes(format)) return json({ error: 'Choose a valid round format.' }, 400);
          if (['leadership','competitors','weekly'].includes(body.track) && format === 'mixed') return json({error:body.track==='weekly'?'The weekly track keeps its own question set. Choose a current round or replay.':'This round uses its own financial fact sheet. Choose a current round or replay.'},400);
          let sourceRoom, saved;
          if (format !== 'current') {
            const sourceCode = codeValue(body.sourceCode);
            if (!sourceCode) return json({ error: 'Choose a completed round to reuse.' }, 400);
            sourceRoom = await roomOf(env, sourceCode);
            if (!sourceRoom || sourceRoom.host_id !== user.id) return json({ error: 'Choose one of your own saved rounds.' }, 403);
            if (sourceRoom.phase !== 'finished') return json({ error: 'Complete the earlier round before reusing its questions.' }, 409);
            saved = JSON.parse(sourceRoom.snapshot);
            if (format === 'mixed' && ['leadership','competitors','weekly'].includes(saved.track)) return json({error:saved.track==='weekly'?'This saved weekly set cannot be mixed into another round. Choose replay.':'This saved round uses its own financial fact sheet and cannot be mixed into another round. Choose replay.'},400);
            if (![5,6,8].includes(saved.questions.length)) return json({ error: 'Choose a saved round with five, six or eight questions.' }, 400);
          }
          let challenge;
          if (format === 'replay') challenge = replayRound(saved, sourceRoom);
          else {
            challenge = body.track === 'weekly' ? weeklyEdition(weeklyBank, new Date(now)) : body.track === 'competitors' ? structuredClone(competitorRound) : body.track === 'leadership' ? structuredClone(leadershipRound) : beginner ? structuredClone(beginnerRounds[beginnerIndex]) : roundForLevel(challenges, questionLevels, index, level);
            challenge.sources ??= sourceItems(challenge.sourceIds);
            challenge.questions = challenge.questions.map(q=>({ ...q, sources: q.sources ?? sourceItems(q.sourceIds) }));
            if (format === 'mixed') {
              try { challenge = withReview(challenge, saved, sourceRoom, randomRoundNumber); }
              catch (e) { return json({ error: e.message }, 400); }
            }
          }
          challenge.questionDurationMs = durationOf(challenge);
          challenge = shuffleRoundOptions(challenge, randomRoundNumber);
          challenge.questions = challenge.questions.map(q => ({ ...q, sources: q.sources || sourceItems(q.sourceIds), valueConnection: resolveValueConnection(q, businessContext.values) }));
          const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
        if (room.host_id===user?.id && !await canHost()) return json({error:'Your hosting access was removed. Contact the owner to restore it.'},403);
        let participant=user;
        if (participantRoute && room.host_id!==user?.id) {
          const visitor=await guest();
          if (!user || visitor && !await playerOf(env,code,user.id) && await playerOf(env,code,visitor.id)) participant=visitor;
        }
        if (path === '/api/live/join' && request.method === 'POST') {
          const existing=participant ? await playerOf(env,code,participant.id) : null;
          if (room.host_id===user?.id || existing) return json({ code, ...(participant?.isGuest ? {guest:{name:existing.name}} : {}) });
          if (room.phase !== 'lobby') return json({ error: 'This round has already started. Join the next round.' }, 409);
          const name = typeof body.name === 'string' ? body.name.trim() : participant?.name;
          if (!name || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) return json({ error: 'Enter a display name between 1 and 40 characters.' }, 400);
          const capacity=await db(env).prepare('SELECT count(*) AS count FROM players WHERE room_code = ?').bind(code).first();
          if (capacity.count>=100) return json({ error: 'This room is full. Ask your host for the next round.' }, 409);
          const created=!participant ? await createGuest(env,name,now) : null;
          participant ||= created.identity;
          await db(env).prepare('INSERT INTO players (id, room_code, user_id, name, email, joined_at, participant_type) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM players WHERE room_code = ?) < 100 AND EXISTS (SELECT 1 FROM rooms WHERE code = ? AND phase = ?) ON CONFLICT(room_code, user_id) DO NOTHING').bind(crypto.randomUUID(), code, participant.id, name, participant.email, new Date(now).toISOString(), participant.isGuest?'guest':'account', code, code, 'lobby').run();
          if (!await playerOf(env, code, participant.id)) {
            if (created) await db(env).prepare('DELETE FROM guest_sessions WHERE user_id = ?').bind(participant.id).run();
            return json({ error: 'This room is full or has started. Ask your host for the next round.' }, 409);
          }
          if (participant.isGuest) await db(env).prepare('UPDATE guest_sessions SET display_name = ? WHERE user_id = ?').bind(name,participant.id).run();
          const response=json({ code, ...(participant.isGuest ? {guest:{name}} : {}) });
          if (created) response.headers.set('set-cookie',created.cookie);
          return response;
        }
        if (participantRoute && !participant) return json({ error: 'Rejoin with your room code and name. Use the same browser and allow this site’s cookies to keep your score.' }, 401);
        if (path === '/api/live/room' && request.method === 'GET') return roomState(env, room, participant, Date.now());
        if (path === '/api/live/advance' && request.method === 'POST') {
          if (room.host_id !== user.id || !await canHost()) return json({ error: 'Only this room’s approved host can advance the game.' }, 403);
          if (body.questionIndex !== room.question_index) return json({ error: 'The room has already advanced. Refresh the round.' }, 409);
          if (room.phase === 'finished') return json({ code });
          const challenge = JSON.parse(room.snapshot);
          if (room.phase === 'question' && phaseOf(room, Date.now(), challenge) !== 'reveal') return json({ error: 'Wait for the question timer to finish.' }, 409);
          if (room.phase === 'lobby') { const count = await db(env).prepare('SELECT count(*) AS count FROM players WHERE room_code = ?').bind(code).first(); if (!count.count) return json({ error: 'At least one player needs to join before you start.' }, 409); }
          const next = room.question_index + 1, finished = next >= challenge.questions.length;
          await db(env).prepare('UPDATE rooms SET phase = ?, question_index = ?, started_at = ? WHERE code = ? AND question_index = ? AND phase = ?').bind(finished ? 'finished' : 'question', finished ? room.question_index : next, finished ? room.started_at : Date.now(), code, room.question_index, room.phase).run(); return json({ code });
        }
        if (path === '/api/live/answer' && request.method === 'POST') {
          if (room.host_id === user?.id) return json({ error: 'The host runs the round; only players answer.' }, 403);
          if (!await playerOf(env, code, participant.id)) return json({ error: 'Join the room before answering.' }, 403);
          const challenge = JSON.parse(room.snapshot), q = challenge.questions[room.question_index];
          if (!q || !Number.isInteger(body.selected) || body.selected < 0 || body.selected >= q.options.length) return json({ error: 'Choose one valid answer.' }, 400);
          if (body.questionIndex !== room.question_index) return json({ error: 'This question has ended.' }, 409);
          const previous = await db(env).prepare('SELECT selected FROM answers WHERE room_code = ? AND user_id = ? AND question_index = ?').bind(code, participant.id, room.question_index).first();
          if (previous) return json({ accepted: true, selected: previous.selected });
          const receivedAt = answeredAt, elapsed = receivedAt - room.started_at;
          if (room.phase !== 'question' || elapsed < 0 || elapsed >= durationOf(challenge, room.question_index)) return json({ error: 'Time is up. Your answer arrived after the deadline.' }, 409);
          const correct = body.selected === q.correct, points = livePoints(elapsed, correct, durationOf(challenge, room.question_index));
          await db(env).prepare('INSERT INTO answers (id, room_code, user_id, question_index, selected, is_correct, points, elapsed_ms, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(room_code, user_id, question_index) DO NOTHING').bind(crypto.randomUUID(), code, participant.id, room.question_index, body.selected, correct ? 1 : 0, points, elapsed, new Date(receivedAt).toISOString()).run();
          const saved = await db(env).prepare('SELECT selected FROM answers WHERE room_code = ? AND user_id = ? AND question_index = ?').bind(code, participant.id, room.question_index).first(); return json({ accepted: true, selected: saved.selected });
        }
        if (path === '/api/live/results.csv' && request.method === 'GET') {
          if (room.host_id !== user.id || !await canHost()) return json({ error: 'Only this room’s approved host can export team results.' }, 403);
          if (room.phase !== 'finished') return json({ error: 'Finish the round before exporting results.' }, 409);
          const snapshot=JSON.parse(room.snapshot), scores=await reviewScores(env,code,snapshot.questions,await standings(env,code));
          const rows = [['Rank','Name','Email','Score','Correct','Room','Round','Week','Level','Format','Review correct','Review questions','Participant type'], ...scores.map(s => [s.rank,s.name,s.email,s.score,s.correct,code,room.title,snapshot.weekNumber || '',snapshot.level || '',snapshot.format || 'current',s.reviewCorrect ?? '',s.reviewTotal ?? '',s.participantType==='guest'?'Guest':'ChatGPT account'])];
          return new Response(rows.map(row => row.map(safeCsv).join(',')).join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="cnh-finance-${code}.csv"`, 'cache-control': 'no-store' } });
        }
        return json({ error: 'Not found.' }, 404);
      }
      if (path.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
      const asset = assets[['/', '/results', '/hosts', '/prepare', '/facts', '/competitors', '/decoder', '/drivers', '/vocabulary'].includes(path) ? '/index.html' : path];
      if (!asset) return new Response('Not found', { status: 404 });
      return new Response(asset.encoding === 'base64' ? Uint8Array.from(atob(asset.body), c => c.charCodeAt(0)) : asset.body, { headers: { 'content-type': asset.type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.openai.com" } });
    } catch (e) { console.error('Live round failed', path, e.message); return json({ error: 'The live round could not connect. Please retry; accepted answers are saved.' }, 503); }
  }
};
