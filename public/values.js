const escapeValueText = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function resolveValueConnection(question, policy) {
  const stored = question.valueConnection;
  // New rooms save the complete connection. Preserve its wording in later reviews.
  if (stored?.name && stored?.why && stored?.source?.url) return stored;
  const choices = [stored, policy.topicDefaults?.[question.topic], policy.fallback];
  for (const choice of choices) {
    const value = policy.items.find(item => item.id === choice?.valueId);
    if (value && typeof choice.why === 'string' && choice.why.trim()) {
      return { valueId: value.id, name: value.name, why: choice.why, source: policy.source };
    }
  }
  throw new Error('Every answer needs a CNH value connection.');
}

export function renderValueConnection(connection) {
  if (!connection) return '';
  return `<aside class="value-connection" aria-label="CNH value connection"><span class="value-label">CNH VALUE CONNECTION · CLOSEST FIT</span><strong class="value-name">${escapeValueText(connection.name)}</strong><p>${escapeValueText(connection.why)}</p><a class="value-source" href="${escapeValueText(connection.source.url)}" target="_blank" rel="noopener noreferrer">CNH’s five values</a></aside>`;
}
