import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {openDatabase} from '../scripts/local-db.mjs';
const origin='https://finance.example.test';
const host={id:'host',email:'host@example.test'},player={id:'player',email:'player@example.test'},other={id:'other',email:'other@example.test'};
function req(path,user,body){return new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{...(user?{'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email}:{}),...(body===undefined?{}:{origin,'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
test('saved reports show closed-question scores without finishing a game or revealing active and future answers',async t=>{
  let clock=Date.parse('2026-10-12T10:00:00Z');t.mock.method(Date,'now',()=>clock);
  const local=openDatabase(),env={DB:local.DB,OWNER_EMAIL:host.email};
  const call=(path,user,body)=>worker.fetch(req(path,user,body),env);
  try{
    const {code}=await (await call('/api/live/create',host,{track:'weekly'})).json();
    const report=()=>call('/api/live/report?code='+code,host);
    const snapshot=JSON.parse((await local.DB.prepare('SELECT snapshot FROM rooms WHERE code = ?').bind(code).first()).snapshot);
    assert.equal((await (await report()).json()).completedQuestions,0);
    await call('/api/live/join',player,{code,name:'Player'});
    await call('/api/live/advance',host,{code,questionIndex:-1});
    const firstStart=clock;
    clock+=1000;
    await call('/api/live/answer',player,{code,questionIndex:0,selected:snapshot.questions[0].correct});
    let r=await (await report()).json();assert.equal(r.results[0].score,0);assert.equal(r.completedQuestions,0);assert.deepEqual(r.review,[]);assert.deepEqual(r.questionAnalytics,[]);
    clock=firstStart+snapshot.questions[0].questionDurationMs;
    r=await (await report()).json();assert.equal(r.complete,false);assert.equal(r.completedQuestions,1);assert.equal(r.results[0].correct,1);assert.ok(r.results[0].score>500);assert.equal(r.review.length,1);assert.equal(r.questionAnalytics[0].stages.unassisted,1);
    assert.ok(!JSON.stringify(r).includes(snapshot.questions[1].prompt));
    const unchanged=await local.DB.prepare('SELECT phase, question_index FROM rooms WHERE code = ?').bind(code).first();assert.equal(unchanged.phase,'question');assert.equal(unchanged.question_index,0);
    assert.equal((await call('/api/live/report?code='+code,null)).status,401);
    assert.equal((await call('/api/live/report?code='+code,player)).status,403);
    assert.equal((await call('/api/live/report?code='+code,other)).status,403);
    for(let i=1;i<snapshot.questions.length;i++){
      await call('/api/live/advance',host,{code,questionIndex:i-1});
      clock+=snapshot.questions[i].questionDurationMs;
    }
    await call('/api/live/advance',host,{code,questionIndex:5});
    r=await (await report()).json();assert.equal(r.complete,true);assert.equal(r.completedQuestions,6);assert.equal(r.review.length,6);assert.equal(r.results[0].correct,1);
    const csv=await call('/api/live/results.csv?code='+code,host);assert.equal(csv.status,200);assert.ok((await csv.text()).includes('Player'));
  }finally{local.close();}
});
