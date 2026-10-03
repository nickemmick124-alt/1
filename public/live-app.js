const main = document.getElementById('main');
const state = { session: null, room: null, code: '', error: '', busy: false, pollBusy: false, stopPoll: false, view: 'home', pendingAnswer: null, deadlinePerf: 0, rooms: [], generation: 0, actionToken: 0 };
const names = { inventory: 'Inventory', 'working-capital': 'Working capital', 'dealer-financing': 'Dealer terms', 'cash-conversion': 'Cash conversion', 'capital-expenditure': 'Capital expenditure', revenue: 'Revenue', 'profit-margin': 'Profit margin', 'aftermarket-revenue': 'Aftermarket', cyclicality: 'Business cycles', 'capacity-utilization': 'Utilization' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, body) {
  const response = await fetch(path, { credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  let data; try { data = await response.json(); } catch { throw new Error('Connection lost. Try again.'); }
  if (!response.ok) throw new Error(data.error || 'The round could not connect.'); return data;
}
function toast(message) { const el = document.getElementById('toast'); el.textContent = message; el.hidden = false; clearTimeout(toast.timeout); toast.timeout = setTimeout(() => el.hidden = true, 3000); }
function nav() {
  document.getElementById('results-nav').hidden = !state.session?.isOwner;
  document.getElementById('play-nav').classList.toggle('active', state.view !== 'history');
  document.getElementById('results-nav').classList.toggle('active', state.view === 'history');
  document.getElementById('identity').innerHTML = state.session?.user ? escape(state.session.user.name) : '<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in</a>';
}
const error = () => `<div class="error" id="live-error" role="alert" ${state.error ? '' : 'hidden'}>${escape(state.error)}</div>`;
function heading(title, subtitle, extra = '') { return `<div class="topline"><span class="dot" aria-hidden="true"></span><span class="eyebrow">CNH INDUSTRIAL · BUSINESS ACUMEN</span><span class="pill">LIVE QUIZ</span></div><div class="intro-line"><div><h1>${escape(title)}</h1><p class="subtle">${escape(subtitle)}</p></div>${extra}</div>`; }
function signinLink() { return '/signin-with-chatgpt?return_to=' + encodeURIComponent('/' + (state.code ? '?room=' + state.code : '')); }
function home() {
  state.generation++; state.actionToken++; state.busy = false; state.view = 'home'; state.stopPoll = true; state.error = ''; nav();
  main.innerHTML = heading('Think fast. Think business.', 'A live finance challenge for your HR team, built around the equipment business.') + `<div class="game-layout"><section class="round-card"><div class="eyebrow">AGRICULTURE & CONSTRUCTION EQUIPMENT</div><h2 class="round-heading">Big decisions.<br>Ten seconds.</h2><p>Join your team for five quick decisions about cash, profit, and the business behind the machines.</p><div class="round-meta"><span>◷ &nbsp;10 seconds per question</span><span>↗ &nbsp;Speed earns points</span><span>♧ &nbsp;Top 3 podium</span></div>${state.session.isOwner ? `<form id="host-form"><label class="sr-only" for="round-select">Choose a round</label><select class="round-select" id="round-select">${state.session.rounds.map(r => `<option value="${r.index}" ${r.index === state.session.defaultRound ? 'selected' : ''}>${escape(r.title)}</option>`).join('')}</select><button class="primary light" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Creating room…' : 'Host a live round →'}</button></form>` : '<div class="live-tag">Join with the code from your host →</div>'}</section><div class="right-stack"><section class="paper-card"><div class="eyebrow">JOIN YOUR TEAM</div><h2 class="join-title">Got a room code?</h2><form id="join-form"><label class="field-label" for="room-code">Room code</label><input class="text-input code-input" id="room-code" name="code" autocomplete="off" autocapitalize="characters" maxlength="6" pattern="[A-Za-z2-9]{6}" placeholder="ABC234" value="${escape(state.code)}" required>${state.session.user ? `<label class="field-label" for="player-name">Name on the leaderboard</label><input class="text-input" id="player-name" name="name" maxlength="40" value="${escape(state.session.user.name)}" required><button class="primary join-submit" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Joining…' : 'Join live round →'}</button>` : `<a class="primary join-submit" id="join-signin" href="${signinLink()}" target="_top">Sign in & join →</a><p class="field-help">Sign in with ChatGPT to save your score.</p>`}</form>${error()}</section><section class="note-card"><h3>Accuracy first. Speed second.</h3><p>A correct answer earns 500–1,000 points. Faster earns more. Wrong or late answers earn 0. Your first answer is final.</p></section></div></div><div class="topics"><div class="topic"><div class="topic-icon">01 / CASH</div><strong>Inventory & cash flow</strong>What ties up capital?</div><div class="topic"><div class="topic-icon">02 / EARN</div><strong>Revenue & profit</strong>What creates returns?</div><div class="topic"><div class="topic-icon">03 / SELL</div><strong>Dealers & aftermarket</strong>How the business earns</div><div class="topic"><div class="topic-icon">04 / OPERATE</div><strong>Demand & capacity</strong>How activity affects results</div></div>`;
}
function topThree(room, final = false) {
  const ranks = final ? [2, 1, 3] : [1, 2, 3];
  return `<div class="${final ? 'podium' : 'leaderboard'}">${ranks.map(rank => { const p = room.top3[rank - 1]; return `<div class="${final ? 'podium-place' : 'leader-row'} rank-${rank}"><span class="rank">${rank === 1 && final ? '♛' : rank}</span><div><strong>${p ? escape(p.name) : '—'}${p?.isYou ? ' <small>(you)</small>' : ''}</strong><span>${p ? p.score.toLocaleString() + ' points' : 'Awaiting player'}</span></div>${final && p ? `<small>${p.correct}/${room.questionCount} correct</small>` : ''}</div>`; }).join('')}</div>`;
}
function lobby(room) {
  main.innerHTML = heading(room.host ? 'Your room is ready.' : 'You’re in. Get ready.', room.title) + `<div class="game-layout"><section class="paper-card lobby-card"><div class="eyebrow">ROOM CODE</div><div class="big-code">${escape(room.code)}</div><p class="subtle">${room.host ? 'Share this code or the room link. Wait for your team, then start.' : 'Your host will start the first question. Keep this page open.'}</p>${room.host ? '<button class="secondary" data-action="copy">Copy room link ↗</button>' : ''}<div class="lobby-divider"></div><div class="intro-line"><h2><span id="player-count">${room.playerCount}</span> ${room.playerCount === 1 ? 'player' : 'players'} joined</h2><span class="pill">Waiting to start</span></div><div class="player-chips" id="player-chips">${room.players.length ? room.players.map(p => `<span class="player-chip">${escape(p.name)}</span>`).join('') : '<p class="subtle">Your team will appear here as they join.</p>'}</div>${error()}${room.host ? `<button class="primary start-round" data-action="advance" ${!room.playerCount || state.busy ? 'disabled' : ''}>${state.busy ? 'Starting…' : 'Start first question →'}</button>` : '<p class="waiting-note">Waiting for your host…</p>'}</section><div class="right-stack"><section class="paper-card"><div class="eyebrow">BEFORE WE START</div><ol class="rules-list"><li><span class="rule-n">01</span><div><strong>10 seconds. One answer.</strong>Tap your choice as soon as you’re ready. You can’t change it.</div></li><li><span class="rule-n">02</span><div><strong>Correct + quick = more points</strong>Score up to 1,000 on each question. No points for wrong or late answers.</div></li><li><span class="rule-n">03</span><div><strong>Learn after each decision</strong>The answer and top three appear when the timer ends.</div></li></ol></section><section class="note-card"><h3>About this round</h3><p>${escape(room.story)}</p><p class="amount-key">USD · k = thousand · m = million</p></section></div></div>`;
}
function questionView(room) {
  const q = room.question, reveal = room.phase === 'reveal';
  const answered = room.ownAnswer || state.pendingAnswer !== null;
  const selected = room.ownAnswer?.selected ?? state.pendingAnswer;
  main.innerHTML = `<div class="live-top"><div><span class="eyebrow">${escape(room.title)}</span><h1 class="live-h1">Decision ${room.questionIndex + 1}<span> / ${room.questionCount}</span></h1></div><span class="pill">ROOM ${escape(room.code)} · ${room.playerCount} players</span></div><div class="live-layout"><section class="question-stage"><div class="stage-top"><span>${escape(names[q.topic] || q.topic)}</span><div class="timer ${reveal ? 'expired' : ''}" role="timer" aria-label="Seconds remaining"><span id="seconds">${reveal ? '0' : '10'}</span><small>SECONDS</small></div></div><div class="timer-track"><div id="timer-fill"></div></div><h2 class="live-prompt" id="live-question">${escape(q.prompt)}</h2><div class="live-options" role="group" aria-labelledby="live-question">${q.options.map((option, index) => `<button class="live-option answer-${index} ${selected === index ? 'chosen' : ''} ${reveal ? q.correct === index ? 'correct' : 'muted-option' : ''}" data-action="answer" data-answer="${index}" ${room.host || reveal || answered || state.busy ? 'disabled' : ''}><span class="answer-symbol" aria-hidden="true">${['△', '◇', '○', '□'][index]}</span><span>${escape(option)}</span>${reveal && q.correct === index ? '<span class="correct-tick" aria-label="Correct answer">✓</span>' : ''}</button>`).join('')}</div><div class="answer-status" id="answer-status" role="status">${room.host ? `${room.answeredCount} / ${room.playerCount} answers received` : reveal ? room.ownAnswer ? room.ownAnswer.correct ? `Correct! +${room.ownAnswer.points} points` : 'That wasn’t the right choice. 0 points.' : 'No answer received in time. 0 points.' : answered ? 'Answer locked. Waiting for the timer…' : 'Choose your answer. Your first choice is final.'}</div>${error()}${reveal ? `<section class="explanation"><strong>Why this matters</strong><p>${escape(q.explanation)}</p></section>${room.host ? `<button class="primary light next-live" data-action="advance" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Opening…' : room.questionIndex + 1 === room.questionCount ? 'Show final podium →' : 'Next question →'}</button>` : '<p class="waiting-note">Your host will advance the round.</p>'}` : ''}</section><aside class="paper-card rankings"><div class="eyebrow">${reveal ? 'AFTER THIS DECISION' : 'FROM COMPLETED DECISIONS'}</div><h2>Top three</h2>${topThree(room)}${room.you ? `<div class="your-standing"><span>Your standing</span><strong>#${room.you.rank} · ${room.you.score.toLocaleString()} pts</strong></div>` : ''}<p class="field-help">${reveal ? 'Ties: most correct, then fastest correct answers.' : 'Scores update when the timer ends.'}</p></aside></div>`;
  tick();
}
function finished(room) {
  main.innerHTML = heading('The final three.', room.title, '<button class="secondary" data-action="home">Back to live games</button>') + `<section class="final-stage"><div class="eyebrow">ROUND COMPLETE · ${room.playerCount} PLAYERS</div><h2>Good decisions rise to the top.</h2>${topThree(room, true)}${room.you ? `<p class="final-standing">You finished <strong>#${room.you.rank}</strong> with <strong>${room.you.score.toLocaleString()} points</strong> · ${room.you.correct}/${room.questionCount} correct</p>` : ''}</section>${error()}${room.host ? `<div class="intro-line results-heading"><div><h2>Team results</h2><p class="subtle">Saved automatically for your weekly review.</p></div><a class="secondary" href="/api/live/results.csv?code=${room.code}">Download CSV ↓</a></div><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Manager</th><th>Points</th><th>Correct</th></tr></thead><tbody>${room.results.map(p => `<tr><td>#${p.rank}</td><td><strong>${escape(p.name)}</strong><small>${escape(p.email)}</small></td><td class="score-number">${p.score.toLocaleString()}</td><td>${p.correct}/${room.questionCount}</td></tr>`).join('')}</tbody></table></div><section class="paper-card breakdown"><h2>Discussion prompts</h2>${room.review.map(q => `<details class="discussion"><summary>${escape(q.prompt)}</summary><p><strong>${escape(q.options[q.correct])}</strong><br>${escape(q.explanation)}</p></details>`).join('')}</section>` : '<p class="share-note">Your score is saved for your host. Come back for the next live round.</p>'}`;
}
function renderRoom() {
  const room = state.room; if (!room) return;
  state.view = 'room'; nav();
  if (room.phase === 'lobby') lobby(room); else if (room.phase === 'finished') finished(room); else questionView(room);
}
async function poll() {
  if (state.stopPoll || state.pollBusy || !state.code) return;
  const pollToken = {}, generation = state.generation, code = state.code;
  state.pollBusy = pollToken;
  const start = performance.now();
  try {
    const room = await api('/api/live/room?code=' + code), receipt = performance.now();
    if (generation !== state.generation || code !== state.code || state.stopPoll) return;
    state.deadlinePerf = receipt + Math.max(0, (room.deadline || 0) - room.serverNow - (receipt - start) / 2);
    const old = state.room;
    const transition = !old || room.phase !== old.phase || room.questionIndex !== old.questionIndex;
    if (transition) { state.actionToken++; state.busy = false; state.pendingAnswer = null; state.error = ''; }
    const changed = transition || room.playerCount !== old.playerCount || room.answeredCount !== old.answeredCount || JSON.stringify(room.top3) !== JSON.stringify(old.top3) || JSON.stringify(room.ownAnswer) !== JSON.stringify(old.ownAnswer) || JSON.stringify(room.players) !== JSON.stringify(old.players);
    state.room = room;
    if (changed) { renderRoom(); if (transition && room.phase !== 'lobby') { main.focus(); } }
    else { const el = document.getElementById('live-error'); if (el) el.hidden = true; }
    if (room.phase === 'finished') state.stopPoll = true;
  } catch (e) { if (generation !== state.generation || code !== state.code || state.stopPoll) return; state.error = e.message; const el = document.getElementById('live-error'); if (el) { el.hidden = false; el.textContent = state.error; } }
  finally { if (state.pollBusy === pollToken) { state.pollBusy = false; if (!state.stopPoll && generation === state.generation) setTimeout(poll, 700); } }
}
function tick() {
  if (state.room?.phase !== 'question' || state.view !== 'room') return;
  const remaining = Math.max(0, state.deadlinePerf - performance.now());
  const el = document.getElementById('seconds'); if (el) el.textContent = String(Math.ceil(remaining / 1000));
  const fill = document.getElementById('timer-fill'); if (fill) fill.style.width = remaining / 100 + '%';
  if (!remaining) { main.querySelectorAll('[data-action="answer"]').forEach(button => button.disabled = true); const label = document.getElementById('answer-status'); if (label && !state.room.host) label.textContent = 'Time is up. Revealing the answer…'; }
}
setInterval(tick, 80);
async function openRoom(code) {
  state.generation++; state.actionToken++; state.busy = false; state.pollBusy = false; state.stopPoll = true; state.room = null; state.code = code; state.pendingAnswer = null; state.view = 'room'; state.error = '';
  history.replaceState(null, '', '/?room=' + code); main.innerHTML = '<div class="loading">Connecting to the live room…</div>'; state.stopPoll = false; await poll();
  if (!state.room) { state.stopPoll = true; const message = state.error; home(); state.error = message; document.getElementById('live-error').hidden = false; document.getElementById('live-error').textContent = message; }
}
async function historyView() {
  state.generation++; state.actionToken++; state.busy = false; state.stopPoll = true; state.view = 'history'; nav(); main.innerHTML = '<div class="loading">Loading saved rounds…</div>';
  if (!state.session.isOwner) { main.innerHTML = '<div class="empty"><h2>Saved rounds are private.</h2><a class="primary" href="/">Return to the live game</a></div>'; return; }
  try {
    state.rooms = (await api('/api/live/rooms')).rooms;
    main.innerHTML = heading('Every round, remembered.', 'Open a saved round to review results or resume hosting.', '<button class="primary" data-action="home">Host a new round →</button>') + `${state.rooms.length ? `<div class="table-wrap"><table><thead><tr><th>Round</th><th>Room</th><th>Status</th><th>Created · UTC</th><th></th></tr></thead><tbody>${state.rooms.map(r => `<tr><td>${escape(r.title)}</td><td class="week-tag">${r.code}</td><td>${r.phase === 'finished' ? 'Complete' : r.phase === 'lobby' ? 'Lobby open' : 'In progress'}</td><td>${escape(new Date(r.created_at).toLocaleString('en-US', { timeZone: 'UTC' }))}</td><td><button class="table-link" data-action="open" data-code="${r.code}">Open →</button></td></tr>`).join('')}</tbody></table></div>` : '<section class="empty"><h2>No rounds yet.</h2><p>Host your first live game. Completed scores will appear here.</p><button class="primary" data-action="home">Host a round →</button></section>'}`;
  } catch (e) { main.innerHTML = `<div class="error" role="alert">${escape(e.message)}</div><button class="secondary" data-action="history">Try again</button>`; }
}
main.addEventListener('input', event => { if (event.target.id === 'room-code') { state.code = event.target.value.toUpperCase(); const a = document.getElementById('join-signin'); if (a) a.href = signinLink(); } });
main.addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy) return; state.busy = true; state.error = '';
  const host = event.target.id === 'host-form', code = document.getElementById('room-code')?.value.toUpperCase(), name = document.getElementById('player-name')?.value, round = Number(document.getElementById('round-select')?.value);
  try { const result = host ? await api('/api/live/create', { round }) : await api('/api/live/join', { code, name }); state.busy = false; await openRoom(result.code); }
  catch (e) { state.busy = false; state.error = e.message; const el = document.getElementById('live-error'); if (el) { el.hidden = false; el.textContent = state.error; } }
});
main.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'home') { state.code = ''; history.replaceState(null, '', '/'); home(); }
  if (action === 'history') await historyView();
  if (action === 'open') await openRoom(button.dataset.code);
  if (action === 'copy') { try { await navigator.clipboard.writeText(location.origin + '/?room=' + state.code); toast('Room link copied.'); } catch { toast('Room link: ' + location.origin + '/?room=' + state.code); } }
  if (action === 'advance' && !state.busy) {
    const token = ++state.actionToken, generation = state.generation, code = state.code, questionIndex = state.room.questionIndex;
    state.busy = true; button.disabled = true;
    try { await api('/api/live/advance', { code, questionIndex }); if (token !== state.actionToken || generation !== state.generation) return; state.busy = false; renderRoom(); await poll(); }
    catch (e) { if (token !== state.actionToken || generation !== state.generation) return; state.busy = false; state.error = e.message; renderRoom(); }
  }
  if (action === 'answer' && !state.busy && !state.room.ownAnswer && state.pendingAnswer === null) {
    const token = ++state.actionToken, generation = state.generation, code = state.code, questionIndex = state.room.questionIndex, selected = Number(button.dataset.answer);
    state.busy = true; state.pendingAnswer = selected; renderRoom();
    try { await api('/api/live/answer', { code, questionIndex, selected }); if (token !== state.actionToken || generation !== state.generation) return; state.busy = false; renderRoom(); await poll(); }
    catch (e) { if (token !== state.actionToken || generation !== state.generation) return; state.busy = false; state.pendingAnswer = null; state.error = e.message; renderRoom(); }
  }
});
async function start() {
  try { state.session = await api('/api/session'); state.code = (new URLSearchParams(location.search).get('room') || '').toUpperCase(); nav(); if (location.pathname === '/results') await historyView(); else { home(); if (state.session.user && /^[A-Z2-9]{6}$/.test(state.code)) { try { await api('/api/live/join', { code: state.code, name: state.session.user.name }); await openRoom(state.code); } catch (e) { state.error = e.message; const el = document.getElementById('live-error'); el.hidden = false; el.textContent = e.message; } } } registerTools(); }
  catch (e) { main.innerHTML = `<div class="empty"><h2>The game could not open.</h2><p>${escape(e.message)}</p><a class="primary" href="/">Try again</a></div>`; }
}
function registerTools() {
  if (!document.modelContext?.registerTool) return;
  const lifecycle = new AbortController();
  try { Promise.resolve(document.modelContext.registerTool({ name: 'read_live_round', title: 'Read current live round', description: 'Read the current room phase, timer and top three. Does not answer or advance the game.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input) { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Pass an empty object.'); if (!state.room) throw new Error('Join or host a room first.'); return { code: state.room.code, phase: state.room.phase, question: state.room.questionIndex + 1, secondsRemaining: state.room.phase === 'question' ? Math.ceil(Math.max(0, state.deadlinePerf - performance.now()) / 1000) : 0, top3: state.room.top3 }; } }, { signal: lifecycle.signal })).catch(() => {}); } catch {}
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
start();
