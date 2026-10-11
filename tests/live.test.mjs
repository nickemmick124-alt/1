import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../scripts/local-db.mjs';
import worker, { livePoints } from '../dist/server/index.js';
import { weekKey, shiftWeek, challengeForWeek, publicChallenge, safeCsv } from '../src/domain.mjs';
import bank from '../src/challenges.json' with { type: 'json' };
import context from '../src/business-context.json' with { type: 'json' };
import questionLevels from '../src/question-levels.json' with { type: 'json' };
import beginnerRounds from '../src/beginner.json' with { type: 'json' };
import { levels, roundForLevel, withReview } from '../src/rounds.mjs';
import { capacityReadiness } from '../public/capacity.js';
import { resolveValueConnection, renderValueConnection } from '../public/values.js';
const origin = 'https://finance.example.test';
const host = { id: 'host', email: 'host@example.test' };
const fast = { id: 'fast', email: 'fast@example.test' }, slow = { id: 'slow', email: 'slow@example.test' }, wrong = { id: 'wrong', email: 'wrong@example.test' }, late = { id: 'late', email: 'late@example.test' };
function req(path, user, body, overrides = {}) {
  return new Request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(user ? { 'oai-authenticated-user-id': user.id, 'oai-authenticated-user-email': user.email } : {}), ...(body !== undefined ? { origin, 'content-type': 'application/json' } : {}), ...overrides }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
test('beginner pilot starts with eight approachable questions and gives private preparation after a full guest round', async t => {
  let clock=12000000; t.mock.method(Date,'now',()=>clock);
  const local=openDatabase(), env={DB:local.DB,OWNER_EMAIL:host.email};
  const call=(path,user,body,headers)=>worker.fetch(req(path,user,body,headers),env);
  try {
    assert.equal(beginnerRounds.length,2);
    for(const round of beginnerRounds) {
      assert.equal(round.questions.length,8);
      assert.deepEqual(round.questions.map(q=>q.stage),['Familiar situation','Familiar situation','Familiar situation','Business basic','Business basic','Business basic','CNH connection','CNH connection']);
      for(const q of round.questions) {
        assert(q.learning.definition && q.learning.lookFor && q.learning.prepare); assert.equal(q.options.length,4); assert(q.options[q.correct]);
        assert(q.valueConnection.why); assert(q.learning.links.some(link=>link.url==='/prepare#'+q.topic));
        assert((q.prompt+' '+q.options.join(' ')).split(/\s+/).length<=65);
      }
    }
    const session=await (await call('/api/session',null)).json(); assert.equal(session.beginnerRounds.length,2); assert(!JSON.stringify(session.beginnerRounds).includes('correct')); assert.equal(session.defaultBeginnerRound,0);
    const guide=await (await call('/api/learning',null)).json(); assert.equal(guide.topics.length,16); assert(!JSON.stringify(guide).includes('prompt')); assert(!JSON.stringify(guide).includes('options'));
    assert.equal((await call('/prepare',null)).status,200);
    const code=(await (await call('/api/live/create',host,{})).json()).code;
    const saved=await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first(), snapshot=JSON.parse(saved.snapshot);
    assert.equal(snapshot.track,'beginner'); assert.equal(snapshot.setId,'beginner-1-v1'); assert.equal(snapshot.questions.length,8);
    const joined=await call('/api/live/join',null,{code,name:'Pilot Guest'}), cookie=joined.headers.get('set-cookie').split(';')[0]; const headers={cookie};
    await call('/api/live/join',fast,{code,name:'Other Player'});
    await call('/api/live/advance',host,{code,questionIndex:-1});
    for(let i=0;i<8;i++) {
      const room=await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
      const live=await (await call('/api/live/room?code='+code,null,undefined,headers)).json();
      assert.equal(live.questionCount,8); assert.equal(live.questionDurationMs,40000); assert.equal(live.question.stage,snapshot.questions[i].stage); assert(!('learning' in live.question)); assert(!('learningReview' in live));
      clock=room.started_at+1000;
      if(i!==1) await call('/api/live/answer',null,{code,questionIndex:i,selected:i===0?(snapshot.questions[i].correct+1)%4:snapshot.questions[i].correct},headers);
      await call('/api/live/answer',fast,{code,questionIndex:i,selected:snapshot.questions[i].correct});
      clock=room.started_at+40000;
      const reveal=await (await call('/api/live/room?code='+code,null,undefined,headers)).json(); assert.deepEqual(reveal.question.learning,snapshot.questions[i].learning); assert(reveal.question.valueConnection.name);
      clock+=60000; const paused=await (await call('/api/live/room?code='+code,null,undefined,headers)).json(); assert.equal(paused.phase,'reveal'); assert.equal(paused.questionIndex,i);
      await call('/api/live/advance',host,{code,questionIndex:i});
    }
    const final=await (await call('/api/live/room?code='+code,null,undefined,headers)).json(); assert.equal(final.phase,'finished'); assert.equal(final.you.correct,6); assert.equal(final.learningReview.length,8); assert.deepEqual(final.learningReview.filter(item=>!item.correct).map(item=>item.learning.id),snapshot.questions.slice(0,2).map(q=>q.topic)); assert(!('results' in final));
    const other=await (await call('/api/live/room?code='+code,fast)).json(); assert(other.learningReview.every(item=>item.correct));
    const hostFinal=await (await call('/api/live/room?code='+code,host)).json(); assert.equal(hostFinal.results.length,2); assert(!('learningReview' in hostFinal));
    const rooms=await (await call('/api/live/rooms',host)).json(); assert.equal(rooms.rooms[0].track,'beginner'); assert.equal(rooms.rooms[0].questionCount,8);
    const replayCode=(await (await call('/api/live/create',host,{format:'replay',sourceCode:code})).json()).code;
    const replay=JSON.parse((await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(replayCode).first()).snapshot);
    assert.equal(replay.questions.length,8); assert.equal(replay.questions.filter(q=>q.reviewOf).length,8); assert.deepEqual(replay.questions.map(q=>q.learning),snapshot.questions.map(q=>q.learning));
    for(const beginnerRound of [0,1]) {
      const response=await call('/api/live/create',host,{track:'beginner',beginnerRound,format:'mixed',sourceCode:code}); assert.equal(response.status,200);
      const mixedCode=(await response.json()).code;
      const mixed=JSON.parse((await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(mixedCode).first()).snapshot); assert.equal(mixed.questions.length,8); assert.equal(mixed.questions.filter(q=>q.reviewOf).length,2); assert.equal(new Set(mixed.questions.map(q=>q.id)).size,8);
    }
    assert.equal((await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first()).snapshot,saved.snapshot);
    assert.equal((await call('/api/live/create',host,{track:'beginner',beginnerRound:99})).status,400);
  } finally {local.close();}
});
test('guests play a complete round without an account, reconnect securely, and never gain hosting rights', async t => {
  let clock=9000000; t.mock.method(Date,'now',()=>clock);
  const local=openDatabase(), env={DB:local.DB,OWNER_EMAIL:host.email};
  const call=(path,user,body,headers)=>worker.fetch(req(path,user,body,headers),env);
  try {
    const code=(await (await call('/api/live/create',host,{round:0})).json()).code;
    const other=(await (await call('/api/live/create',host,{round:1})).json()).code;
    const joined=await call('/api/live/join',null,{code,name:' Guest Tester ',userId:host.id,email:host.email,isOwner:true});
    assert.equal(joined.status,200);
    const setCookie=joined.headers.get('set-cookie'), cookie=setCookie.split(';')[0], token=cookie.split('=')[1];
    assert.match(cookie,/^__Host-cnh_guest=[a-f0-9]{64}$/);
    for(const flag of ['Path=/','Secure','HttpOnly','SameSite=Lax','Max-Age=2592000']) assert(setCookie.includes(flag));
    const joinData=await joined.json(); assert.deepEqual(joinData,{code,guest:{name:'Guest Tester'}}); assert(!JSON.stringify(joinData).includes(token));
    const sessionRow=await env.DB.prepare('SELECT * FROM guest_sessions').first(); assert.notEqual(sessionRow.token_hash,token); assert.match(sessionRow.token_hash,/^[a-f0-9]{64}$/);
    const player=await env.DB.prepare('SELECT * FROM players WHERE room_code = ?').bind(code).first();
    assert.equal(player.user_id,sessionRow.user_id); assert.notEqual(player.user_id,host.id); assert.equal(player.email,''); assert.equal(player.participant_type,'guest');
    const headers={cookie};
    const session=await (await call('/api/session',null,undefined,headers)).json();
    assert.equal(session.user,null); assert.equal(session.canHost,false); assert.equal(session.isOwner,false); assert.deepEqual(session.guest,{name:'Guest Tester'}); assert(!JSON.stringify(session).includes(sessionRow.user_id));
    assert.equal((await call('/api/live/join',null,{code,name:'Changed name'},headers)).status,200);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM players WHERE room_code = ?').bind(code).first()).count,1);
    assert.equal((await call('/api/live/room?code='+other,null,undefined,headers)).status,403);
    assert.equal((await call('/api/live/answer',null,{code:other,questionIndex:0,selected:0},headers)).status,403);
    for(const [path,body] of [['/api/live/create',{}],['/api/live/advance',{code,questionIndex:-1}],['/api/live/hosts/grant',{email:'other@example.test'}],['/api/live/hosts/revoke',{email:host.email}]]) assert.equal((await call(path,null,body,headers)).status,401);
    for(const path of ['/api/live/rooms','/api/live/hosts','/api/live/results.csv?code='+code]) assert.equal((await call(path,null,undefined,headers)).status,401);
    assert.equal((await call('/api/live/create',fast,{},headers)).status,403);
    const signedSession=await (await call('/api/session',fast,undefined,headers)).json(); assert.equal(signedSession.canHost,false); assert.equal(signedSession.guest,null);
    assert.equal((await call('/api/live/join',slow,{code,name:'Signed-in Player'})).status,200);
    const snapshot=JSON.parse((await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first()).snapshot);
    for(let index=0;index<5;index++) {
      const start=clock; assert.equal((await call('/api/live/advance',host,{code,questionIndex:index-1},headers)).status,200);
      clock=start+1000;
      const question=await (await call('/api/live/room?code='+code,null,undefined,headers)).json();
      assert.equal(question.host,false); assert.equal(question.you.name,'Guest Tester'); assert.equal(question.you.participantType,'guest');
      assert(!('correct' in question.question)); assert(!('explanation' in question.question)); assert(!('results' in question));
      const correct=snapshot.questions[index].correct;
      const first=await call('/api/live/answer',null,{code,questionIndex:index,selected:correct,points:999999},headers); assert.equal(first.status,200);
      const retry=await (await call('/api/live/answer',null,{code,questionIndex:index,selected:(correct+1)%4},headers)).json(); assert.equal(retry.selected,correct);
      // A refresh, and optional later account sign-in in this browser, keep the guest entry and answer.
      assert.equal((await call('/api/live/join',null,{code,name:'Guest Tester'},headers)).status,200);
      const reloaded=await (await call('/api/live/room?code='+code,fast,undefined,headers)).json(); assert.equal(reloaded.ownAnswer.selected,correct); assert.equal(reloaded.you.participantType,'guest');
      assert.equal((await call('/api/live/room?code='+code,null)).status,401);
      clock=start+40000;
      const reveal=await (await call('/api/live/room?code='+code,null,undefined,headers)).json(); assert.equal(reveal.ownAnswer.points,988); assert.equal(reveal.question.correct,correct); assert(reveal.question.valueConnection.name);
      assert(!JSON.stringify(reveal.top3).includes(slow.email)); assert(!JSON.stringify(reveal).includes(sessionRow.user_id));
    }
    assert.equal((await call('/api/live/advance',host,{code,questionIndex:4})).status,200);
    const final=await (await call('/api/live/room?code='+code,null,undefined,headers)).json(); assert.equal(final.phase,'finished'); assert.equal(final.you.score,4940); assert.equal(final.you.correct,5); assert(!('results' in final));
    const hostResult=await (await call('/api/live/room?code='+code,host)).json(); assert.equal(hostResult.results.find(p=>p.participantType==='guest').email,''); assert.equal(hostResult.results.find(p=>p.participantType==='account').email,slow.email);
    const csv=await (await call('/api/live/results.csv?code='+code,host)).text(); assert(csv.includes('Participant type')); assert(csv.includes('Guest Tester')); assert(csv.includes('"Guest"')); assert(csv.includes('"ChatGPT account"'));
    assert.equal((await call('/api/live/join',null,{code:other,name:'Guest New Round'},headers)).status,200);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM guest_sessions').first()).count,1);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM players WHERE user_id = ?').bind(sessionRow.user_id).first()).count,2);
    assert.equal((await (await call('/api/live/room?code='+code,null,undefined,headers)).json()).you.name,'Guest Tester');
  } finally { local.close(); }
});
test('late arrivals join the current decision, keep its deadline, and score only answers they submit', async t => {
  let clock=20000000; t.mock.method(Date,'now',()=>clock);
  const local=openDatabase(),env={DB:local.DB,OWNER_EMAIL:host.email};
  const call=(path,user,body,headers)=>worker.fetch(req(path,user,body,headers),env);
  try {
    const code=(await (await call('/api/live/create',host,{round:0})).json()).code;
    await call('/api/live/join',fast,{code,name:'Early Player'});
    const snapshot=JSON.parse((await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first()).snapshot);
    await call('/api/live/advance',host,{code,questionIndex:-1});
    clock+=1000; await call('/api/live/answer',fast,{code,questionIndex:0,selected:snapshot.questions[0].correct});
    clock+=39000; await call('/api/live/advance',host,{code,questionIndex:0});
    const started=clock;
    clock=started+20000;
    const joined=await call('/api/live/join',null,{code,name:'Late Guest'});
    assert.equal(joined.status,200);
    assert.deepEqual((await joined.json()).entry,{kind:'late',phase:'question',questionIndex:1,questionCount:5});
    const cookie=joined.headers.get('set-cookie').split(';')[0],headers={cookie};
    const current=await (await call('/api/live/room?code='+code,null,undefined,headers)).json();
    assert.equal(current.questionIndex,1); assert.equal(current.deadline,started+40000); assert.equal(current.you.score,0); assert.equal(current.ownAnswer,null); assert(!('correct' in current.question));
    assert.equal((await call('/api/live/answer',null,{code,questionIndex:0,selected:snapshot.questions[0].correct},headers)).status,409);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM answers WHERE user_id IN (SELECT user_id FROM guest_sessions)').first()).count,0);
    clock=started+30000;
    assert.equal((await call('/api/live/answer',null,{code,questionIndex:1,selected:snapshot.questions[1].correct},headers)).status,200);
    const returning=await (await call('/api/live/join',null,{code,name:'Changed Name'},headers)).json(); assert.deepEqual(returning.entry,{kind:'rejoin'}); assert.equal(returning.guest.name,'Late Guest');
    const signedIn=await (await call('/api/live/room?code='+code,slow,undefined,headers)).json(); assert.equal(signedIn.ownAnswer.selected,snapshot.questions[1].correct); assert.equal(signedIn.you.participantType,'guest');
    const accountJoin=await call('/api/live/join',wrong,{code,name:'Late Account'}); assert.equal(accountJoin.status,200); assert.equal((await accountJoin.json()).entry.kind,'late');
    // A matching display name in another browser cannot recover someone else's answer or points.
    const sameName=await call('/api/live/join',null,{code,name:'Late Guest'}); assert.equal(sameName.status,200);
    const secondHeaders={cookie:sameName.headers.get('set-cookie').split(';')[0]}; assert.notEqual(secondHeaders.cookie,cookie);
    const separate=await (await call('/api/live/room?code='+code,null,undefined,secondHeaders)).json(); assert.equal(separate.you.score,0); assert.equal(separate.ownAnswer,null);
    clock=started+40000;
    const revealJoin=await call('/api/live/join',slow,{code,name:'Discussion Arrival'}); assert.equal(revealJoin.status,200); assert.equal((await revealJoin.json()).entry.phase,'reveal');
    assert.equal((await call('/api/live/answer',slow,{code,questionIndex:1,selected:snapshot.questions[1].correct})).status,409);
    const revealed=await (await call('/api/live/room?code='+code,null,undefined,headers)).json(); assert.equal(revealed.you.score,625); assert.equal(revealed.you.correct,1); assert.equal(revealed.ownAnswer.points,625);
    await call('/api/live/advance',host,{code,questionIndex:1});
    const next=await (await call('/api/live/room?code='+code,null,undefined,headers)).json(); assert.equal(next.questionIndex,2); assert.equal(next.ownAnswer,null); assert.equal(next.you.score,625);
    clock+=1000; await call('/api/live/answer',wrong,{code,questionIndex:2,selected:snapshot.questions[2].correct});
    for(let index=2;index<5;index++) { clock+=40000; await call('/api/live/advance',host,{code,questionIndex:index}); }
    const final=await (await call('/api/live/room?code='+code,host)).json(); assert.equal(final.phase,'finished'); assert.equal(final.results.length,5);
    const guestResults=final.results.filter(p=>p.name==='Late Guest'); assert.deepEqual(guestResults.map(p=>p.score).sort((a,b)=>a-b),[0,625]);
    assert.equal(final.results.find(p=>p.name==='Late Account').score,988); assert.equal(final.results.find(p=>p.name==='Discussion Arrival').score,0);
    assert.equal((await call('/api/live/join',null,{code,name:'After Finish'})).status,409);
    assert.equal((await call('/api/live/join',late,{code,name:'After Finish'})).status,409);
    assert.deepEqual((await (await call('/api/live/join',null,{code,name:'Late Guest'},headers)).json()).entry,{kind:'rejoin'});
    assert.equal((await (await call('/api/live/room?code='+code,null,undefined,headers)).json()).you.score,625);
  } finally {local.close();}
});
test('joins at the final reveal wait for results and a completion during registration leaves no new player', async t => {
  let clock=40000000; t.mock.method(Date,'now',()=>clock);
  const local=openDatabase(),env={DB:local.DB,OWNER_EMAIL:host.email};
  const call=(path,user,body,headers)=>worker.fetch(req(path,user,body,headers),env);
  try {
    const code=(await (await call('/api/live/create',host,{track:'leadership'})).json()).code;
    await call('/api/live/join',fast,{code,name:'Early Player'});
    await call('/api/live/advance',host,{code,questionIndex:-1});
    const snapshot=JSON.parse((await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first()).snapshot);
    clock+=12000;
    const halfway=await call('/api/live/join',slow,{code,name:'Leadership Late'}); assert.equal(halfway.status,200);
    const state=await (await call('/api/live/room?code='+code,slow)).json(); assert.equal(state.deadline,40000000+25000); assert.equal(state.questionDurationMs,25000);
    for(let index=0;index<snapshot.questions.length-1;index++) { clock+=25000; await call('/api/live/advance',host,{code,questionIndex:index}); }
    clock+=25000;
    const finalReveal=await call('/api/live/join',null,{code,name:'Last Arrival'}); assert.equal(finalReveal.status,200);
    const entry=(await finalReveal.json()).entry; assert.equal(entry.phase,'reveal'); assert.equal(entry.questionIndex,snapshot.questions.length-1);
    const headers={cookie:finalReveal.headers.get('set-cookie').split(';')[0]};
    assert.equal((await call('/api/live/answer',null,{code,questionIndex:entry.questionIndex,selected:0},headers)).status,409);
    const beforePlayers=(await env.DB.prepare('SELECT count(*) AS count FROM players').first()).count;
    const beforeSessions=(await env.DB.prepare('SELECT count(*) AS count FROM guest_sessions').first()).count;
    const racingEnv={...env,DB:{prepare(sql) {
      const statement=env.DB.prepare(sql);
      if(!sql.startsWith('INSERT INTO players')) return statement;
      const wrapper={bind(...args){statement.bind(...args);return wrapper;},async run(){await env.DB.prepare('UPDATE rooms SET phase = ? WHERE code = ?').bind('finished',code).run();return statement.run();}};
      return wrapper;
    }}};
    const rejected=await worker.fetch(req('/api/live/join',null,{code,name:'Closing Arrival'}),racingEnv); assert.equal(rejected.status,409); assert.equal(rejected.headers.get('set-cookie'),null);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM players').first()).count,beforePlayers);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM guest_sessions').first()).count,beforeSessions);
    assert.equal((await call('/api/live/join',null,{code,name:'Last Arrival'},headers)).status,200);
    const final=await (await call('/api/live/room?code='+code,null,undefined,headers)).json(); assert.equal(final.phase,'finished'); assert.equal(final.you.score,0);
  } finally {local.close();}
});
test('guest join validates code and name, rejects forged or expired credentials, and respects room capacity', async t => {
  let clock=50000000; t.mock.method(Date,'now',()=>clock);
  const local=openDatabase(),env={DB:local.DB,OWNER_EMAIL:host.email};
  const call=(path,user,body,headers)=>worker.fetch(req(path,user,body,headers),env);
  try {
    const code=(await (await call('/api/live/create',host,{round:0})).json()).code;
    assert.equal((await call('/api/live/join',null,{code:'INVALID',name:'Tester'})).status,400);
    assert.equal((await call('/api/live/join',null,{code:'ZZZZZZ',name:'Tester'})).status,404);
    for(const name of ['', '   ', 'a'.repeat(41), 'bad\u0000name', 'bad\u007fname']) assert.equal((await call('/api/live/join',null,{code,name})).status,400);
    assert.equal((await call('/api/live/join',null,{code,name:'Tester'},{origin:'https://other.example.test'})).status,403);
    assert.equal((await call('/api/live/join',null,{code,name:'Tester'},{'content-type':'text/plain'})).status,415);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM guest_sessions').first()).count,0);
    const joined=await call('/api/live/join',null,{code,name:'Tester'}), cookie=joined.headers.get('set-cookie').split(';')[0];
    const headers={cookie};
    for(const cookie of ['', '__Host-cnh_guest=bad', '__Host-cnh_guest='+ '0'.repeat(64), headers.cookie+'; '+headers.cookie]) {
      assert.equal((await call('/api/live/room?code='+code,null,undefined,{cookie})).status,401);
      assert.equal((await call('/api/live/answer',null,{code,questionIndex:0,selected:0},{cookie})).status,401);
    }
    assert.equal((await call('/api/live/answer',null,{code,questionIndex:0,selected:0},{...headers,origin:'https://other.example.test'})).status,403);
    for(let i=1;i<100;i++) await env.DB.prepare('INSERT INTO players (id, room_code, user_id, name, email, joined_at) VALUES (?, ?, ?, ?, ?, ?)').bind('capacity-'+i,code,'capacity-'+i,'Player '+i,'',new Date(clock).toISOString()).run();
    assert.equal((await call('/api/live/join',null,{code,name:'One more'})).status,409);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM guest_sessions').first()).count,1);
    assert.equal((await call('/api/live/join',null,{code,name:'Tester'},headers)).status,200);
    const oldPlayer=(await env.DB.prepare('SELECT user_id FROM guest_sessions').first()).user_id;
    await call('/api/live/advance',host,{code,questionIndex:-1});
    const correct=JSON.parse((await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first()).snapshot).questions[0].correct;
    clock+=1000; await call('/api/live/answer',null,{code,questionIndex:0,selected:correct},headers);
    assert.equal((await call('/api/live/join',null,{code,name:'Active room overflow'})).status,409);
    assert.deepEqual((await (await call('/api/live/join',null,{code,name:'Tester'},headers)).json()).entry,{kind:'rejoin'});
    clock+=30*24*60*60*1000;
    const expired=await (await call('/api/session',null,undefined,headers)).json(); assert.equal(expired.guest,null); assert.equal(expired.canHost,false);
    assert.equal((await call('/api/live/room?code='+code,null,undefined,headers)).status,401);
    assert.equal((await call('/api/live/answer',null,{code,questionIndex:0,selected:correct},headers)).status,401);
    assert.equal((await call('/api/live/join',null,{code,name:'Tester'},headers)).status,409);
    const next=(await (await call('/api/live/create',host,{round:1})).json()).code;
    const renewed=await call('/api/live/join',null,{code:next,name:'Tester'},headers); assert.equal(renewed.status,200); assert.notEqual(renewed.headers.get('set-cookie').split(';')[0],cookie);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM guest_sessions WHERE user_id = ?').bind(oldPlayer).first()).count,0);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM players WHERE user_id = ?').bind(oldPlayer).first()).count,1);
    assert.equal((await env.DB.prepare('SELECT count(*) AS count FROM answers WHERE user_id = ?').bind(oldPlayer).first()).count,1);
    const result=await (await call('/api/live/room?code='+code,host)).json(); assert.equal(result.top3[0].name,'Tester'); assert.equal(result.top3[0].score,988);
  } finally { local.close(); }
});
test('speed rewards only correct answers inside the 40-second window', () => {
  assert.equal(livePoints(0, true), 1000); assert.equal(livePoints(1000, true), 988); assert.equal(livePoints(20000, true), 750); assert.equal(livePoints(36000, true), 550);
  assert.equal(livePoints(40000, true), 0); assert.equal(livePoints(-1, true), 0); assert.equal(livePoints(1, false), 0);
});
test('week rollover and CSV exports are predictable', () => {
  assert.equal(weekKey(new Date('2026-10-05T00:00:00Z')), '2026-10-05');
  assert.equal(weekKey(new Date('2026-10-04T23:59:59Z')), '2026-09-28');
  assert.equal(safeCsv('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
  assert.equal(challengeForWeek([bank[0]], '2026-09-28').questions[0].prompt, challengeForWeek([bank[0]], '2026-10-05').questions[0].prompt);
});
test('weekly rotations never change reported facts or which answer is correct', () => {
  for (const original of bank) {
    assert.equal(original.factual, true); assert.equal(original.questions.length, 5);
    for (let i = 0; i < 40; i++) {
      const c = challengeForWeek([original], shiftWeek('2026-09-28', i));
      assert.equal(c.story, original.story); assert.deepEqual(c.facts, original.facts);
      c.questions.forEach((q,j) => { assert.equal(q.prompt,original.questions[j].prompt); assert.equal(q.explanation,original.questions[j].explanation); assert.equal(q.options[q.correct],original.questions[j].options[original.questions[j].correct]); });
    }
  }
  assert.notDeepEqual(challengeForWeek([bank[0]],'2026-09-28').questions[0].options,challengeForWeek([bank[0]],'2026-10-05').questions[0].options);
});
test('capacity check finds the constraint, yield loss, ties, and impossible inputs', () => {
  const input={demand:90,assembly:120,test:100,materials:115,yield:80};
  const result=capacityReadiness(input); assert.equal(result.good,80); assert.equal(result.gap,10); assert.equal(result.requiredGross,113); assert.deepEqual(result.bottlenecks,['Final test']); assert.equal(result.ready,false);
  assert.equal(capacityReadiness({...input,demand:75}).surplus,5);
  assert.deepEqual(capacityReadiness({...input,assembly:100}).bottlenecks,['Assembly','Final test']);
  assert.deepEqual(capacityReadiness({...input,materials:50}).bottlenecks,['Material availability']);
  assert.equal(capacityReadiness({...input,materials:0}).load,null);
  assert.equal(capacityReadiness({...input,demand:0}).ready,true);
  for(const invalid of [{...input,yield:0},{...input,yield:101},{...input,test:-1},{...input,assembly:''},{...input,demand:1.5},{...input,demand:Infinity}]) assert(capacityReadiness(invalid).error);
});
test('public reference returns dated observations without the live answer bank', async () => {
  const response=await worker.fetch(req('/api/business-context',null),{}); assert.equal(response.status,200);
  const data=await response.json(); assert.equal(data.verifiedOn,'2026-10-04'); assert(!('questions' in data));
  const industrial=data.periods[0].segments.find(s=>s.id==='industrial'); assert.equal(industrial.metrics[0].current,4143);
  assert.equal(data.commodities.items[0].price,4.8); assert.equal(data.commodities.type,'USDA season-average farm-price forecasts');
  assert.equal(data.agricultureBridge.start+data.agricultureBridge.items.reduce((sum,i)=>sum+i.value,0),data.agricultureBridge.end);
  for(const round of bank) for(const q of round.questions){ assert(q.basis); assert(q.discussion); for(const id of q.sourceIds)assert(context.sources[id]); }
  assert.deepEqual(data.values.items.map(v=>v.name), ['Built Around Customers','We Go Beyond','Make It Simple','Win As One','You Matter']);
  assert(!('topicDefaults' in data.values));
  for(const path of ['/','/decoder','/drivers','/vocabulary','/business-app.js','/capacity.js','/values.js','/business-style.css']) assert.equal((await worker.fetch(req(path,null),{})).status,200);
});
test('all decisions have a sourced value connection, with useful fallbacks for future questions', () => {
  for (const round of [...bank, ...questionLevels]) {
    for (const q of round.questions) {
      const connection=resolveValueConnection(q,context.values);
      assert(context.values.items.some(v=>v.id===connection.valueId));
      assert(connection.why.trim());
      assert.equal(connection.source.url,'https://www.cnh.com/Our-Company');
      const html=renderValueConnection(connection); assert(html.includes(connection.name)); assert(html.includes('CNH VALUE CONNECTION'));
    }
    assert(publicChallenge(round).questions.every(q=>!('valueConnection' in q)));
  }
  const topicDefault=resolveValueConnection({topic:'downcycle'},context.values); assert.equal(topicDefault.valueId,'you-matter');
  const future=resolveValueConnection({topic:'a-new-topic'},context.values); assert.equal(future.valueId,'make-it-simple'); assert(future.why);
  const repeated=resolveValueConnection({topic:'a-new-topic'},context.values); assert.deepEqual(future,repeated);
});
test('old saved rounds get value connections without rewriting their results or question snapshots', async () => {
  const local=openDatabase(), env={DB:local.DB,OWNER_EMAIL:host.email};
  try {
    const legacy=structuredClone(bank[2]); legacy.questions.forEach(q=>delete q.valueConnection);
    const snapshot=JSON.stringify(legacy);
    await env.DB.prepare('INSERT INTO rooms (code, host_id, title, snapshot, phase, question_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind('ABC234',host.id,legacy.title,snapshot,'finished',4,new Date().toISOString()).run();
    const response=await worker.fetch(req('/api/live/room?code=ABC234',host),env); assert.equal(response.status,200);
    const result=await response.json(); assert.equal(result.review.length,5); assert(result.review.every(q=>q.valueConnection?.name&&q.valueConnection?.why));
    assert.equal(result.question.valueConnection.valueId,'you-matter');
    const saved=await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind('ABC234').first(); assert.equal(saved.snapshot,snapshot);
  } finally { local.close(); }
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
    const visible = await (await call('/api/live/room?code=' + code, fast)).json(); assert.equal(visible.phase, 'question'); assert.equal(visible.deadline, clock + 40000); assert.equal(visible.questionDurationMs, 40000); assert(!('correct' in visible.question)); assert(!('explanation' in visible.question)); assert(!('valueConnection' in visible.question)); assert(snapshot.questions.every(q=>q.valueConnection?.name&&q.valueConnection?.why));
    clock += 1000;
    const submission = { code, questionIndex: 0, selected: correct, points: 5000, elapsed: 0 };
    assert.equal((await call('/api/live/answer', fast, submission)).status, 200);
    const locked = await (await call('/api/live/answer', fast, { ...submission, selected: (correct + 1) % 4 })).json(); assert.equal(locked.selected, correct);
    assert.equal((await call('/api/live/answer', wrong, { ...submission, selected: (correct + 1) % 4 })).status, 200);
    const unrevealed = await (await call('/api/live/room?code=' + code, fast)).json(); assert.equal(unrevealed.you.score, 0); assert(!('points' in unrevealed.ownAnswer)); assert(unrevealed.top3.every(p => !('email' in p)));
    clock = room.started_at + 20000;
    const halfway = await (await call('/api/live/room?code=' + code, slow)).json(); assert.equal(halfway.phase, 'question'); assert(!('correct' in halfway.question));
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: 0 })).status, 409);
    clock = room.started_at + 36000; assert.equal((await call('/api/live/answer', slow, submission)).status, 200);
    clock = room.started_at + 39999;
    const stillOpen = await (await call('/api/live/room?code=' + code, slow)).json(); assert.equal(stillOpen.phase, 'question'); assert(!('correct' in stillOpen.question)); assert(!('valueConnection' in stillOpen.question));
    assert.equal((await call('/api/live/advance', host, { code, questionIndex: 0 })).status, 409);
    clock = room.started_at + 40000; assert.equal((await call('/api/live/answer', late, submission)).status, 409);
    const revealed = await (await call('/api/live/room?code=' + code, fast)).json(); assert.equal(revealed.phase, 'reveal'); assert.equal(revealed.question.correct, correct); assert.deepEqual(revealed.question.valueConnection,snapshot.questions[0].valueConnection); assert.equal(revealed.ownAnswer.points, 988); assert.equal(revealed.top3[0].name, 'fast'); assert.equal(revealed.top3[1].score, 550); assert.equal(revealed.top3[2].score, 0);
    const lateJoin=await call('/api/live/join', { id: 'new', email: 'new@example.test' }, { code, name: 'new' });
    assert.equal(lateJoin.status,200); assert.equal((await lateJoin.json()).entry.phase,'reveal');
    for (let i = 0; i < snapshot.questions.length; i++) {
      const current = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
      clock = current.started_at + 40000;
      assert.equal((await call('/api/live/advance', host, { code, questionIndex: current.question_index })).status, 200);
    }
    const final = await (await call('/api/live/room?code=' + code, host)).json(); assert.equal(final.phase, 'finished'); assert.equal(final.results.length, 5); assert.equal(final.results.find(p=>p.name==='new').score,0); assert.equal(final.top3.length, 3); assert.equal(final.review.length, 5); final.review.forEach((q,i)=>assert.deepEqual(q.valueConnection,snapshot.questions[i].valueConnection));
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
    const score = await env.DB.prepare('SELECT points FROM answers').first(); assert.equal(score.points, 975);
  } finally { local.close(); }
});

test('the library contains 12 distinct sets with 60 stable, sourced, short questions', () => {
  const ids=new Set(), prompts=new Set();
  for(let index=0;index<bank.length;index++) for(const level of levels) {
    const round=roundForLevel(bank,questionLevels,index,level.id);
    assert.equal(round.questions.length,5); assert.equal(round.weekNumber,index+1); assert.equal(round.level,level.id);
    assert.equal(round.factual,true);
    for(const q of round.questions) {
      assert(q.id); assert(!ids.has(q.id)); ids.add(q.id);
      assert(!prompts.has(q.prompt)); prompts.add(q.prompt);
      assert.equal(q.options.length,4); assert(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4);
      assert(q.explanation&&q.discussion&&q.basis&&q.valueConnection?.why);
      for(const id of q.sourceIds) assert(context.sources[id]);
      assert((' '+q.prompt+' '+q.options.join(' ')).trim().split(/\s+/).length<=65);
    }
  }
  assert.equal(ids.size,60);
});

test('every week and level can be hosted, without exposing the answer bank', async () => {
  const local=openDatabase(), env={DB:local.DB,OWNER_EMAIL:host.email};
  try {
    const session=await (await worker.fetch(req('/api/session',host),env)).json();
    assert.equal(session.questionSetCount,12); assert.equal(session.questionCount,60); assert.equal(session.levels.length,3); assert.equal(session.rounds.length,4);
    assert(!JSON.stringify(session).includes('explanation'));
    for(let round=0;round<4;round++) for(const level of levels) {
      const response=await worker.fetch(req('/api/live/create',host,{round,level:level.id}),env); assert.equal(response.status,200);
      const {code}=await response.json(), stored=await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first(), snapshot=JSON.parse(stored.snapshot);
      assert.equal(snapshot.level,level.id); assert.equal(snapshot.weekNumber,round+1); assert.equal(snapshot.questions.length,5);
      assert(snapshot.questions.every(q=>q.valueConnection?.name));
    }
    for(const body of [{level:'expert'},{round:99},{format:'unexpected'},{format:'mixed'},{format:'replay',sourceCode:'NOPE'}]) assert.equal((await worker.fetch(req('/api/live/create',host,body),env)).status,400);
    assert.equal((await worker.fetch(req('/api/live/create',fast,{round:1,level:'stretch'}),env)).status,403);
  } finally {local.close();}
});

test('review composition also avoids duplicate questions when revisiting the same set', () => {
  const current=roundForLevel(bank,questionLevels,0,'foundation');
  const mixed=withReview(current,current,{code:'ABC234',title:current.title,created_at:'2026-10-01T10:00:00Z'},()=>0.25);
  assert.equal(mixed.questions.length,5); assert.equal(mixed.questions.filter(q=>q.reviewOf).length,2);
  assert.equal(new Set(mixed.questions.map(q=>q.prompt)).size,5);
  assert.equal(mixed.reviewSource.code,'ABC234');
});

test('archive replay and mixed review preserve old content and enforce ownership', async t => {
  let clock=5000000; t.mock.method(Date,'now',()=>clock);
  const local=openDatabase(), env={DB:local.DB,OWNER_EMAIL:host.email};
  const call=(path,user,body)=>worker.fetch(req(path,user,body),env);
  try {
    const sourceCode=(await (await call('/api/live/create',host,{round:0,level:'foundation'})).json()).code;
    assert.equal((await call('/api/live/create',host,{format:'replay',sourceCode})).status,409);
    const source=await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(sourceCode).first();
    const old=JSON.parse(source.snapshot);
    old.questions[0].prompt='Archived question wording preserved after future content updates.';
    old.questions[0].explanation='Archived explanation kept exactly as the earlier session saved it.';
    old.questions[0].valueConnection.name='Archived value label';
    const original=JSON.stringify(old);
    await env.DB.prepare('UPDATE rooms SET phase = ?, question_index = ?, snapshot = ? WHERE code = ?').bind('finished',4,original,sourceCode).run();
    assert.equal((await call('/api/live/create',fast,{format:'replay',sourceCode})).status,403);
    assert.equal((await call('/api/live/create',{id:'other-owner-id',email:host.email},{format:'replay',sourceCode})).status,403);
    const replayResponse=await call('/api/live/create',host,{format:'replay',sourceCode}); assert.equal(replayResponse.status,200);
    const replayCode=(await replayResponse.json()).code; assert.notEqual(replayCode,sourceCode);
    const replay=JSON.parse((await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(replayCode).first()).snapshot);
    assert.equal(replay.format,'replay'); assert.equal(replay.replayOf,sourceCode);
    replay.questions.forEach((q,index)=>{
      assert.equal(q.prompt,old.questions[index].prompt); assert.equal(q.explanation,old.questions[index].explanation);
      assert.equal(q.options[q.correct],old.questions[index].options[old.questions[index].correct]);
      assert.deepEqual(q.sources,old.questions[index].sources); assert.deepEqual(q.valueConnection,old.questions[index].valueConnection);
      assert.equal(q.reviewOf.code,sourceCode); assert.equal(q.reviewOf.questionIndex,index);
    });
    const response=await call('/api/live/create',host,{round:2,level:'apply',format:'mixed',sourceCode}); assert.equal(response.status,200);
    const code=(await response.json()).code, snapshot=JSON.parse((await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first()).snapshot);
    assert.equal(snapshot.format,'mixed'); assert.equal(snapshot.questions.filter(q=>q.reviewOf).length,2); assert.equal(new Set(snapshot.questions.map(q=>q.prompt)).size,5);
    for(const q of snapshot.questions.filter(q=>q.reviewOf)) {
      const originalQ=old.questions[q.reviewOf.questionIndex]; assert.equal(q.prompt,originalQ.prompt); assert.deepEqual(q.sources,originalQ.sources);
      assert.equal(q.options[q.correct],originalQ.options[originalQ.correct]);
    }
    await call('/api/live/join',fast,{code,name:'fast'}); await call('/api/live/advance',host,{code,questionIndex:-1});
    for(let i=0;i<5;i++) {
      const room=await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
      const before=await (await call('/api/live/room?code='+code,fast)).json(); assert(!('reviewOf' in before.question)); assert(!('explanation' in before.question));
      clock=room.started_at+1000;
      assert.equal((await call('/api/live/answer',fast,{code,questionIndex:i,selected:snapshot.questions[i].correct})).status,200);
      clock=room.started_at+40000;
      assert.equal((await call('/api/live/advance',host,{code,questionIndex:i})).status,200);
    }
    const final=await (await call('/api/live/room?code='+code,host)).json();
    assert.equal(final.reviewCount,2); assert.equal(final.results[0].reviewCorrect,2); assert.equal(final.results[0].reviewTotal,2); assert.equal(final.results[0].correct,5);
    const playerFinal=await (await call('/api/live/room?code='+code,fast)).json(); assert.equal(playerFinal.you.reviewCorrect,2); assert(!('results' in playerFinal));
    const csv=await (await call('/api/live/results.csv?code='+code,host)).text(); assert(csv.includes('Review correct')); assert(csv.includes('"apply","mixed","2","2"'));
    const originalAfter=await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(sourceCode).first(); assert.equal(originalAfter.snapshot,original);
    const history=await (await call('/api/live/rooms',host)).json(); assert(history.rooms.some(room=>room.code===code&&room.level==='apply'&&room.format==='mixed'));
    assert(!JSON.stringify(history).includes('Archived explanation'));
  } finally {local.close();}
});

test('only the owner manages hosts; approved accounts can run their own rounds and revocation takes effect', async t => {
  let clock=7000000; t.mock.method(Date,'now',()=>clock);
  const local=openDatabase(),env={DB:local.DB,OWNER_EMAIL:host.email};
  const matilda={id:'matilda-test',email:'matilda@example.test'};
  const call=(path,user,body,headers)=>worker.fetch(req(path,user,body,headers),env);
  try {
    assert.equal((await call('/api/live/hosts',null)).status,401);
    assert.equal((await call('/api/live/hosts',fast)).status,403);
    assert.equal((await call('/api/live/hosts/grant',fast,{email:fast.email})).status,403);
    assert.equal((await call('/api/live/create',matilda,{})).status,403);
    const before=await (await call('/api/session',matilda)).json(); assert.equal(before.role,'player'); assert.equal(before.canHost,false);
    for(const body of [{email:'wrong'},{email:host.email},{email:matilda.email,name:'a'.repeat(81)},{email:matilda.email,name:'bad\nname'}]) assert.equal((await call('/api/live/hosts/grant',host,body)).status,400);
    assert.equal((await call('/api/live/hosts/grant',host,{email:matilda.email},{origin:'https://wrong.test'})).status,403);
    const grant=await call('/api/live/hosts/grant',host,{email:'  MATILDA@EXAMPLE.TEST  ',name:'Matilda'}); assert.equal(grant.status,200);
    assert.equal((await grant.json()).email,matilda.email);
    assert.equal((await call('/api/live/hosts/grant',host,{email:matilda.email,name:'Matilda'})).status,200);
    const count=await env.DB.prepare('SELECT count(*) AS n FROM host_access').first(); assert.equal(count.n,1);
    const list=await (await call('/api/live/hosts',host)).json(); assert.equal(list.hosts[0].name,'Matilda'); assert.equal(list.hosts[0].email,matilda.email);
    const session=await (await call('/api/session',matilda)).json(); assert.equal(session.canHost,true); assert.equal(session.isOwner,false); assert.equal(session.role,'host');
    assert.equal((await call('/api/live/hosts',matilda)).status,403);
    assert.equal((await call('/api/live/hosts/grant',matilda,{email:fast.email})).status,403);
    assert.equal((await call('/api/live/hosts/revoke',matilda,{email:matilda.email})).status,403);
    const ownerCode=(await (await call('/api/live/create',host,{})).json()).code;
    const code=(await (await call('/api/live/create',matilda,{round:1,level:'apply'})).json()).code;
    const history=await (await call('/api/live/rooms',matilda)).json(); assert(history.rooms.some(room=>room.code===code)); assert(!history.rooms.some(room=>room.code===ownerCode));
    assert.equal((await call('/api/live/room?code='+ownerCode,matilda)).status,403);
    assert.equal((await call('/api/live/advance',matilda,{code:ownerCode,questionIndex:-1})).status,403);
    assert.equal((await call('/api/live/advance',host,{code,questionIndex:-1})).status,403);
    assert.equal((await call('/api/live/create',matilda,{format:'replay',sourceCode:ownerCode})).status,403);
    await call('/api/live/join',fast,{code,name:'fast'});
    assert.equal((await call('/api/live/advance',matilda,{code,questionIndex:-1})).status,200);
    const stored=await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first(),snapshot=JSON.parse(stored.snapshot);
    for(let i=0;i<5;i++) {
      const room=await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
      clock=room.started_at+1000;
      assert.equal((await call('/api/live/answer',fast,{code,questionIndex:i,selected:snapshot.questions[i].correct})).status,200);
      clock=room.started_at+40000;
      assert.equal((await call('/api/live/advance',matilda,{code,questionIndex:i})).status,200);
    }
    const final=await (await call('/api/live/room?code='+code,matilda)).json(); assert.equal(final.host,true); assert.equal(final.results[0].correct,5);
    assert.equal((await call('/api/live/results.csv?code='+code,matilda)).status,200);
    assert.equal((await call('/api/live/results.csv?code='+code,host)).status,403);
    const mixedResponse=await call('/api/live/create',matilda,{round:2,level:'stretch',format:'mixed',sourceCode:code}); assert.equal(mixedResponse.status,200);
    const mixedCode=(await mixedResponse.json()).code;
    await call('/api/live/join',fast,{code:mixedCode,name:'fast'}); await call('/api/live/advance',matilda,{code:mixedCode,questionIndex:-1});
    assert.equal((await call('/api/live/hosts/revoke',host,{email:host.email})).status,400);
    assert.equal((await call('/api/live/hosts/revoke',host,{email:'MATILDA@EXAMPLE.TEST'})).status,200);
    const revoked=await (await call('/api/session',matilda)).json(); assert.equal(revoked.role,'player'); assert.equal(revoked.canHost,false);
    assert.equal((await call('/api/live/create',matilda,{})).status,403);
    assert.equal((await call('/api/live/rooms',matilda)).status,403);
    assert.equal((await call('/api/live/room?code='+mixedCode,matilda)).status,403);
    assert.equal((await call('/api/live/advance',matilda,{code:mixedCode,questionIndex:0})).status,403);
    assert.equal((await call('/api/live/results.csv?code='+code,matilda)).status,403);
    assert.equal((await call('/api/live/join',matilda,{code:ownerCode,name:'Matilda'})).status,200);
    const preserved=await env.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first(); assert.equal(preserved.snapshot,stored.snapshot);
    const answers=await env.DB.prepare('SELECT count(*) AS n FROM answers WHERE room_code = ?').bind(code).first(); assert.equal(answers.n,5);
    assert.equal((await call('/api/live/hosts/grant',host,{email:matilda.email,name:'Matilda'})).status,200);
    assert.equal((await call('/api/live/results.csv?code='+code,matilda)).status,200);
    assert.equal((await (await call('/api/session',host)).json()).role,'owner');
    assert.equal((await call('/hosts',null)).status,200);
  } finally {local.close();}
});
