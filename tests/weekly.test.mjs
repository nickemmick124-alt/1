import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {openDatabase} from '../scripts/local-db.mjs';
import bank from '../src/weekly-bank.json' with {type:'json'};
import {weeklyEdition} from '../src/weekly.mjs';
const origin='https://finance.example.test';
const host={id:'host',email:'host@example.test'}, player={id:'player',email:'player@example.test'};
function req(path,user,body){return new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email,...(body===undefined?{}:{origin,'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
test('reviewed editions rotate on Monday and repeat only after four weeks',()=>{
  assert.equal(weeklyEdition(bank,new Date('2026-10-12T00:00:00Z')).id,bank.rounds[0].id);
  assert.equal(weeklyEdition(bank,new Date('2026-10-18T23:59:59Z')).id,bank.rounds[0].id);
  assert.equal(weeklyEdition(bank,new Date('2026-10-19T00:00:00Z')).id,bank.rounds[1].id);
  assert.equal(weeklyEdition(bank,new Date('2026-11-09T00:00:00Z')).id,bank.rounds[0].id);
});
test('weekly game gates progressive help, uses individual deadlines and gives host-only assistance analytics',async t=>{
  let clock=Date.parse('2026-10-12T10:00:00Z');t.mock.method(Date,'now',()=>clock);
  const local=openDatabase(),env={DB:local.DB,OWNER_EMAIL:host.email};
  const call=(path,user,body)=>worker.fetch(req(path,user,body),env);
  try{
    const session=await (await call('/api/session',host)).json();assert.equal(session.weeklyRound.bankCount,24);assert.ok(!JSON.stringify(session).includes('hints'));
    const {code}=await (await call('/api/live/create',host,{track:'weekly'})).json();
    const saved=JSON.parse((await local.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first()).snapshot);
    assert.equal(saved.questions.length,6);
    await call('/api/live/join',player,{code,name:'Player'});
    for(let i=0;i<6;i++){
      assert.equal((await call('/api/live/advance',host,{code,questionIndex:i-1})).status,200);
      const started=clock, q=saved.questions[i], d=q.questionDurationMs;
      const read=async()=> (await call('/api/live/room?code='+code,player)).json();
      let state=await read();assert.equal(state.questionDurationMs,d);assert.equal(state.deadline,started+d);assert.deepEqual(state.question.help,[]);assert.ok(!('correct' in state.question));assert.ok(!('hints' in state.question));
      clock=started+d*.5-1;assert.deepEqual((await read()).question.help,[]);
      clock++;assert.equal((await read()).question.help.at(-1).kind,'clue');
      clock=started+d*.75;assert.equal((await read()).question.help.at(-1).kind,'setup');
      clock=started+d-5001;assert.equal((await read()).question.help.at(-1).kind,'setup');
      clock++;state=await read();assert.equal(state.question.help.at(-1).kind,'answer');assert.equal(state.question.help.at(-1).text,q.options[q.correct]);
      assert.equal((await call('/api/live/answer',player,{code,questionIndex:i,selected:q.correct})).status,200);
      clock=started+d;state=await read();assert.equal(state.phase,'reveal');assert.equal(state.question.correct,q.correct);
    }
    await call('/api/live/advance',host,{code,questionIndex:5});
    const hostResults=await (await call('/api/live/room?code='+code,host)).json();
    assert.equal(hostResults.questionAnalytics.length,6);
    for(const a of hostResults.questionAnalytics){assert.equal(a.correct,1);assert.equal(a.stages.answer,1);assert.equal(a.stageCorrect.answer,1);assert.equal(a.unanswered,0);}
    const playerResults=await (await call('/api/live/room?code='+code,player)).json();assert.ok(!('questionAnalytics' in playerResults));assert.ok(!('results' in playerResults));
    const replay=await call('/api/live/create',host,{track:'weekly',format:'replay',sourceCode:code});assert.equal(replay.status,200);
  }finally{local.close();}
});
