const STORAGE_KEY = 'cnh-finance-practice-v1';
const main = document.getElementById('practice-main');
const state = { round: null, identity: '', stage: 'intro', index: 0, startedAt: null, pending: null, results: [], busy: false, error: '', epoch: 0, request: 0 };
let ticker, toastTimer;
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const number = value => Number(value).toLocaleString();

function safeUrl(value) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\\]/.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
function link(item, className = '') {
  const url = safeUrl(item?.url);
  return url ? `<a${className ? ` class="${escape(className)}"` : ''} href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(item.label || item.title || 'Read the source')} ↗</a>` : '';
}
function sourceLinks(items = []) {
  const links = Array.isArray(items) ? items.map(item => link(item)).filter(Boolean) : [];
  return links.length ? `<div class="sources"><strong>Source reading</strong>${links.join('')}</div>` : '';
}
function fingerprint(round) {
  if (typeof round.setId === 'string' && round.setId) return round.setId;
  let hash = 2166136261;
  for (const character of JSON.stringify([round.title, round.durationMs, round.questions])) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `questions-${hash >>> 0}`;
}
function score() { return state.results.reduce((total, result) => total + (result?.points || 0), 0); }
function correctCount() { return state.results.filter(result => result && result.selected === result.correct).length; }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ identity: state.identity, stage: state.stage, index: state.index, startedAt: state.startedAt, pending: state.pending, results: state.results })); } catch { /* Playing still works when browser storage is unavailable. */ }
}
function validResult(result, index) {
  const options = state.round.questions[index]?.options;
  return !!options && result && Number.isInteger(result.correct) && result.correct >= 0 && result.correct < options.length && (result.selected === null || Number.isInteger(result.selected) && result.selected >= 0 && result.selected < options.length) && Number.isFinite(result.points) && result.points >= 0 && result.points <= 1000;
}
function restore() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return; }
  if (!saved || saved.identity !== state.identity || !['intro', 'question', 'reveal', 'final'].includes(saved.stage) || !Number.isInteger(saved.index) || saved.index < 0 || saved.index >= state.round.questionCount || !Array.isArray(saved.results) || saved.results.length > state.round.questionCount) return;
  const previousCount = saved.stage === 'final' ? state.round.questionCount : saved.index;
  if (saved.results.slice(0, previousCount).length !== previousCount || saved.results.slice(0, previousCount).some((result, index) => !validResult(result, index))) return;
  if (saved.stage === 'reveal' && !validResult(saved.results[saved.index], saved.index)) return;
  if (saved.stage === 'question' && (!Number.isFinite(saved.startedAt) || saved.startedAt > Date.now() + 1000)) return;
  if (saved.pending && (!(saved.pending.selected === null || Number.isInteger(saved.pending.selected) && saved.pending.selected >= 0 && saved.pending.selected < 4) || !Number.isFinite(saved.pending.elapsedMs) || saved.pending.elapsedMs < 0)) return;
  Object.assign(state, { stage: saved.stage, index: saved.index, startedAt: saved.startedAt, pending: saved.stage === 'question' ? saved.pending || null : null, results: saved.results });
}
async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The round could not be opened.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The connection took too long. Try again.');
    throw error;
  } finally { clearTimeout(timeout); }
}
function showToast(message) {
  const toast = document.getElementById('practice-toast');
  toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}
function errorCard(action = 'retry-answer') {
  return state.error ? `<div class="error-card" role="alert"><p>${escape(state.error)}</p><button class="secondary" data-action="${action}" ${state.busy ? 'disabled' : ''}>${action === 'reload' ? 'Try opening again' : 'Retry checking answer'}</button></div>` : '';
}
function renderIntro() {
  main.innerHTML = `<div class="intro-grid"><section class="intro-stage"><div class="eyebrow">FIRST ROUND · NO ACCOUNT NEEDED</div><h1>A little finance.<br><span>A little fun.</span></h1><p>Try eight beginner questions, from everyday decisions to CNH business basics. Play whenever you like, then see the explanation after each answer.</p><div class="intro-meta"><span>${state.round.questionCount} questions</span><span>${state.round.durationMs / 1000} seconds each</span><span>Your own practice score</span></div><div class="action-row"><button class="primary" data-action="start">Start round →</button><button class="secondary" data-action="copy-link">Copy game link</button></div><p class="intro-footnote">No room code, sign-in, or host needed.</p></section><aside class="paper-card"><div class="eyebrow">HERE’S HOW TO PLAY</div><h2>Guess, learn, try again.</h2><ol class="rules"><li><span class="rule-n">01</span><div><strong>Choose A, B, C, or D.</strong>Your first answer is final. A correct, faster answer earns more points.</div></li><li><span class="rule-n">02</span><div><strong>Find the information.</strong>“Where to learn this” opens the relevant guide in a new tab. The question timer keeps running.</div></li><li><span class="rule-n">03</span><div><strong>Take your time with the explanation.</strong>Read why, then tap “Next question” when you’re ready.</div></li></ol><div class="guide-note"><p>Want to read the basics before you start?</p>${link({ label: 'Open preparation guide', url: '/prepare' }, 'text-link')}</div><p class="feedback-note">Testing this with Nick? Tell him which question, answer, or explanation felt confusing. Your practice score stays separate from live games.</p></aside></div>`;
}
function renderLearning(result) {
  const learning = result.learning;
  const reference = state.round.questions[state.index].reference;
  const items = Array.isArray(learning?.links) ? [...learning.links] : [];
  if (reference?.url && !items.some(item => item.url === reference.url)) items.unshift(reference);
  const links = items.map(item => link(item, 'secondary')).filter(Boolean).join('');
  return `<section class="learning-card"><div class="eyebrow">WHERE TO LEARN THIS</div>${learning?.term ? `<h3>${escape(learning.term)}</h3>` : ''}${learning?.definition ? `<p>${escape(learning.definition)}</p>` : ''}${learning?.lookFor ? `<h4>Find it here</h4><p>${escape(learning.lookFor)}</p>` : ''}<div class="learning-links">${links || link({ label: 'Preparation guide', url: '/prepare' }, 'secondary')}</div><p class="new-tab-note">Links open in a new tab. Your place in this round stays saved.</p>${learning?.prepare ? `<h4>Try explaining it</h4><p>${escape(learning.prepare)}</p>` : ''}</section>`;
}
function renderReveal(result) {
  const connection = result.valueConnection;
  return `<section class="reveal"><h3>WHY THIS IS THE RIGHT ANSWER</h3><p>${escape(result.explanation)}</p>${renderLearning(result)}${result.discussion ? `<p class="discussion-note"><strong>Talk it over</strong>${escape(result.discussion)}</p>` : ''}${connection?.name ? `<aside class="value-note"><span>CNH value connection</span><strong>${escape(connection.name)}</strong><p>${escape(connection.why)}</p>${connection.source ? sourceLinks([{ ...connection.source, label: 'CNH’s five values' }]) : ''}</aside>` : ''}${sourceLinks(result.sources)}<button class="primary next-question" data-action="next">${state.index + 1 === state.round.questionCount ? 'See my final score →' : 'Next question →'}</button></section>`;
}
function renderQuestion() {
  const question = state.round.questions[state.index], result = state.results[state.index];
  const reveal = state.stage === 'reveal', selected = reveal ? result.selected : state.pending?.selected;
  const stopped = reveal || !!state.pending;
  const status = reveal ? result.selected === null ? `Time’s up. The right answer is ${String.fromCharCode(65 + result.correct)}. 0 points.` : selected === result.correct ? `Correct! +${number(result.points)} points.` : `The right answer is ${String.fromCharCode(65 + result.correct)}. 0 points.` : state.pending ? state.error ? 'Your answer is locked. Retry to see the explanation.' : state.pending.selected === null ? 'Time’s up. Checking the answer…' : 'Answer locked. Checking the explanation…' : 'Choose your answer. Your first choice is final.';
  main.innerHTML = `<div class="round-top"><div><div class="eyebrow">${escape(state.round.title)}</div><h1>Question ${state.index + 1}<span> / ${state.round.questionCount}</span></h1></div><span class="practice-badge">PLAY ANYTIME</span></div><div class="question-layout"><section class="question-stage"><div class="stage-top"><span class="eyebrow">${escape(question.topic)}</span><div class="timer ${stopped ? 'stopped' : ''}" role="timer" aria-label="Seconds remaining"><span id="practice-seconds">0</span><small>SECONDS</small></div></div><div class="timer-track"><div id="practice-timer-fill"></div></div>${question.basis ? `<span class="basis">${escape(question.basis)}</span>` : ''}<h2 class="question-prompt" id="practice-question" tabindex="-1">${escape(question.prompt)}</h2><div class="question-links">${link(question.reference || { label: 'Where to learn this', url: '/prepare' })}<small>Opens a new tab · timer keeps running</small></div><div class="answers" role="group" aria-labelledby="practice-question">${question.options.map((option, index) => `<button class="answer${selected === index ? ' chosen' : ''}${reveal && result.correct === index ? ' correct' : ''}${reveal && selected === index && selected !== result.correct ? ' incorrect' : ''}" data-action="answer" data-answer="${index}" aria-pressed="${selected === index}" ${stopped ? 'disabled' : ''}><span class="answer-letter">${String.fromCharCode(65 + index)}</span><span class="answer-text">${escape(option)}</span>${reveal && result.correct === index ? '<span class="answer-mark" aria-label="Correct answer">✓</span>' : ''}</button>`).join('')}</div><p class="answer-status ${reveal && selected === result.correct ? 'correct-status' : ''}" role="status">${escape(status)}</p>${errorCard()}${reveal ? renderReveal(result) : ''}</section><aside class="paper-card score-card" aria-label="Your practice score"><div class="eyebrow">YOUR PRACTICE SCORE</div><div class="practice-score">${number(score())}</div><p class="score-label">points</p><div class="score-mini"><strong>${correctCount()} correct</strong><br>of ${state.results.filter(Boolean).length} completed</div>${link({ label: 'Preparation guide', url: '/prepare' }, 'text-link')}<p class="score-note">This score is just for your practice round.</p></aside></div>`;
  updateTimer();
}
function renderFinal() {
  const missed = state.results.map((result, index) => ({ result, question: state.round.questions[index] })).filter(item => item.result.selected !== item.result.correct);
  const review = missed.length ? missed : state.results.slice(0, 3).map((result, index) => ({ result, question: state.round.questions[index] }));
  main.innerHTML = `<section class="final-stage"><div class="eyebrow">FIRST ROUND COMPLETE</div><h1>${correctCount() === state.round.questionCount ? 'Eight for eight. Nicely done.' : 'You’ve got a round in.'}</h1><p>Every explanation is another chance to learn. Play again to see which ideas stick, or send Nick your score and tell him what felt confusing.</p><div class="final-numbers"><div><strong>${number(score())}</strong><span>practice points</span></div><div><strong>${correctCount()} / ${state.round.questionCount}</strong><span>correct answers</span></div></div><div class="action-row"><button class="primary" data-action="start">Replay practice →</button><button class="secondary" data-action="copy-score">Copy my score</button><button class="secondary" data-action="copy-link">Copy game link</button></div><p class="intro-footnote">Your practice score stays separate from live games.</p></section><section class="paper-card final-study"><div class="eyebrow">KEEP LEARNING</div><h2>${missed.length ? 'A few ideas to revisit.' : 'Try explaining these in your own words.'}</h2><div class="review-links">${review.map(({ result, question }) => { const url = safeUrl(question.reference?.url || '/prepare'); return `<a href="${escape(url || '/prepare')}" target="_blank" rel="noopener noreferrer"><span>${escape(result.learning?.term || question.topic)}</span><small>Learn more ↗</small></a>`; }).join('')}</div><p class="feedback-note">Tell Nick what was confusing: the question, the answer choices, or the explanation. Include the question number if you can.</p>${link({ label: 'Open preparation guide', url: '/prepare' }, 'text-link')}</section>`;
}
function render() { if (state.stage === 'intro') renderIntro(); else if (state.stage === 'final') renderFinal(); else renderQuestion(); }
function focusQuestion() { document.getElementById('practice-question')?.focus(); }
function startRound() {
  state.epoch++; state.request++;
  Object.assign(state, { stage: 'question', index: 0, startedAt: Date.now(), pending: null, results: [], busy: false, error: '' });
  persist(); render(); focusQuestion();
}
function nextQuestion() {
  if (state.stage !== 'reveal') return;
  state.error = ''; state.pending = null; state.startedAt = null;
  if (state.index + 1 === state.round.questionCount) state.stage = 'final';
  else { state.index++; state.stage = 'question'; state.startedAt = Date.now(); }
  persist(); render(); focusQuestion();
}
function updateTimer() {
  if (!state.round || !['question', 'reveal'].includes(state.stage)) return;
  const elapsed = state.pending?.elapsedMs ?? Math.max(0, Date.now() - state.startedAt);
  const remaining = state.stage === 'reveal' ? 0 : Math.max(0, state.round.durationMs - elapsed);
  const seconds = document.getElementById('practice-seconds');
  const fill = document.getElementById('practice-timer-fill');
  if (seconds) seconds.textContent = String(Math.ceil(remaining / 1000));
  if (fill) fill.style.width = `${remaining / state.round.durationMs * 100}%`;
}
function tick() {
  if (state.stage !== 'question' || state.pending || !state.round) return;
  updateTimer();
  if (Date.now() - state.startedAt >= state.round.durationMs) void submit(null);
}
async function submit(selected) {
  if (state.stage !== 'question' || state.busy || state.results[state.index]) return;
  if (!state.pending) {
    const elapsedMs = Math.max(0, Date.now() - state.startedAt);
    if (selected !== null && (!Number.isInteger(selected) || selected < 0 || selected >= 4)) return;
    state.pending = { selected: elapsedMs >= state.round.durationMs ? null : selected, elapsedMs: Math.min(elapsedMs, state.round.durationMs) };
    persist();
  }
  state.busy = true; state.error = '';
  const epoch = state.epoch, index = state.index, request = ++state.request;
  renderQuestion();
  try {
    const result = await api('/api/practice/answer', { method: 'POST', body: JSON.stringify({ ...(state.round.setId ? { setId: state.round.setId } : {}), questionIndex: index, ...state.pending }) });
    if (epoch !== state.epoch || request !== state.request || index !== state.index || state.stage !== 'question') return;
    if (!validResult(result, index) || result.selected !== state.pending.selected) throw new Error('The answer could not be checked. Try again.');
    state.results[index] = result; state.stage = 'reveal'; state.pending = null; state.error = '';
    persist();
  } catch (error) {
    if (epoch !== state.epoch || request !== state.request || index !== state.index || state.stage !== 'question') return;
    state.error = error.message || 'The connection dropped. Retry to check your locked answer.';
  } finally {
    if (epoch === state.epoch && request === state.request && index === state.index) { state.busy = false; render(); }
  }
}
async function copy(text, success) {
  try { await navigator.clipboard.writeText(text); showToast(success); }
  catch { showToast('Copy isn’t available here. Share this page’s address from your browser.'); }
}
main.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  switch (button.dataset.action) {
    case 'start': startRound(); break;
    case 'next': nextQuestion(); break;
    case 'answer': void submit(Number(button.dataset.answer)); break;
    case 'retry-answer': void submit(state.pending?.selected ?? null); break;
    case 'reload': void loadRound(); break;
    case 'copy-link': void copy(`${location.origin}/try`, 'Game link copied.'); break;
    case 'copy-score': void copy(`I tried CNH Finance Live: ${correctCount()}/${state.round.questionCount} correct, ${number(score())} practice points. ${location.origin}/try`, 'Your score is copied. Paste it into your message to Nick.'); break;
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
window.addEventListener('pageshow', tick);
async function loadRound() {
  const epoch = ++state.epoch;
  clearInterval(ticker);
  state.busy = true; state.error = '';
  main.innerHTML = '<div class="loading" role="status">Getting your first round ready…</div>';
  try {
    const round = await api('/api/practice/round');
    if (epoch !== state.epoch) return;
    if (!Array.isArray(round.questions) || round.questionCount !== round.questions.length || !round.questions.length || !Number.isFinite(round.durationMs) || round.durationMs <= 0 || round.questions.some(question => !Array.isArray(question.options) || question.options.length !== 4)) throw new Error('This round is not ready yet. Try opening it again.');
    Object.assign(state, { round, identity: fingerprint(round), stage: 'intro', index: 0, startedAt: null, pending: null, results: [], busy: false, error: '' });
    restore(); render(); ticker = setInterval(tick, 200);
    if (state.stage === 'question' && state.pending) void submit(state.pending.selected);
    else tick();
  } catch (error) {
    if (epoch !== state.epoch) return;
    state.busy = false; state.error = error.message || 'The round could not be opened.';
    main.innerHTML = `<section class="paper-card opening-error"><h1>Let’s get the round open.</h1><p>Check your connection, then try again.</p>${errorCard('reload')}</section>`;
  }
}
loadRound();
