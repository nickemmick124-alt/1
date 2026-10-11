// Integrate into the server: never send future hints to the browser.
export function questionDuration(round, index) {
  const duration = round.questions[index]?.questionDurationMs ?? round.questionDurationMs ?? 40000;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid duration');
  return duration;
}

export function availableHelp(question, elapsedMs, durationMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return [];
  return (question.hints || []).filter(hint => {
    const threshold = hint.secondsBeforeDeadline !== undefined
      ? Math.max(0, durationMs - hint.secondsBeforeDeadline * 1000)
      : durationMs * hint.afterFraction;
    return elapsedMs >= threshold;
  });
}

export function assistanceStage(question, elapsedMs, durationMs) {
  return availableHelp(question, elapsedMs, durationMs).at(-1)?.kind || 'unassisted';
}

export function weeklyEdition(bank, now = new Date()) {
  // Epoch Thursday -> preceding Monday. Calendar rotation needs no unattended writer.
  const week = Math.max(0, Math.floor((now.getTime() - Date.parse(bank.rotation.anchor)) / (7 * 86400000)));
  const index = ((week % bank.rounds.length) + bank.rounds.length) % bank.rounds.length;
  return structuredClone(bank.rounds[index]);
}
