import { renderCompetitorSheet } from './competitors.js';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function safeLink(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? escape(url.href) : '';
  } catch { return ''; }
}

function sourceLink(url, title, focusKey) {
  const href = safeLink(url);
  return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer" data-fact-focus="${escape(focusKey)}">${escape(title)}<span class="sr-only"> (opens in a new tab)</span></a>` : escape(title);
}

function amount(value, unit) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value !== 'number') return escape(value);
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Math.abs(value));
  const formatted = unit === 'USD million' ? `$${number}m` : unit === '%' ? `${number}%` : number;
  return value < 0 ? `−${formatted}` : formatted;
}

function renderCoverage(coverage) {
  if (!coverage?.title && !coverage?.text) return '';
  return `<section class="facts-coverage"><h3>${escape(coverage.title || 'Public financial reporting coverage')}</h3><p>${escape(coverage.text)}</p></section>`;
}

function renderPrior(metric) {
  if (metric.prior === null || metric.prior === undefined || metric.prior === '') return '<strong aria-label="No prior comparison">—</strong>';
  return `<small>${escape(metric.comparison || 'Prior period')}</small><strong>${amount(metric.prior, metric.unit)}</strong>`;
}

function renderCashConversion(cash) {
  if (!cash) return '';
  return `<section class="cash-definition"><h3>Cash conversion: profit into cash</h3><p>${escape(cash.definition)}</p>${cash.meaning ? `<p>${escape(cash.meaning)}</p>` : ''}${cash.example ? `<p class="cash-example"><strong>Example:</strong> ${escape(cash.example)}</p>` : ''}${cash.note ? `<p>${escape(cash.note)}</p>` : ''}<div class="facts-source">${sourceLink(cash.sourceUrl, 'CNH public definition and reporting context', 'cash-source')}</div></section>`;
}

function compactFactSheet(facts, stock, stockPrice) {
  return `<article class="financial-facts compact-facts" aria-label="Financial fact sheet">
    <p class="compact-units">${escape(facts.period)} · USD millions unless shown as %.<br>Reporting dates vary. Read each row’s scope and period.</p>
    <section class="compact-stock" aria-label="Share price snapshot">
      <div><span>${escape(stock.exchange || 'NYSE')}: ${escape(stock.ticker || 'CNH')}</span><strong>${stockPrice} <small>${escape(stock.currency || 'USD')}</small></strong></div>
      <p>Close ${escape(stock.asOf || 'date unavailable')}${stock.asOfTime ? ` · ${escape(stock.asOfTime)}` : ''} · ${sourceLink(stock.sourceUrl, 'Source', 'stock-source')}<span class="sr-only">. Historical snapshot, not a live quote.</span></p>
    </section>
    <table class="compact-metrics"><caption class="sr-only">CNH financial results by business scope and reporting period</caption><thead><tr><th scope="col">Measure / scope</th><th scope="col">Current</th><th scope="col">Prior</th></tr></thead><tbody>${(facts.metrics || []).map(metric => `<tr><th scope="row">${escape(metric.label)}<span>${escape(metric.scope)}</span>${metric.note ? `<span>${escape(metric.note)}</span>` : ''}</th><td><small>${escape(metric.period || facts.period)}</small><strong>${amount(metric.current, metric.unit)}</strong></td><td>${renderPrior(metric)}</td></tr>`).join('')}</tbody></table>
    ${renderCoverage(facts.coverage)}
    ${renderCashConversion(facts.cashConversion)}
    <section class="facts-sources"><h3>Sources for this sheet</h3><ul>${(facts.sources || []).map((source, index) => `<li>${sourceLink(source.url, source.title, `source-${index}`)}${source.published ? `<span>Published ${escape(source.published)}</span>` : ''}</li>`).join('')}</ul></section>
  </article>`;
}

export function renderFactSheet(facts, { compact = false } = {}) {
  if (!facts) return '<p class="field-help">The financial fact sheet is not available for this round.</p>';
  if (facts.kind === 'competitors') return renderCompetitorSheet(facts, { compact });
  const stock = facts.stock || {};
  const stockPrice = typeof stock.close === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: stock.currency || 'USD' }).format(stock.close) : escape(stock.close ?? 'Not provided');
  if (compact) return compactFactSheet(facts, stock, stockPrice);
  return `<article class="financial-facts ${compact ? 'compact-facts' : ''}" aria-label="Financial fact sheet">
    <div class="facts-kicker">${escape(facts.period)} · Public results</div>
    <h2>${escape(facts.title || 'CNH financial fact sheet')}</h2>
    <p class="facts-intro">${escape(facts.intro || 'Use the figures and definitions below as you work through each decision.')}</p>
    <p class="facts-verification">${facts.verifiedOn ? `Verified ${escape(facts.verifiedOn)} · ` : ''}USD · m = million. Period and business scope matter.</p>
    <section class="stock-snapshot" aria-label="Share price snapshot">
      <div><span class="facts-label">${escape(stock.exchange || 'NYSE')}: ${escape(stock.ticker || 'CNH')}</span><strong>${stockPrice}</strong></div>
      <p>${escape(stock.currency || 'USD')} closing price${stock.asOf ? ` · ${escape(stock.asOf)}` : ''}${stock.asOfTime ? ` · ${escape(stock.asOfTime)}` : ''}<br><span>Historical snapshot, not a live quote.</span></p>
      <div class="facts-source">${sourceLink(stock.sourceUrl, 'Share price source', 'stock-source')}</div>
    </section>
    <div class="facts-metrics">${(facts.metrics || []).map((metric, index) => `<section class="facts-metric" aria-labelledby="fact-metric-${index}">
      <h3 id="fact-metric-${index}">${escape(metric.label)}</h3>
      <p class="metric-scope">${escape(metric.scope)}</p>
      <dl><div><dt>${escape(metric.period || facts.period)}</dt><dd>${amount(metric.current, metric.unit)}</dd></div>${metric.prior !== undefined && metric.prior !== null ? `<div><dt>${escape(metric.comparison || 'Prior period')}</dt><dd>${amount(metric.prior, metric.unit)}</dd></div>` : ''}</dl>
      ${metric.note ? `<p class="metric-note">${escape(metric.note)}</p>` : ''}
    </section>`).join('')}</div>
    ${renderCoverage(facts.coverage)}
    ${renderCashConversion(facts.cashConversion)}
    <section class="facts-sources"><h3>Sources for this sheet</h3><ul>${(facts.sources || []).map((source, index) => `<li>${sourceLink(source.url, source.title, `source-${index}`)}${source.published ? `<span>Published ${escape(source.published)}</span>` : ''}</li>`).join('')}</ul></section>
  </article>`;
}

export function renderFactPanel(facts, open = false, duringQuestion = false) {
  if (!facts) return '';
  return `<details class="fact-panel" id="live-fact-panel" ${open ? 'open' : ''}>
    <summary data-fact-focus="summary"><span><strong>${facts.kind === 'competitors' ? 'Competitor fact sheet' : 'Financial fact sheet'}</strong><small>${escape(facts.period)} · Available throughout your round</small></span></summary>
    <div class="fact-panel-content" id="fact-panel-content" tabindex="0" aria-label="Scrollable financial reference" data-fact-focus="content">
      ${duringQuestion ? '<div class="fact-panel-tools"><span class="fact-timer-note">Timer continues.</span><button type="button" class="secondary return-to-decision" data-action="return-decision">Back to decision</button></div>' : ''}
      ${renderFactSheet(facts, { compact: true })}
    </div>
  </details>`;
}
