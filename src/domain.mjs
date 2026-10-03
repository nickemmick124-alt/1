export function weekKey(date = new Date()) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
export function shiftWeek(week, n) {
  const date = new Date(week + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + n * 7);
  return date.toISOString().slice(0, 10);
}
export function validWeek(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}
export function challengeIndex(week, length) {
  return ((Math.floor((new Date(week + 'T00:00:00Z') - new Date('2026-09-28T00:00:00Z')) / 604800000) % length) + length) % length;
}
export function challengeForWeek(bank, week) {
  const index = challengeIndex(week, bank.length);
  const count = Math.floor((new Date(week + 'T00:00:00Z') - new Date('2026-09-28T00:00:00Z')) / 604800000);
  const cycle = Math.floor(count / bank.length);
  const factor = 1 + (((cycle % 40) + 40) % 40) / 10;
  const scale = value => value.replace(/\$([\d,]+)(?![\d,])/g, (_, amount) => '$' + Math.round(Number(amount.replaceAll(',', '')) * factor).toLocaleString('en-US'));
  const original = bank[index];
  const result = { ...original, story: scale(original.story), facts: original.facts.map(f => ({ label: f.label, value: scale(f.value) })), questions: original.questions.map((q, i) => {
    const rotation = ((count + i) % q.options.length + q.options.length) % q.options.length;
    const options = q.options.map(scale);
    return { ...q, prompt: scale(q.prompt), explanation: scale(q.explanation), options: [...options.slice(rotation), ...options.slice(0, rotation)], correct: (q.correct - rotation + q.options.length) % q.options.length };
  }) };
  return result;
}
export function publicChallenge(challenge) {
  return { ...challenge, questions: challenge.questions.map(({ correct, explanation, ...q }) => q) };
}
export function scoreAnswers(challenge, answers) {
  if (!Array.isArray(answers) || answers.length !== challenge.questions.length || answers.some((a, i) => !Number.isInteger(a) || a < 0 || a >= challenge.questions[i].options.length)) throw new Error('Choose an answer for all five decisions.');
  return challenge.questions.reduce((score, q, i) => score + (q.correct === answers[i] ? 20 : 0), 0);
}
export function safeCsv(value) {
  let s = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
