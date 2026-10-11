import { referenceView, bindReference, sourceLinks } from './business-app.js';
import { renderValueConnection } from './values.js';
import { escape, renderFactSheet, renderFactPanel } from './leadership.js';
import { renderCompetitorSheet, bindCompetitorSheet } from './competitors.js';
const main = document.getElementById('main');
const state = { session: null, room: null, code: '', error: '', busy: false, pollBusy: false, stopPoll: false, view: 'home', pendingAnswer: null, deadlinePerf: 0, rooms: [], generation: 0, actionToken: 0, hostTrack: 'leadership', factPanelOpen: !window.matchMedia('(max-width: 950px)').matches };
const names = { inventory: 'Inventory', 'working-capital': 'Working capital', 'dealer-financing': 'Dealer terms', 'cash-conversion': 'Cash conversion', 'capital-expenditure': 'Capital expenditure', revenue: 'Revenue', 'profit-margin': 'Profit margin', 'aftermarket-revenue': 'Aftermarket', cyclicality: 'Business cycles', 'capacity-utilization': 'Utilization' };
Object.assign(names, { 'industrial-activities': 'Industrial Activities', 'ebit-margin': 'Adjusted EBIT margin', 'volume-mix': 'Volume & Mix', 'industrial-fcf': 'Industrial FCF', 'industry-demand': 'Industry demand', 'commodity-prices': 'Commodity prices', 'farmer-economics': 'Farmer economics', 'retail-wholesale': 'Retail / wholesale', 'skills-capacity': 'Qualified capacity', absorption: 'Fixed-cost absorption', 'dealer-inventory': 'Dealer inventory', 'ramp-readiness': 'Ramp readiness', downcycle: 'Downcycle capability', cbs: 'CNH Business System', 'product-cost': 'Product cost', capex: 'Investment case' });
async function api(path, body) {
  const response = await fetch(path, { credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  let data; try { data = await response.json(); } catch { throw new Error('Connection lost. Try again.'); }
  if (!response.ok) throw new Error(data.error || 'The round could not connect.'); return data;
}
function toast(message) { const el = document.getElementById('toast'); el.textContent = message; el.hidden = false; clearTimeout(toast.timeout); toast.timeout = setTimeout(() => el.hidden = true, 3000); }
function nav() {
  document.body.dataset.surface = state.view;
  main.classList.toggle('arena-main', state.view === 'home');
  document.getElementById('results-nav').hidden = !state.session?.canHost;
  document.getElementById('hosts-nav').hidden = !state.session?.isOwner;
  document.getElementById('hosts-nav').classList.toggle('active',state.view==='hosts');
  document.getElementById('play-nav').classList.toggle('active', ['home', 'room'].includes(state.view));
  document.getElementById('results-nav').classList.toggle('active', state.view === 'history');
  for (const view of ['prepare','facts','competitors','decoder','drivers','vocabulary']) document.getElementById(view+'-nav').classList.toggle('active', state.view === view);
  document.querySelectorAll('.header .nav-link').forEach(link=>{if(link.classList.contains('active'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  document.getElementById('identity').innerHTML = state.session?.user ? escape(state.session.user.name) + (state.session.canHost?`<span class="identity-role">${state.session.isOwner?'Owner':'Host'}</span>`:'') : (state.session?.guest ? `<span>${escape(state.session.guest.name)}<span class="identity-role">Guest</span></span> ` : '') + '<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Host sign in</a>';
}
const error = () => `<div class="error" id="live-error" role="alert" ${state.error ? '' : 'hidden'}>${escape(state.error)}</div>`;
function heading(title, subtitle, extra = '') { return `<div class="topline"><span class="dot" aria-hidden="true"></span><span class="eyebrow">CNH · NORTH AMERICA HR</span><span class="pill">LIVE QUIZ</span></div><div class="intro-line"><div><h1>${escape(title)}</h1><p class="subtle">${escape(subtitle)}</p></div>${extra}</div>`; }
function hostForm() {
  const completed = state.rooms.filter(room => room.phase === 'finished' && room.track === 'beginner');
  const reference = state.hostTrack !== 'beginner';
  return `<form id="host-form">
    <label class="field-label" for="track-select">Choose your round</label>
    <select class="round-select" id="track-select"><option value="leadership" ${state.hostTrack==='leadership'?'selected':''}>Leadership · Company financials</option><option value="competitors" ${state.hostTrack==='competitors'?'selected':''}>Comparison · CNH vs John Deere</option><option value="beginner" ${!reference?'selected':''}>Beginner · Business foundations</option></select>
    <p class="level-description" id="track-description"></p>
    <div id="beginner-choices" ${reference ? 'hidden' : ''}>
      <label class="field-label" for="round-select">Beginner round</label><select class="round-select" id="round-select">${(state.session.beginnerRounds || []).map(r => `<option value="${r.index}">${escape(r.title)}</option>`).join('')}</select>
      <label class="field-label" for="format-select">Round format</label><select class="round-select" id="format-select"><option value="current">8 beginner questions</option><option value="mixed" ${completed.length ? '' : 'disabled'}>6 beginner + 2 review questions</option></select>
      <div id="review-picker" hidden><label class="field-label" for="review-select">Review from a completed round</label><select class="round-select" id="review-select" disabled>${completed.map(room => `<option value="${escape(room.code)}">${escape(room.title)} · ${escape(room.code)}</option>`).join('')}</select></div>
    </div>
    <p class="host-help" id="format-description"></p>
    <button class="primary light" type="submit" id="host-submit">Host leadership round</button>
  </form>`;
}
function updateHostChoice() {
  const track = document.getElementById('track-select');
  if (!track) return;
  state.hostTrack = track.value;
  const competitors = track.value === 'competitors', reference = track.value !== 'beginner';
  const metadata = competitors ? state.session.competitorRound : state.session.leadershipRound;
  const mixed = !reference && document.getElementById('format-select').value === 'mixed';
  document.getElementById('beginner-choices').hidden = reference;
  for (const id of ['round-select', 'format-select']) document.getElementById(id).disabled = reference;
  document.getElementById('review-picker').hidden = !mixed;
  document.getElementById('review-select').disabled = !mixed;
  document.getElementById('review-select').required = mixed;
  document.getElementById('host-submit').textContent = competitors ? 'Host CNH vs John Deere round' : reference ? 'Host leadership round' : 'Host beginner round';
  const count = metadata?.questionCount || 8, seconds = (metadata?.durationMs || 25000) / 1000;
  document.getElementById('round-heading').textContent = competitors ? 'CNH vs John Deere. Understand the results.' : reference ? 'Read the results. Make the call.' : 'Build the business foundations.';
  document.getElementById('round-description').textContent = competitors ? 'Compare CNH with John Deere. See current and prior-year results, understand the year-over-year change, and explain what it means and why it matters. Use the dated reference for business segments, workforce, and stock returns.' : reference ? 'Know CNH’s revenue, gross margin, and North America sales contribution. Connect cash, share price, and personnel costs to the business, with a financial fact sheet available as you play.' : 'Start with familiar situations and build toward CNH business concepts. Choose one of two beginner rounds, with explanations and discussion after every answer.';
  document.getElementById('round-timing').textContent = `${reference ? seconds : 40} seconds per question`;
  document.getElementById('round-count').textContent = `${reference ? count : 8} questions`;
  document.getElementById('arena-seconds').textContent = reference ? seconds : 40;
  document.getElementById('track-description').textContent = competitors ? `${metadata?.period || 'Monthly edition'} · Detailed results, simple explanations, and John Deere comparison.` : reference ? `${metadata?.period || 'Latest public quarter'} · Company economics, North America contribution, and personnel costs.` : '3 familiar situations, 3 business concepts, and 2 CNH connections.';
  document.getElementById('format-description').textContent = reference ? 'Use the reference during every question. The timer ends each question; the explanation stays open until you advance. Allow time for discussion.' : mixed ? 'Six beginner questions plus two saved review questions. Discuss each answer before moving on.' : 'Eight questions, 40 seconds each. Start with Beginner 1, then try Beginner 2. The explanation stays open until you advance.';
  const referenceLink = document.querySelector('.home-fact-link');
  referenceLink.href = competitors ? '/competitors' : '/facts';
  referenceLink.dataset.view = competitors ? 'competitors' : 'facts';
  referenceLink.textContent = competitors ? 'Explore CNH vs John Deere →' : 'Explore the financial fact sheet →';
}
async function home() {
  const generation=++state.generation; state.actionToken++; state.busy = false; state.view = 'home'; state.stopPoll = true; state.error = ''; nav();
  if (state.session.canHost) {
    main.innerHTML='<div class="loading">Loading your question library…</div>';
    try { state.rooms=(await api('/api/live/rooms')).rooms; } catch { state.rooms=[]; state.error='Saved rounds could not load. You can still host a current question set.'; }
    if (generation!==state.generation || state.view!=='home') return;
  }
  const seconds = (state.session.leadershipRound?.durationMs || 25000) / 1000;
  main.innerHTML = `<section class="arena-hero" aria-labelledby="arena-heading"><div class="arena-hero-inner"><div class="arena-entry"><div class="eyebrow arena-kicker">CNH · NORTH AMERICA HR</div><section class="arena-join"><div class="eyebrow">JOIN LIVE ROUND</div><h2 class="join-title">Got a room code?</h2><p class="arena-join-intro">Enter your room code to join your team for a live business-acumen session.</p><form id="join-form"><label class="field-label" for="room-code">Room code</label><input class="text-input code-input" id="room-code" name="code" autocomplete="off" autocapitalize="characters" maxlength="6" pattern="[A-Za-z2-9]{6}" placeholder="ABC234" value="${escape(state.code)}" required><label class="field-label" for="player-name">Name on the leaderboard</label><input class="text-input" id="player-name" name="name" autocomplete="nickname" maxlength="40" placeholder="Your name" value="${escape(state.session.user?.name || state.session.guest?.name || '')}" required><button class="primary join-submit" type="submit" ${state.busy ? 'disabled' : ''}><span>${state.busy ? 'Joining…' : state.session.user ? 'Join live round' : 'Join as guest'}</span><img src="/icon-arrow-right.svg" width="26" height="26" alt=""></button><p class="field-help">${state.session.user ? 'Your score is saved for the host.' : 'No ChatGPT sign-in needed. This browser remembers your place and score.'}</p></form>${error()}</section></div><div class="arena-message"><h1 id="arena-heading">Know <br>the business.<br><span>Lead with <br>confidence.</span></h1><p>A live business-acumen quiz for North America HR. <br>Read the results. Make the call.</p><div class="arena-game-art"><img src="/arena-game-art.webp" width="700" height="300" alt="" aria-hidden="true"><div class="arena-clock"><strong id="arena-seconds">${seconds}</strong><span>SECONDS<br>PER QUESTION</span></div><span class="arena-podium-label">TOP 3 LEADERBOARD</span></div></div></div></section><div class="arena-below">${state.session.canHost ? `<section class="round-card arena-host"><div class="arena-host-copy"><div class="eyebrow">HOST YOUR TEAM</div><h2 id="round-heading" class="round-heading host-heading">Read the results. Make the call.</h2><p id="round-description">Connect CNH’s financial results with the decisions your team makes.</p><div class="round-meta"><span id="round-timing">${seconds} seconds per question</span><span id="round-count">${state.session.leadershipRound?.questionCount || 8} questions</span><span>Host-led discussion</span></div><a class="home-fact-link" href="/facts" data-view="facts">Explore the financial fact sheet →</a><p class="hosting-policy">${state.session.isOwner ? 'You can run rounds and choose other hosts in Host access.' : 'Your host access lets you run and review your own rounds.'}</p></div>${hostForm()}</section>` : `<div class="arena-rules"><div><strong>Correct + quick</strong><span>500–1,000 points for a correct answer. Faster earns more.</span></div><div><strong>One answer. Make it count.</strong><span>Your first choice is final. Wrong or late answers earn 0.</span></div><div><strong>Learn. Then lead.</strong><span>Discuss the answer before your host opens the next decision.</span></div></div>`}<div class="topics"><div class="topic"><a href="/facts" data-view="facts"><div class="topic-icon">01 / FINANCIALS</div><strong>Financial fact sheet</strong>Company results, North America sales, and personnel costs</a></div><div class="topic"><a href="/drivers" data-view="drivers"><div class="topic-icon">02 / MARKET</div><strong>Commodity economics</strong>USDA signals and equipment demand</a></div><div class="topic"><a href="/competitors" data-view="competitors"><div class="topic-icon">03 / COMPETE</div><strong>CNH vs John Deere</strong>Detailed numbers, what they mean, and why</a></div><div class="topic"><a href="/vocabulary" data-view="vocabulary"><div class="topic-icon">04 / LANGUAGE</div><strong>CNH vocabulary</strong>CBS, volume/mix, cash, and margin</a></div></div></div>`;
  updateHostChoice();
}
function topThree(room, final = false) {
  const ranks = final ? [2, 1, 3] : [1, 2, 3];
  return `<div class="${final ? 'podium' : 'leaderboard'}">${ranks.map(rank => { const p = room.top3[rank - 1]; return `<div class="${final ? 'podium-place' : 'leader-row'} rank-${rank}"><span class="rank">${rank}</span><div><strong>${p ? escape(p.name) : '—'}${p?.isYou ? ' <small>(you)</small>' : ''}</strong><span>${p ? p.score.toLocaleString() + ' points' : 'Awaiting player'}</span></div>${final && p ? `<small>${p.correct}/${room.questionCount} correct</small>` : ''}</div>`; }).join('')}</div>`;
}
function lobby(room) {
  const seconds = room.questionDurationMs / 1000;
  main.innerHTML = heading(room.host ? 'Your room is ready.' : 'You’re in. Get ready.', room.title) + `<div class="game-layout"><section class="paper-card lobby-card"><div class="eyebrow">ROOM CODE</div><div class="big-code">${escape(room.code)}</div><p class="subtle">${room.host ? 'Share this code or the room link. Players enter a name and join without signing in. Wait for your team, then start.' : 'Your host will start the first question. Keep this page open.'}</p>${room.host ? '<button class="secondary" data-action="copy">Copy room link</button>' : ''}<div class="lobby-divider"></div><div class="intro-line"><h2><span id="player-count">${room.playerCount}</span> ${room.playerCount === 1 ? 'player' : 'players'} joined</h2><span class="pill">Waiting to start</span></div><div class="player-chips" id="player-chips">${room.players.length ? room.players.map(p => `<span class="player-chip">${escape(p.name)}</span>`).join('') : '<p class="subtle">Your team will appear here as they join.</p>'}</div>${error()}${room.host ? `<button class="primary start-round" data-action="advance" ${!room.playerCount || state.busy ? 'disabled' : ''}>${state.busy ? 'Starting…' : 'Start first question'}</button>` : '<p class="waiting-note">Waiting for your host…</p>'}</section><div class="right-stack"><section class="paper-card"><div class="eyebrow">BEFORE WE START</div><ol class="rules-list"><li><span class="rule-n">01</span><div><strong>${seconds} seconds. One answer.</strong>${room.factSheet ? 'Use the fact sheet, then choose. Your first answer is final.' : 'Tap your choice as soon as you’re ready. You can’t change it.'}</div></li><li><span class="rule-n">02</span><div><strong>Correct + quick = more points</strong>Score up to 1,000 on each question. No points for wrong or late answers.</div></li><li><span class="rule-n">03</span><div><strong>Learn after each decision</strong>The answer and top three appear when the timer ends.</div></li></ol></section><section class="note-card"><h3>About this round</h3><p>${escape(room.story)}</p><p class="amount-key">USD · k = thousand · m = million</p>${sourceLinks(room.sources)}</section>${renderFactPanel(room.factSheet, state.factPanelOpen)}</div></div>`;
}
function questionView(room) {
  const q = room.question, reveal = room.phase === 'reveal';
  const answered = room.ownAnswer || state.pendingAnswer !== null;
  const selected = room.ownAnswer?.selected ?? state.pendingAnswer;
  main.innerHTML = `<div class="live-top"><div><span class="eyebrow">${escape(room.title)}</span><h1 class="live-h1">Decision ${room.questionIndex + 1}<span> / ${room.questionCount}</span></h1></div><span class="pill">ROOM ${escape(room.code)} · ${room.playerCount} players</span></div><div class="live-layout ${room.factSheet ? 'has-facts' : ''}"><section class="question-stage"><div class="stage-top"><span>${escape(q.stage || names[q.topic] || q.topic)}</span><div class="timer ${reveal ? 'expired' : ''}" role="timer" aria-label="Seconds remaining"><span id="seconds">${reveal ? '0' : room.questionDurationMs / 1000}</span><small>SECONDS</small></div></div><div class="timer-track"><div id="timer-fill"></div></div>${q.basis ? `<span class="question-basis">${escape(q.basis)}</span>` : ''}${room.factSheet ? '<button type="button" class="question-reference-link" data-action="open-facts"><span>Use the financial reference as you decide</span><span>Fact sheet ↗</span></button>' : ''}<h2 class="live-prompt" id="live-question" tabindex="-1">${escape(q.prompt)}</h2><div class="live-options" role="group" aria-labelledby="live-question">${q.options.map((option, index) => `<button class="live-option answer-${index} ${selected === index ? 'chosen' : ''} ${reveal ? q.correct === index ? 'correct' : 'muted-option' : ''}" data-action="answer" data-answer="${index}" ${room.host || reveal || answered || state.busy ? 'disabled' : ''}><span class="answer-symbol" aria-hidden="true"><img src="/icon-${['triangle', 'diamond', 'circle', 'square'][index]}.svg" width="27" height="27" alt=""></span><span>${escape(option)}</span>${reveal && q.correct === index ? '<img class="correct-tick" src="/icon-check-circle.svg" width="28" height="28" alt="Correct answer">' : ''}</button>`).join('')}</div><div class="answer-status" id="answer-status" role="status">${room.host ? `${room.answeredCount} / ${room.playerCount} answers received` : reveal ? room.ownAnswer ? room.ownAnswer.correct ? `Correct! +${room.ownAnswer.points} points` : 'That wasn’t the right choice. 0 points.' : 'No answer received in time. 0 points.' : answered ? 'Answer locked. Waiting for the timer…' : 'Choose your answer. Your first choice is final.'}</div>${error()}${reveal ? `<section class="explanation"><strong>Why this matters</strong><p>${escape(q.explanation)}</p>${q.reviewOf?`<p class="review-origin"><strong>Review question:</strong> From ${escape(q.reviewOf.title)} · ${escape(q.reviewOf.createdAt.slice(0,10))}</p>`:''}${renderLearning(q.learning)}${renderValueConnection(q.valueConnection)}${q.discussion ? `<p class="discussion-prompt"><strong>Discuss:</strong> ${escape(q.discussion)}</p>` : ''}${sourceLinks(q.sources)}</section>${room.host ? `<button class="primary light next-live" data-action="advance" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Opening…' : room.questionIndex + 1 === room.questionCount ? 'Show final podium' : 'Next question'}</button>` : '<p class="waiting-note">Pause to discuss the explanation. Your host will advance when the group is ready.</p>'}` : ''}</section><div class="live-reference-column">${renderFactPanel(room.factSheet, state.factPanelOpen, !reveal)}<aside class="paper-card rankings"><div class="eyebrow">${reveal ? 'AFTER THIS DECISION' : 'FROM COMPLETED DECISIONS'}</div><h2>Top three</h2>${topThree(room)}${room.you ? `<div class="your-standing"><span>Your standing</span><strong>#${room.you.rank} · ${room.you.score.toLocaleString()} pts</strong></div>` : ''}<p class="field-help">${reveal ? 'Ties: most correct, then fastest correct answers.' : 'Scores update when the timer ends.'}</p></aside></div></div>`;
  tick();
}
function finished(room) {
  main.innerHTML = heading('The final three.', room.title, '<button class="secondary" data-action="home">Back to live games</button>') + `<section class="final-stage"><div class="eyebrow">ROUND COMPLETE · ${room.playerCount} PLAYERS</div><h2>Good decisions rise to the top.</h2>${topThree(room, true)}${room.you ? `<p class="final-standing">You finished <strong>#${room.you.rank}</strong> with <strong>${room.you.score.toLocaleString()} points</strong> · ${room.you.correct}/${room.questionCount} correct${room.reviewCount?`<span class="review-accuracy">${room.you.reviewCorrect}/${room.you.reviewTotal} review questions correct</span>`:''}</p>` : ''}</section>${error()}${room.host ? `<div class="intro-line results-heading"><div><h2>Team results</h2><p class="subtle">Saved automatically. ${room.reviewCount?'Review correct counts repeated questions separately from the speed score.':'Compare earlier rounds or replay this set to check retention.'}</p></div><div class="saved-actions"><button class="secondary" data-action="replay" data-code="${room.code}">Replay these questions</button><a class="secondary" href="/api/live/results.csv?code=${room.code}">Download CSV</a></div></div><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Manager</th><th>Points</th><th>Correct</th>${room.reviewCount?'<th>Review correct</th>':''}</tr></thead><tbody>${room.results.map(p => `<tr><td>#${p.rank}</td><td><strong>${escape(p.name)}</strong><small>${p.participantType==='guest'?'Guest · name provided by player':escape(p.email)}</small></td><td class="score-number">${p.score.toLocaleString()}</td><td>${p.correct}/${room.questionCount}</td>${room.reviewCount?`<td>${p.reviewCorrect}/${p.reviewTotal}</td>`:''}</tr>`).join('')}</tbody></table></div><section class="paper-card breakdown"><h2>Discussion prompts</h2>${room.review.map(q => `<details class="discussion"><summary>${escape(q.prompt)}</summary><p><strong>${escape(q.options[q.correct])}</strong><br>${escape(q.explanation)}</p>${renderLearning(q.learning)}${renderValueConnection(q.valueConnection)}${q.discussion ? `<p><strong>Discuss:</strong> ${escape(q.discussion)}</p>` : ''}${sourceLinks(q.sources)}</details>`).join('')}</section>` : '<p class="share-note">Your score is saved for your host. Use the preparation guide before your next round.</p>'}${room.factSheet ? `<div class="finished-facts">${renderFactPanel(room.factSheet, state.factPanelOpen)}</div>` : ''}${personalPreparation(room)}`;
}
function renderLearning(learning) {
  if(!learning) return '';
  return `<section class="learning-note"><strong>${escape(learning.term)}</strong><p>${escape(learning.definition)}</p><h3>Where to look</h3><p>${escape(learning.lookFor)}</p><div class="learning-links">${learning.links.map(link=>`<a class="secondary" href="${escape(link.url.startsWith('/prepare#') && state.code ? link.url.replace('/prepare#','/prepare?room='+state.code+'#') : link.url)}">${escape(link.label)}</a>`).join('')}</div><h3>Before your next round</h3><p>${escape(learning.prepare)}</p></section>`;
}
function personalPreparation(room) {
  if(!room.learningReview?.length) return '';
  const missed=room.learningReview.filter(item=>!item.correct), items=missed.length?missed:room.learningReview.slice(0,3);
  return `<section class="preparation-summary"><h2>Prepare for your next round</h2><p class="subtle">${missed.length ? `${missed.length} concepts worth revisiting. Use these pointers to build understanding; unanswered questions are included.` : 'You answered every question correctly. Practice explaining these ideas in your own words.'}</p>${items.map(item=>renderLearning(item.learning)).join('')}<a class="primary" href="/prepare" data-view="prepare">Open preparation guide</a></section>`;
}
async function prepareView(push=true) {
  const generation=++state.generation; state.actionToken++; state.busy=false; state.stopPoll=true; state.view='prepare'; nav();
  if(push)history.pushState(null,'','/prepare');
  main.innerHTML='<div class="loading">Opening the preparation guide…</div>';
  try {
    state.learning ??= await api('/api/learning'); if(generation!==state.generation)return;
    main.innerHTML=heading('Prepare to make the call.', 'Learn the financial context before your session, then use the fact sheet as you play.')+`<section class="paper-card leadership-guide"><div class="eyebrow">LEADERSHIP ROUND</div><h2>Know what the numbers tell you.</h2><p>${state.session.leadershipRound?.questionCount || 8} questions · ${(state.session.leadershipRound?.durationMs || 25000) / 1000} seconds each · host-led discussion after each answer. Review company revenue, gross margin, North America sales, cash, share price, and personnel costs. Read each figure’s scope and period: quarterly results and annual personnel costs answer different questions.</p><a class="secondary" href="/facts" data-view="facts">Open financial fact sheet</a></section><section class="note-card"><h3>Build the foundations</h3><p>The beginner track has 8 questions, 40 seconds each, and discussion after every answer. Begin with familiar decisions, then learn the business terms. Beginner 1 is the starting round; Beginner 2 gives another chance to practice.</p><p>Before the next round, pick two concepts, read their definitions, and explain an example in your own words. For actual plant figures or a proposal, ask Operations and the controller to validate your assumptions.</p></section>${state.code?`<p class="guide-return"><button class="secondary" data-action="open" data-code="${escape(state.code)}">Return to your round</button></p>`:''}<div class="learning-grid">${state.learning.topics.map(topic=>`<article class="paper-card" id="${escape(topic.id)}"><h2>${escape(topic.term)}</h2><p>${escape(topic.definition)}</p><h3>Where to look</h3><p>${escape(topic.lookFor)}</p><h3>Practice before the next round</h3><p>${escape(topic.prepare)}</p><div class="learning-links">${topic.links.filter(link=>!link.url.startsWith('/prepare')).map(link=>`<a class="secondary" href="${escape(link.url.startsWith('/prepare#') && state.code ? link.url.replace('/prepare#','/prepare?room='+state.code+'#') : link.url)}">${escape(link.label)}</a>`).join('')}</div></article>`).join('')}</div>`;
    const id=decodeURIComponent(location.hash.slice(1)); if(id)document.getElementById(id)?.scrollIntoView(); else main.focus();
  } catch(e) {if(generation===state.generation)main.innerHTML=`<div class="error">${escape(e.message)}</div><a class="secondary" href="/prepare">Try again</a>`;}
}
function renderRoom() {
  const room = state.room; if (!room) return;
  const panel = document.getElementById('live-fact-panel');
  const panelScroll = document.getElementById('fact-panel-content')?.scrollTop || 0;
  const detailStates = new Map(Array.from(panel?.querySelectorAll('details') || []).map(detail => [detail.querySelector('summary')?.textContent, detail.open]));
  const focusedReference = panel?.contains(document.activeElement) ? document.activeElement.dataset.factFocus : null;
  if (panel) state.factPanelOpen = panel.open;
  state.view = 'room'; nav();
  if (room.phase === 'lobby') lobby(room); else if (room.phase === 'finished') finished(room); else questionView(room);
  const content = document.getElementById('fact-panel-content');
  content?.querySelectorAll('details').forEach((detail, index) => { const summary = detail.querySelector('summary'); if (summary) { if (detailStates.has(summary.textContent)) detail.open = detailStates.get(summary.textContent); summary.dataset.factFocus = `reference-detail-${index}`; } });
  content?.querySelectorAll('.compact-competitors a').forEach((link, index) => { link.dataset.factFocus = `peer-source-${index}`; });
  if (content) content.scrollTop = panelScroll;
  if (focusedReference) Array.from(main.querySelectorAll('[data-fact-focus]')).find(element => element.dataset.factFocus === focusedReference)?.focus({ preventScroll: true });
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
  const fill = document.getElementById('timer-fill'); if (fill) fill.style.width = remaining / state.room.questionDurationMs * 100 + '%';
  if (!remaining) { main.querySelectorAll('[data-action="answer"]').forEach(button => button.disabled = true); const label = document.getElementById('answer-status'); if (label && !state.room.host) label.textContent = 'Time is up. Revealing the answer…'; }
}
setInterval(tick, 80);
async function openRoom(code) {
  state.generation++; state.actionToken++; state.busy = false; state.pollBusy = false; state.stopPoll = true; state.room = null; state.code = code; state.factPanelOpen = !window.matchMedia('(max-width: 950px)').matches; state.pendingAnswer = null; state.view = 'room'; state.error = '';
  history.replaceState(null, '', '/?room=' + code); main.innerHTML = '<div class="loading">Connecting to the live room…</div>'; state.stopPoll = false; await poll();
  if (!state.room) { state.stopPoll = true; const message = state.error; await home(); state.error = message; document.getElementById('live-error').hidden = false; document.getElementById('live-error').textContent = message; }
}
async function hostsView() {
  const generation=++state.generation; state.actionToken++; state.busy=false; state.stopPoll=true; state.view='hosts'; state.error=''; nav();
  if(!state.session.isOwner) { main.innerHTML='<section class="empty"><h2>The owner manages host access.</h2><p>Ask the owner to add the email you use to sign in with ChatGPT.</p><a class="primary" href="/" data-view="home">Back to live games</a></section>'; return; }
  main.innerHTML='<div class="loading">Loading host access…</div>';
  try {
    const data=await api('/api/live/hosts'); if(generation!==state.generation) return;
    main.innerHTML=heading('Choose who can host.', 'Add the email each person uses to sign in with ChatGPT.')+`<div class="game-layout"><section class="paper-card access-form-card"><h2>Add a host</h2><form id="host-access-form"><label class="field-label" for="host-name">Name <span class="optional-label">(optional)</span></label><input class="text-input" id="host-name" name="name" autocomplete="off" maxlength="80" placeholder="Matilda"><label class="field-label" for="host-email">ChatGPT sign-in email</label><input class="text-input" id="host-email" name="email" type="email" autocomplete="off" maxlength="254" required placeholder="Their account email"><p class="field-help">They open this site and sign in with that account. If already signed in, they can refresh to see the hosting controls.</p><div id="host-access-error" class="error" role="alert" hidden></div><button class="primary add-host" type="submit">Add host</button></form></section><section class="note-card host-permissions"><h3>What host access includes</h3><ul><li>Create leadership or beginner rounds and replay saved sessions.</li><li>Start and advance their own sessions.</li><li>Review, replay, and export their own results.</li></ul><p>You control the host list. Players can join with a room code and name, without signing in.</p><p>Removing a host stops their hosting access. Their saved sessions stay intact.</p><button class="secondary" data-action="copy-site">Copy site link</button></section></div><div class="intro-line results-heading"><div><h2>Who can host</h2><p class="subtle">Your owner account plus ${data.hosts.length} approved ${data.hosts.length===1?'host':'hosts'}.</p></div></div><div class="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Access</th></tr></thead><tbody><tr><td><strong>${escape(state.session.user.name)}</strong><small>${escape(state.session.user.email)}</small></td><td>Owner</td><td class="subtle">Permanent</td></tr>${data.hosts.map(host=>`<tr><td><strong>${escape(host.name||'Approved host')}</strong><small>${escape(host.email)}</small></td><td>Host</td><td><button class="table-link revoke-host" data-action="revoke-host" data-email="${escape(host.email)}">Remove access</button></td></tr>`).join('')}</tbody></table></div>`;
  } catch(e) { if(generation===state.generation) main.innerHTML=`<div class="error" role="alert">${escape(e.message)}</div><button class="secondary" data-action="hosts">Try again</button>`; }
}
async function historyView() {
  state.generation++; state.actionToken++; state.busy = false; state.stopPoll = true; state.view = 'history'; nav(); main.innerHTML = '<div class="loading">Loading saved rounds…</div>';
  if (!state.session.canHost) { main.innerHTML = '<div class="empty"><h2>Saved rounds are private.</h2><a class="primary" href="/">Return to the live game</a></div>'; return; }
  try {
    state.rooms = (await api('/api/live/rooms')).rooms;
    main.innerHTML = heading('Every round, remembered.', 'Review results, replay a completed set, or resume an open round.', '<button class="primary" data-action="home">Host a new round</button>') + `${state.rooms.length ? `<div class="table-wrap"><table><thead><tr><th>Round</th><th>Room</th><th>Status</th><th>Created · UTC</th><th></th></tr></thead><tbody>${state.rooms.map(r => `<tr><td>${escape(r.title)}</td><td class="week-tag">${r.code}</td><td>${r.phase === 'finished' ? 'Complete' : r.phase === 'lobby' ? 'Lobby open' : 'In progress'}</td><td>${escape(new Date(r.created_at).toLocaleString('en-US', { timeZone: 'UTC' }))}</td><td><div class="saved-actions"><button class="table-link" data-action="open" data-code="${r.code}">Open</button>${r.phase==='finished'?`<button class="table-link" data-action="replay" data-code="${r.code}">Replay questions</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>` : '<section class="empty"><h2>No rounds yet.</h2><p>Host your first live game. Completed scores will appear here.</p><button class="primary" data-action="home">Host a round</button></section>'}`;
  } catch (e) { main.innerHTML = `<div class="error" role="alert">${escape(e.message)}</div><button class="secondary" data-action="history">Try again</button>`; }
}
main.addEventListener('input', event => { if (event.target.id === 'room-code') state.code = event.target.value.toUpperCase(); });
main.addEventListener('change',event=>{if(['track-select','round-select','format-select'].includes(event.target.id)) updateHostChoice();});
main.addEventListener('submit', async event => {
  if(event.target.id==='host-access-form') {
    event.preventDefault(); if(state.busy) return;
    const generation=state.generation,token=++state.actionToken,submit=event.target.querySelector('button[type="submit"]'); state.busy=true; submit.disabled=true;
    const body={email:document.getElementById('host-email').value,name:document.getElementById('host-name').value};
    try { await api('/api/live/hosts/grant',body); if(generation!==state.generation || token!==state.actionToken) return; state.busy=false; await hostsView(); toast('Host access added. They can sign in and start a round.'); }
    catch(e) { if(generation!==state.generation || token!==state.actionToken) return; state.busy=false; submit.disabled=false; const error=document.getElementById('host-access-error'); error.hidden=false; error.textContent=e.message; }
    return;
  }
  if (!['host-form', 'join-form'].includes(event.target.id)) return;
  event.preventDefault(); if (state.busy) return; state.busy = true; state.error = '';
  const host = event.target.id === 'host-form', code = document.getElementById('room-code')?.value.toUpperCase(), name = document.getElementById('player-name')?.value, round = Number(document.getElementById('round-select')?.value);
  const track=document.getElementById('track-select')?.value || 'leadership', format=['leadership','competitors'].includes(track)?'current':document.getElementById('format-select')?.value, sourceCode=document.getElementById('review-select')?.value;
  const generation=state.generation, token=++state.actionToken;
  const submit=event.target.querySelector('button[type="submit"]'); if(submit) submit.disabled=true;
  try { const result = host ? await api('/api/live/create', { track, ...(track==='beginner'?{beginnerRound:round}:{}), format, ...(format==='mixed'?{sourceCode}:{}) }) : await api('/api/live/join', { code, name }); if (generation!==state.generation || token!==state.actionToken) return; if (result.guest) state.session.guest = result.guest; state.busy = false; await openRoom(result.code); }
  catch (e) { if (generation!==state.generation || token!==state.actionToken) return; state.busy = false; if(submit) submit.disabled=false; state.error = e.message; const el = document.getElementById('live-error'); if (el) { el.hidden = false; el.textContent = state.error; } }
});
main.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'open-facts') { showRoomFacts(); return; }
  if (action === 'return-decision') { document.getElementById('live-question')?.focus(); return; }
  if (action === 'print-facts') { window.print(); return; }
  if (action === 'home') { state.code = ''; history.replaceState(null, '', '/'); home(); }
  if (action === 'history') await historyView();
  if (action === 'hosts') await hostsView();
  if (action === 'copy-site') { try { await navigator.clipboard.writeText(location.origin+'/'); toast('Site link copied.'); } catch { toast('Site link: '+location.origin+'/'); } }
  if (action === 'revoke-host' && !state.busy) {
    const generation=state.generation,token=++state.actionToken; state.busy=true; button.disabled=true;
    try { await api('/api/live/hosts/revoke',{email:button.dataset.email}); if(generation!==state.generation || token!==state.actionToken) return; state.busy=false; await hostsView(); toast('Host access removed.'); }
    catch(e) { if(generation!==state.generation || token!==state.actionToken) return; state.busy=false; button.disabled=false; toast(e.message); }
  }
  if (action === 'open') await openRoom(button.dataset.code);
  if (action === 'replay' && !state.busy) {
    const generation=state.generation, token=++state.actionToken; state.busy=true; button.disabled=true;
    try { const result=await api('/api/live/create',{format:'replay',sourceCode:button.dataset.code}); if(generation!==state.generation || token!==state.actionToken) return; state.busy=false; await openRoom(result.code); }
    catch(e) { if(generation!==state.generation || token!==state.actionToken) return; state.busy=false; button.disabled=false; toast(e.message); }
  }
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
  try { state.session = await api('/api/session'); state.code = (new URLSearchParams(location.search).get('room') || '').toUpperCase(); nav(); if(location.pathname==='/competitors') await competitorsView(false); else if(location.pathname==='/facts') await factsView(false); else if(location.pathname==='/prepare') await prepareView(false); else if (location.pathname === '/hosts') await hostsView(); else if (location.pathname === '/results') await historyView(); else if (['/decoder','/drivers','/vocabulary'].includes(location.pathname)) await openReference(location.pathname.slice(1),false); else { await home(); const participant=state.session.user || state.session.guest; if (participant && /^[A-Z2-9]{6}$/.test(state.code)) { try { const result=await api('/api/live/join', { code: state.code, name: participant.name }); if(result.guest) state.session.guest=result.guest; await openRoom(state.code); } catch (e) { state.error = e.message; const el = document.getElementById('live-error'); el.hidden = false; el.textContent = e.message; } } else if (state.code) document.getElementById('player-name')?.focus(); } registerTools(); }
  catch (e) { main.innerHTML = `<div class="empty"><h2>The game could not open.</h2><p>${escape(e.message)}</p><a class="primary" href="/">Try again</a></div>`; }
}
function registerTools() {
  if (!document.modelContext?.registerTool) return;
  const lifecycle = new AbortController();
  try { Promise.resolve(document.modelContext.registerTool({ name: 'read_live_round', title: 'Read current live round', description: 'Read the current room phase, timer and top three. Does not answer or advance the game.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input) { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Pass an empty object.'); if (!state.room) throw new Error('Join or host a room first.'); return { code: state.room.code, phase: state.room.phase, question: state.room.questionIndex + 1, secondsRemaining: state.room.phase === 'question' ? Math.ceil(Math.max(0, state.deadlinePerf - performance.now()) / 1000) : 0, top3: state.room.top3 }; } }, { signal: lifecycle.signal })).catch(() => {}); } catch {}
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
function showRoomFacts() {
  const panel = document.getElementById('live-fact-panel');
  if (!panel) return false;
  state.factPanelOpen = true;
  panel.open = true;
  panel.querySelector('summary')?.focus();
  panel.scrollIntoView({ block: 'nearest' });
  return true;
}
async function factsView(push = true) {
  const generation = ++state.generation; state.actionToken++; state.busy = false; state.stopPoll = true; state.view = 'facts'; state.error = ''; nav();
  if (push) history.pushState(null, '', '/facts');
  main.innerHTML = '<div class="loading">Opening the financial fact sheet…</div>';
  try {
    state.leadershipFacts ??= await api('/api/leadership-facts');
    if (generation !== state.generation) return;
    main.innerHTML = `<div class="facts-page"><div class="facts-page-head"><div><div class="eyebrow">CNH · NORTH AMERICA HR</div><h1>Financial fact sheet</h1><p class="subtle">${escape(state.leadershipFacts.period)} · Reference for leadership decisions</p></div><button type="button" class="secondary" data-action="print-facts">Print / save as PDF</button></div><div class="facts-page-sheet">${renderFactSheet(state.leadershipFacts)}</div><div class="reference-next"><a class="primary" href="/" data-view="home">Go to live game</a><a class="secondary" href="/decoder" data-view="decoder">Explore the quarter decoder</a></div></div>`;
    main.focus();
  } catch (e) {
    if (generation === state.generation) main.innerHTML = `<div class="error" role="alert">${escape(e.message)}</div><button class="secondary" data-view="facts">Try again</button>`;
  }
}
async function competitorsView(push = true) {
  const generation = ++state.generation; state.actionToken++; state.busy = false; state.stopPoll = true; state.view = 'competitors'; state.error = ''; nav();
  if (push) history.pushState(null, '', '/competitors');
  main.innerHTML = '<div class="loading">Opening CNH vs John Deere…</div>';
  try {
    state.competitorFacts ??= await api('/api/competitor-facts');
    if (generation !== state.generation) return;
    main.innerHTML = `<div class="competitor-page"><div class="facts-page-head"><div><div class="eyebrow">CNH · NORTH AMERICA HR</div><h1>CNH vs John Deere</h1><p class="subtle">${escape(state.competitorFacts.period)} · The detailed numbers. What they mean. Why they matter.</p></div><button type="button" class="secondary" data-action="print-facts">Print / save as PDF</button></div>${renderCompetitorSheet(state.competitorFacts)}<div class="reference-next"><a class="primary" href="/" data-view="home">Go to live game</a><a class="secondary" href="/facts" data-view="facts">CNH financial fact sheet</a></div></div>`;
    bindCompetitorSheet(main); main.focus();
  } catch(e) {
    if(generation===state.generation) main.innerHTML=`<div class="error" role="alert">${escape(e.message)}</div><button class="secondary" data-view="competitors">Try again</button>`;
  }
}
async function openReference(view, push = true) {
  const generation = ++state.generation; state.actionToken++; state.busy = false; state.stopPoll = true; state.view = view; state.error = ''; nav();
  if (push) history.pushState(null, '', '/'+view);
  main.innerHTML = '<div class="loading">Opening the business reference…</div>';
  try {
    state.context ??= await api('/api/business-context');
    if (state.generation !== generation) return;
    main.innerHTML = referenceView(view,state.context); main.focus();
  } catch(e) { if(state.generation===generation) main.innerHTML = `<div class="error" role="alert">${escape(e.message)}</div><button class="secondary" data-view="${view}">Try again</button>`; }
}
bindReference(main);
document.addEventListener('click',async event=>{
  const link=event.target.closest('[data-view]'); if(!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); if(!state.session) return;
  const view=link.dataset.view;
  if(view==='home'){state.code='';history.pushState(null,'','/');home();}
  else if(view==='history'){history.pushState(null,'','/results');await historyView();}
  else if(view==='facts') { if(state.view==='room') { if(!showRoomFacts()) window.open('/facts', '_blank', 'noopener'); return; } await factsView(); }
  else if(view==='competitors') { if(state.view==='room' && state.room?.factSheet?.kind==='competitors') { showRoomFacts(); return; } await competitorsView(); }
  else if(view==='prepare') await prepareView();
  else if(view==='hosts'){history.pushState(null,'','/hosts');await hostsView();}
  else await openReference(view);
});
window.addEventListener('popstate',async()=>{
  if(!state.session)return;
  if(['/decoder','/drivers','/vocabulary'].includes(location.pathname)) await openReference(location.pathname.slice(1),false);
  else if(location.pathname==='/competitors')await competitorsView(false);
  else if(location.pathname==='/facts')await factsView(false);
  else if(location.pathname==='/prepare')await prepareView(false);
  else if(location.pathname==='/results')await historyView();
  else if(location.pathname==='/hosts')await hostsView();
  else {state.code=(new URLSearchParams(location.search).get('room')||'').toUpperCase();if(state.code&&(state.session.user||state.session.guest))await openRoom(state.code);else home();}
});
start();
