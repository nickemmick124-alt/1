export const levels = [
  { id: 'foundation', label: 'Foundations', description: 'Recognize the language and read the key signals.' },
  { id: 'apply', label: 'Apply', description: 'Use the evidence to choose an operating response.' },
  { id: 'stretch', label: 'Stretch', description: 'Weigh tradeoffs, challenge assumptions, and connect the evidence.' }
];

export function roundForLevel(bank, extensions, index, level = 'foundation') {
  const base = bank[index];
  const levelInfo = levels.find(item => item.id === level);
  if (!base || !levelInfo) throw new Error('Choose a valid week and level.');
  const questions = level === 'foundation' ? base.questions : extensions.find(set => set.round === index && set.level === level)?.questions;
  if (!questions || questions.length !== 5) throw new Error('This question set is not ready.');
  return { ...base, title: `Week ${index + 1} · ${levelInfo.label} · ${base.title.replace(/^Round \d+ · /, '')}`, weekNumber: index + 1, level, format: 'current', setId: `week-${index + 1}-${level}-v1`, questions: structuredClone(questions) };
}

export function shuffleRoundOptions(challenge, random = Math.random) {
  return { ...challenge, questions: challenge.questions.map(q => {
    const rotation = Math.floor(random() * q.options.length);
    return { ...q, options: [...q.options.slice(rotation), ...q.options.slice(0, rotation)], correct: (q.correct - rotation + q.options.length) % q.options.length };
  }) };
}

function shuffled(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function withReview(challenge, saved, sourceRoom, random = Math.random) {
  const old = saved.questions.map((q, index) => ({ ...structuredClone(q), reviewOf: { code: sourceRoom.code, questionIndex: index, title: sourceRoom.title, createdAt: sourceRoom.created_at } }));
  const review = shuffled(old, random).slice(0, 2);
  const currentCount = challenge.questions.length - 2;
  const current = shuffled(challenge.questions.filter(q => !review.some(previous => previous.id && previous.id === q.id || previous.prompt === q.prompt)), random).slice(0, currentCount);
  if (review.length !== 2 || current.length !== currentCount) throw new Error('Choose a different saved round for this review mix.');
  const sources = [...(challenge.sources || []), ...(saved.sources || [])].filter((source, index, all) => all.findIndex(item => item.url === source.url) === index);
  return { ...challenge, format: 'mixed', title: `${challenge.title} · Review mix`, story: `${challenge.story} ${currentCount} questions from the selected set plus two from the completed round “${sourceRoom.title}”. Earlier source dates remain attached to review questions.`, sources, reviewSource: { code: sourceRoom.code, title: sourceRoom.title, createdAt: sourceRoom.created_at }, questions: shuffled([...current, ...review], random) };
}

export function replayRound(saved, sourceRoom) {
  return { ...structuredClone(saved), format: 'replay', title: `Replay · ${sourceRoom.title.replace(/^Replay · /, '')}`, story: `The same ${saved.questions.length} questions from “${sourceRoom.title}”, originally played ${sourceRoom.created_at.slice(0, 10)}. Original figures, periods, explanations, and sources are preserved; answer positions may change.`, replayOf: sourceRoom.code, reviewSource: { code: sourceRoom.code, title: sourceRoom.title, createdAt: sourceRoom.created_at }, questions: saved.questions.map((q, index) => ({ ...structuredClone(q), reviewOf: { code: sourceRoom.code, questionIndex: index, title: sourceRoom.title, createdAt: sourceRoom.created_at } })) };
}
