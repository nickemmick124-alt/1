const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const horizons = { week: '1 week', month: '1 month', year: '1 year' };
const boundStockSections = new WeakSet();
const finite = value => typeof value === 'number' && Number.isFinite(value);

function number(value, digits = 1) {
  return finite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value) : 'Unavailable';
}

function percentage(value, signed = false) {
  if (!finite(value)) return 'Unavailable';
  const rounded = Math.round(value * 100) / 100 || 0;
  return `${signed && rounded > 0 ? '+' : ''}${number(rounded, 2)}%`;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? escape(url.href) : '';
  } catch { return ''; }
}

function link(url, label) {
  const href = safeUrl(url);
  return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${escape(label)}<span class="sr-only"> (opens in a new tab)</span></a>` : escape(label);
}

function resolveSource(reference, sources = []) {
  if (reference && typeof reference === 'object') return reference;
  return sources.find(source => source.id === reference) || (safeUrl(reference) ? { url: reference } : null);
}

function sourceLink(reference, sources, label = 'Source') {
  const source = resolveSource(reference, sources);
  return source ? link(source.url, label || source.title || 'Source') : '';
}

function moneyMillion(value, currency) {
  if (!finite(value)) return 'Unavailable';
  return `${number(value, 1)}${currency ? ` <span class="competitor-currency">${escape(currency)}</span>` : ''}`;
}

function tableWrap(label, table, compact = false) {
  return `<div class="competitor-table-wrap ${compact ? 'compact-table-wrap' : ''}" tabindex="0" role="region" aria-label="${escape(label)}">${table}</div>`;
}

function industriesView(facts, compact) {
  if (!facts.industries?.length) return '';
  return `<section class="competitor-section"><div class="competitor-section-title"><h2>Where the businesses compete</h2><p>Choose peers for the relevant equipment or financing business.</p></div><div class="competitor-industry-grid">${facts.industries.map(industry => `<article class="competitor-industry-card"><h3>${escape(industry.title)}</h3>${!compact && industry.description ? `<p>${escape(industry.description)}</p>` : ''}<ul>${(industry.peers || []).map(peer => `<li><strong>${escape(peer.name)}</strong><span>${escape(peer.focus)}</span></li>`).join('')}</ul></article>`).join('')}</div></section>`;
}

function workforceView(facts, compact) {
  if (!facts.headcount?.length) return '';
  return `<section id="peer-workforce" class="competitor-section"><div class="competitor-section-title"><h2>Workforce size</h2><p>Reported headcounts use each company’s date and employee definition.</p></div>${tableWrap('Workforce comparison; scroll horizontally if needed', `<table class="competitor-table"><caption class="sr-only">Reported workforce size, dates, definitions, and sources</caption><thead><tr><th scope="col">Company</th><th scope="col" class="numeric">People</th><th scope="col">As of / definition</th></tr></thead><tbody>${facts.headcount.map(row => `<tr><th scope="row">${escape(row.company)}${row.ticker ? `<span class="competitor-subtext">${escape(row.ticker)}</span>` : ''}</th><td class="numeric competitor-value">${number(row.count, 0)}</td><td><strong class="competitor-period">${escape(row.asOf)}</strong><span class="competitor-subtext">${escape(row.definition)}</span><span class="competitor-source">${sourceLink(row.sourceId, facts.sources)}</span></td></tr>`).join('')}</tbody></table>`, compact)}</section>`;
}

function grossView(facts, compact) {
  if (!facts.grossMargins?.length) return '';
  return `<section id="peer-gross" class="competitor-section"><div class="competitor-section-title"><h2>Gross margin context</h2><p>Gross margin and operating margin measure different stages of profitability. Read each scope and reporting period.</p></div>${tableWrap('Gross margin comparison; scroll horizontally if needed', `<table class="competitor-table"><caption class="sr-only">Gross margins by company, scope, and reporting period</caption><thead><tr><th scope="col">Company / scope</th><th scope="col" class="numeric">Gross margin</th><th scope="col">Period / context</th></tr></thead><tbody>${facts.grossMargins.map(row => `<tr><th scope="row">${escape(row.company)}<span class="competitor-subtext">${escape(row.scope)}</span></th><td class="numeric competitor-value">${percentage(row.margin)}</td><td><strong class="competitor-period">${escape(row.period)}</strong><span class="competitor-subtext">${escape(row.note)}</span><span class="competitor-source">${sourceLink(row.sourceId, facts.sources)}</span></td></tr>`).join('')}</tbody></table>`, compact)}</section>`;
}

function operatingView(facts, compact) {
  if (!facts.operating?.length) return '';
  const industryNames = Object.fromEntries((facts.industries || []).map(industry => [industry.id, industry.title]));
  const groups = [...new Set(facts.operating.map(row => row.industry))];
  return `<section id="peer-operating" class="competitor-section"><div class="competitor-section-title"><h2>Operating performance by business</h2><p>Amounts are in millions of the stated currency. Companies may define segment profit differently; compare the measure, scope, and period together.</p></div>${groups.map(industry => `<div class="competitor-operating-group"><h3>${escape(industryNames[industry] || (industry === 'agriculture' ? 'Agriculture' : industry === 'construction' ? 'Construction' : industry || 'Other equipment'))}</h3>${tableWrap('Operating performance comparison; scroll horizontally if needed', `<table class="competitor-table operating-comparison"><caption class="sr-only">Operating margins, revenue, profit measures, and scope by company segment</caption><thead><tr><th scope="col">Company / segment</th><th scope="col" class="numeric">Margin</th><th scope="col" class="numeric">Revenue (m)</th><th scope="col" class="numeric">Profit (m)</th><th scope="col">Period / measure</th></tr></thead><tbody>${facts.operating.filter(row => row.industry === industry).map(row => `<tr><th scope="row">${escape(row.company)}<span class="competitor-subtext">${escape(row.segment)}</span></th><td class="numeric competitor-value">${percentage(row.margin)}</td><td class="numeric">${moneyMillion(row.revenueMillion, row.currency)}</td><td class="numeric">${moneyMillion(row.profitMillion, row.currency)}</td><td><strong class="competitor-period">${escape(row.period)}${row.periodEnd ? ` · ended ${escape(row.periodEnd)}` : ''}</strong><span class="competitor-subtext">${escape(row.metric)}</span>${row.scopeNote ? `<span class="competitor-subtext">${escape(row.scopeNote)}</span>` : ''}<span class="competitor-source">${sourceLink(row.sourceId, facts.sources)}</span></td></tr>`).join('')}</tbody></table>`, compact)}</div>`).join('')}</section>`;
}

function stockValue(stock, company, horizon) {
  const dates = stock.periods?.[horizon] || {};
  const start = company.closes?.[dates.start], end = company.closes?.[dates.end];
  const result = finite(start) && start > 0 && finite(end) && end >= 0 ? (end / start - 1) * 100 : null;
  return { start, end, result: finite(result) ? result : null, dates };
}

function stockSourceLinks(company, sources, includeYear = false) {
  const recent = sourceLink(company.recentPriceSource, sources, 'Recent closes');
  const baseline = includeYear ? sourceLink(company.yearBaselineSource, sources, 'Year baseline') : '';
  return [recent, baseline].filter(Boolean).join('<span aria-hidden="true"> · </span>');
}

function returnDetail(stock, sources, horizon) {
  const dates = stock.periods?.[horizon] || {};
  const rows = (stock.companies || []).map(company => ({ company, ...stockValue(stock, company, horizon) }));
  const sorted = [...rows].sort((a, b) => (b.result ?? -Infinity) - (a.result ?? -Infinity));
  const scale = Math.max(1, ...rows.filter(row => row.result !== null).map(row => Math.abs(row.result)));
  return `<p class="stock-period-description" role="status">${escape(horizons[horizon])}: closing price on <strong>${escape(dates.start || 'baseline unavailable')}</strong> to <strong>${escape(dates.end || 'end date unavailable')}</strong>.</p>
    <div class="stock-return-chart" aria-label="Companies ranked by percentage price return"><p class="stock-chart-key">Bars share a scale. Center line = 0%.</p>${sorted.map(row => {
      const width = row.result === null ? 0 : Math.min(50, Math.abs(row.result) / scale * 50);
      const left = row.result !== null && row.result < 0 ? 50 - width : 50;
      return `<div class="stock-return-row"><div class="stock-company"><strong>${escape(row.company.company)}</strong><span>${escape(row.company.ticker)}</span></div><svg class="stock-return-track" viewBox="0 0 100 25" preserveAspectRatio="none" aria-hidden="true"><rect class="stock-zero-line" x="49.85" y="0" width="0.3" height="25"/>${row.result !== null ? `<rect class="stock-return-fill ${row.result < 0 ? 'negative' : 'positive'}" x="${left}" y="4" width="${width}" height="17" rx="0.4"/>` : ''}</svg><strong class="stock-return-value">${percentage(row.result, true)}</strong></div>`;
    }).join('')}</div>
    ${tableWrap('Underlying closing prices and price returns; scroll horizontally if needed', `<table class="competitor-table stock-closes-table"><caption>Underlying closes · ${escape(stock.currency || 'Currency not specified')}</caption><thead><tr><th scope="col">Company</th><th scope="col" class="numeric">${escape(dates.start || 'Baseline')}</th><th scope="col" class="numeric">${escape(dates.end || 'End')}</th><th scope="col" class="numeric">Price return</th><th scope="col">Evidence</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${escape(row.company.company)}<span class="competitor-subtext">${escape(row.company.ticker)}</span></th><td class="numeric">${number(row.start, 2)}</td><td class="numeric">${number(row.end, 2)}</td><td class="numeric competitor-value">${percentage(row.result, true)}</td><td class="competitor-source">${stockSourceLinks(row.company, sources, horizon === 'year')}</td></tr>`).join('')}</tbody></table>`)}
    <p class="stock-formula">Price return = (ending close ÷ starting close − 1) × 100. Dividends are excluded. Missing or invalid closes are shown as unavailable.</p>`;
}

function compactReturns(stock, sources) {
  return `${tableWrap('One-week, one-month, and one-year percentage price returns', `<table class="competitor-table compact-return-table"><caption class="sr-only">Percentage closing-price returns excluding dividends</caption><thead><tr><th scope="col">Company</th>${Object.values(horizons).map(label => `<th scope="col" class="numeric">${label}</th>`).join('')}</tr></thead><tbody>${(stock.companies || []).map(company => `<tr><th scope="row">${escape(company.company)}<span class="competitor-subtext">${escape(company.ticker)}</span></th>${Object.keys(horizons).map(horizon => `<td class="numeric">${percentage(stockValue(stock, company, horizon).result, true)}</td>`).join('')}</tr>`).join('')}</tbody></table>`, true)}<dl class="compact-stock-dates">${Object.entries(horizons).map(([horizon, label]) => `<div><dt>${label}</dt><dd>${escape(stock.periods?.[horizon]?.start || 'Unavailable')} → ${escape(stock.periods?.[horizon]?.end || 'Unavailable')}</dd></div>`).join('')}</dl><details class="competitor-methodology"><summary>Underlying closes and return calculation</summary>${Object.entries(horizons).map(([horizon, label]) => `<div class="compact-close-period"><h3>${label}</h3>${tableWrap('Underlying closing prices', `<table class="competitor-table"><thead><tr><th scope="col">Company</th><th scope="col" class="numeric">Start</th><th scope="col" class="numeric">End</th></tr></thead><tbody>${(stock.companies || []).map(company => { const values = stockValue(stock, company, horizon); return `<tr><th scope="row">${escape(company.company)}</th><td class="numeric">${number(values.start, 2)}</td><td class="numeric">${number(values.end, 2)}</td></tr>`; }).join('')}</tbody></table>`, true)}</div>`).join('')}<p class="stock-formula">Closes are in ${escape(stock.currency || 'the reported currency')}. Price return = (ending close ÷ starting close − 1) × 100. Dividends are excluded.</p><ul class="compact-stock-sources">${(stock.companies || []).map(company => `<li><strong>${escape(company.company)}:</strong> ${stockSourceLinks(company, sources, true)}</li>`).join('')}</ul></details>`;
}

function stockView(facts, compact) {
  const stock = facts.stock;
  if (!stock) return '';
  const safeData = JSON.stringify({ stock, sources: facts.sources || [] }).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `<section id="peer-stock" class="competitor-section competitor-stock-section" data-stock-horizon="month"><div class="competitor-section-title"><h2>Stock price returns</h2><p>${escape(stock.basis || 'Closing-price return, excluding dividends')}. Compare percentage movement, not the dollar share price.</p><p class="competitor-stock-asof">Closing-price snapshot · ${escape(stock.asOf)}${stock.note ? ` · ${escape(stock.note)}` : ''}</p></div>${compact ? compactReturns(stock, facts.sources) : `<div class="stock-period-controls" role="group" aria-label="Stock return period">${Object.entries(horizons).map(([horizon, label]) => `<button type="button" data-stock-horizon="${horizon}" aria-pressed="${horizon === 'month'}">${label}</button>`).join('')}</div><div class="stock-period-results">${returnDetail(stock, facts.sources, 'month')}</div><script type="application/json" class="competitor-stock-data">${safeData}</script>`}</section>`;
}

function methodologyView(facts, compact) {
  const content = `${facts.methodology?.length ? `<ul>${facts.methodology.map(note => `<li>${escape(note)}</li>`).join('')}</ul>` : ''}${facts.refresh ? `<p class="competitor-refresh"><strong>${escape(facts.refresh.cadence || 'Refresh')}:</strong> ${escape(facts.refresh.note)}</p>` : ''}`;
  if (!content) return '';
  return compact ? `<details class="competitor-methodology"><summary>Comparison methodology and refresh</summary>${content}</details>` : `<section class="competitor-section competitor-methodology-card"><h2>Comparison methodology</h2>${content}</section>`;
}

function sourcesView(facts) {
  if (!facts.sources?.length) return '';
  return `<section class="competitor-section competitor-all-sources"><h2>Source documents</h2><ul>${facts.sources.map(source => `<li>${link(source.url, source.title)}${source.published ? `<span>Published ${escape(source.published)}</span>` : ''}</li>`).join('')}</ul></section>`;
}


function compactComparison(facts) {
  const table = (caption, heading, rows) => tableWrap(caption, `<table class="competitor-table compact-summary-table"><caption class="sr-only">${escape(caption)}</caption><thead><tr><th scope="col">Company / scope / period</th><th scope="col" class="numeric">${escape(heading)}</th></tr></thead><tbody>${rows}</tbody></table>`, true);
  const notes = (title, rows, noteKey) => `<details class="competitor-methodology"><summary>${escape(title)}</summary><ul>${rows.map(row=>`<li><strong>${escape(row.company)}:</strong> ${escape(row[noteKey])} ${sourceLink(row.sourceId,facts.sources)}</li>`).join('')}</ul></details>`;
  return `<article class="competitor-sheet compact-competitors" aria-label="Competitor fact sheet"><div class="competitor-sheet-intro"><p class="competitor-dateline">${escape(facts.period)} · Verified ${escape(facts.verifiedOn)}</p><p>Global company figures. Read the scope and period with each margin.</p></div>
    <section class="competitor-section"><h2>Who competes?</h2>${(facts.industries||[]).map(industry=>`<p class="compact-peer-line"><strong>${escape(industry.title)}</strong><span>${(industry.peers||[]).map(peer=>escape(peer.name)).join(' · ')}</span></p>`).join('')}</section>
    <section class="competitor-section"><h2>Workforce size</h2>${table('Global employee counts','People',(facts.headcount||[]).map(row=>`<tr><th scope="row">${escape(row.company)}<span class="competitor-subtext">${escape(row.asOf)}</span></th><td class="numeric competitor-value">${/approximately/i.test(row.definition)?'≈':''}${number(row.count,0)}</td></tr>`).join(''))}${notes('Employee definitions and sources',facts.headcount||[],'definition')}</section>
    <section class="competitor-section"><h2>Gross margins</h2>${table('Gross margins with distinct business scopes','Margin',(facts.grossMargins||[]).map(row=>`<tr><th scope="row">${escape(row.company)}<span class="competitor-subtext">${escape(row.scope)}<br>${escape(row.period)}</span></th><td class="numeric competitor-value">${percentage(row.margin)}</td></tr>`).join(''))}${notes('Gross-margin calculations and sources',facts.grossMargins||[],'note')}</section>
    <section class="competitor-section"><h2>Operating margins</h2><p class="compact-peer-note">Different profit definitions; not a normalized ranking.</p>${table('Operating margins by business and period','Margin',(facts.operating||[]).map(row=>`<tr><th scope="row">${escape(row.company)} · ${escape(row.segment)}<span class="competitor-subtext">${escape(row.period)} · ended ${escape(row.periodEnd)}<br>${escape(row.metric)}</span></th><td class="numeric competitor-value">${percentage(row.margin)}</td></tr>`).join(''))}${notes('Operating definitions and sources',facts.operating||[],'scopeNote')}</section>
    ${stockView({...facts,stock:{...facts.stock,note:''}},true)}${methodologyView(facts,true)}
    <details class="competitor-methodology"><summary>All source documents</summary>${sourcesView(facts)}</details>
  </article>`;
}

const comparisonCompanies = { cnh: 'CNH', deere: 'John Deere' };

function comparisonValue(value, unit) {
  if (!finite(value)) return 'Unavailable';
  if (unit === 'percent') return percentage(value);
  if (unit === 'perShare') return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
  return `$${number(value, 1)}m`;
}

function yearOverYear(current, prior, unit) {
  if (!finite(current) || !finite(prior)) return 'Unavailable';
  if (unit === 'percent') {
    const change = Math.round((current - prior) * 100) / 100 || 0;
    return `${change > 0 ? '+' : ''}${number(change, 2)} pp`;
  }
  if (prior <= 0) return 'Not meaningful';
  return percentage((current / prior - 1) * 100, true);
}

function comparisonSources(references, sources) {
  return [...new Set((references || []).filter(Boolean))].map(reference => {
    const source = resolveSource(reference, sources);
    return source ? sourceLink(reference, sources, source.title || 'Source') : '';
  }).filter(Boolean).join('<span aria-hidden="true"> · </span>');
}

function comparisonExplanation(meaning, why, { compact = false, driver = false, sourceIds = [], sources = [] } = {}) {
  const evidence = comparisonSources(sourceIds, sources);
  const content = `<div class="comparison-explanation">${meaning ? `<div><strong>What it means</strong><p>${escape(meaning)}</p></div>` : ''}${why ? `<div><strong>${driver ? 'Why it changed · company-reported' : 'Why it matters'}</strong><p>${escape(why)}</p></div>` : ''}${evidence ? `<p class="comparison-evidence">${evidence}</p>` : ''}</div>`;
  return compact ? `<details class="comparison-detail"><summary>${driver ? 'What it means and why it changed' : 'What it means and why it matters'}</summary>${content}</details>` : content;
}

function comparisonPeriods(facts) {
  const comparison = facts.comparison;
  return `<div class="comparison-periods">${Object.entries(comparisonCompanies).map(([key, company]) => {
    const period = comparison.periods?.[key] || {};
    return `<div><strong>${company}</strong><span>${escape(period.label)}${period.periodEnd ? ` · ended ${escape(period.periodEnd)}` : ''}</span><span class="comparison-prior-period">Prior year: ${escape(period.priorLabel)}</span><span class="competitor-source">${sourceLink(period.sourceId, facts.sources)}</span></div>`;
  }).join('')}</div>${comparison.periodNote ? `<p class="comparison-scope-note">${escape(comparison.periodNote)}</p>` : ''}`;
}

function comparisonHighlights(facts, compact) {
  return `<section id="comparison-takeaways" class="competitor-section"><div class="competitor-section-title"><h2>The comparison in plain English</h2><p>Start with the takeaway, then see the numbers behind it.</p></div><div class="comparison-highlights">${(facts.comparison.highlights || []).map((highlight, index) => `<article class="comparison-highlight"><p class="comparison-card-number">0${index + 1} / TAKEAWAY</p><h3>${escape(highlight.title)}</h3>${highlight.figures ? `<p class="comparison-highlight-figures">${escape(highlight.figures)}</p>` : ''}${compact && highlight.meaning ? `<p class="comparison-highlight-meaning">${escape(highlight.meaning)}</p>` : ''}${comparisonExplanation(compact ? null : highlight.meaning, highlight.why, { compact, sourceIds: highlight.sourceIds, sources: facts.sources })}</article>`).join('')}</div></section>`;
}

function comparisonNumberSet(current, prior, unit, period = {}) {
  return `<dl class="comparison-number-set"><div><dt>Current<span>${escape(period.label)}</span></dt><dd>${comparisonValue(current, unit)}</dd></div><div><dt>Prior year<span>${escape(period.priorLabel)}</span></dt><dd>${comparisonValue(prior, unit)}</dd></div><div><dt>YoY change<span>${unit === 'percent' ? 'Percentage points' : 'Percent'}</span></dt><dd>${yearOverYear(current, prior, unit)}</dd></div></dl>`;
}

function profitBridge(row, facts) {
  const bridge = row.profitBridge;
  if (!bridge?.items?.length) return '';
  const effect = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}$${number(Math.abs(value), 0)}m`;
  const changes = bridge.items.map(item => `<tr><th scope="row">${escape(item.label)}</th><td class="numeric">${effect(item.amountMillion)}</td></tr>`).join('');
  const note = bridge.roundingToleranceMillion ? 'Published bridge figures may not add exactly because of rounding.' : 'Effects reconcile the change in this segment’s operating profit.';
  return `<details class="comparison-detail profit-bridge"><summary>Published profit bridge · USD millions</summary>${tableWrap('Published operating-profit bridge', `<table class="competitor-table"><thead><tr><th scope="col">Item</th><th scope="col" class="numeric">Profit effect</th></tr></thead><tbody><tr><th scope="row">Prior-year profit</th><td class="numeric">${comparisonValue(row.priorProfitMillion, 'million')}</td></tr>${changes}<tr><th scope="row">Current profit</th><td class="numeric">${comparisonValue(row.profitMillion, 'million')}</td></tr></tbody></table>`)}<p class="comparison-scope-note">${note} Reported product-cost effects combine multiple cost drivers.</p><p class="comparison-evidence">${sourceLink(bridge.sourceId, facts.sources, 'Published earnings bridge')}</p></details>`;
}

function comparisonMetrics(facts, compact) {
  return `<section id="comparison-numbers" class="competitor-section"><div class="competitor-section-title"><h2>The detailed numbers</h2><p>USD · m = million. YoY compares each company with the same quarter a year earlier. Margin changes use percentage points (pp).</p></div><div class="comparison-metric-grid">${(facts.comparison.metrics || []).map(metric => `<article class="comparison-metric-card"><h3>${escape(metric.label)}</h3><div class="comparison-company-grid">${Object.entries(comparisonCompanies).map(([key, company]) => {
    const row = metric[key] || {};
    return `<div class="comparison-company-numbers"><h4>${company}<span>${sourceLink(row.sourceId, facts.sources)}</span></h4><p class="comparison-metric-scope">${escape(row.scope)}</p>${comparisonNumberSet(row.current, row.prior, metric.unit, facts.comparison.periods?.[key])}</div>`;
  }).join('')}</div>${metric.scopeNote ? `<p class="comparison-scope-note">${escape(metric.scopeNote)}</p>` : ''}${comparisonExplanation(metric.meaning, metric.why, { compact })}</article>`).join('')}</div></section>`;
}

function comparisonDrivers(facts, compact) {
  return `<section id="comparison-drivers" class="competitor-section"><div class="competitor-section-title"><h2>What drove the results?</h2><p>Read the business segments separately. Change reasons below are company-reported; the plain-English meaning is interpretation.</p></div>${(facts.comparison.drivers || []).map(group => `<div class="comparison-driver-group"><h3>${escape(group.title)}</h3><div class="comparison-driver-grid">${(group.rows || []).map(row => {
    const key = /deere/i.test(row.company) ? 'deere' : 'cnh';
    const period = facts.comparison.periods?.[key];
    return `<article class="comparison-driver-card"><p class="comparison-driver-company">${escape(row.company)}</p><h4>${escape(row.segment)}</h4><p class="comparison-metric-scope">${escape(row.metric)}</p><div class="comparison-driver-metric"><h5>Sales</h5>${comparisonNumberSet(row.revenueMillion, row.priorRevenueMillion, 'million', period)}</div><div class="comparison-driver-metric"><h5>Segment profit</h5>${comparisonNumberSet(row.profitMillion, row.priorProfitMillion, 'million', period)}</div><div class="comparison-driver-metric"><h5>Profit margin</h5>${comparisonNumberSet(row.margin, row.priorMargin, 'percent', period)}</div>${comparisonExplanation(row.meaning, row.why, { compact, driver: true, sourceIds: [row.sourceId, row.profitBridge?.sourceId, ...(row.driverSourceIds || [])], sources: facts.sources })}${profitBridge(row, facts)}</article>`;
  }).join('')}</div>${group.takeaway ? `<p class="comparison-driver-takeaway"><strong>What this tells us:</strong> ${escape(group.takeaway)}</p>` : ''}${group.scopeNote ? `<p class="comparison-scope-note">${escape(group.scopeNote)}</p>` : ''}</div>`).join('')}</section>`;
}

function comparisonWorkforce(facts, compact) {
  if (!facts.headcount?.length) return '';
  return `<section id="peer-workforce" class="competitor-section"><div class="competitor-section-title"><h2>Workforce size</h2><p>Company-wide scale helps explain the size of the businesses. Headcount alone does not measure productivity.</p></div><div class="comparison-workforce-grid">${facts.headcount.map(row => `<article class="comparison-workforce-card"><h3>${escape(row.company)}</h3><p class="comparison-workforce-value">${/approximately/i.test(row.definition) ? '≈' : ''}${number(row.count, 0)}<span>people · ${escape(row.asOf)}</span></p>${compact ? `<details class="comparison-detail"><summary>Employee definition and source</summary><p>${escape(row.definition)}</p><p class="comparison-evidence">${sourceLink(row.sourceId, facts.sources)}</p></details>` : `<p>${escape(row.definition)}</p><p class="comparison-evidence">${sourceLink(row.sourceId, facts.sources)}</p>`}</article>`).join('')}</div></section>`;
}

function latestComparison(facts, compact) {
  const stockMeaning = facts.comparison.stockMeaning || {};
  return `<article class="competitor-sheet latest-comparison ${compact ? 'compact-competitors' : ''}" aria-label="CNH vs John Deere financial comparison"><div class="competitor-sheet-intro"><p class="competitor-dateline">${escape(facts.period)}${facts.verifiedOn ? ` · Verified ${escape(facts.verifiedOn)}` : ''}</p><p>CNH vs John Deere: the results, what they mean, and why they matter.</p>${comparisonPeriods(facts)}</div>${compact ? '' : `<nav class="competitor-jump-links" aria-label="CNH vs John Deere comparison sections"><a href="#comparison-takeaways">Simple takeaways</a><a href="#comparison-numbers">Detailed numbers</a><a href="#comparison-drivers">Business drivers</a><a href="#peer-stock">Stock returns</a><a href="#peer-workforce">Workforce</a></nav>`}${comparisonHighlights(facts, compact)}${comparisonMetrics(facts, compact)}${comparisonDrivers(facts, compact)}${stockView(facts, compact)}${stockMeaning.meaning || stockMeaning.why ? comparisonExplanation(stockMeaning.meaning, stockMeaning.why, { compact }) : ''}${comparisonWorkforce(facts, compact)}${methodologyView(facts, compact)}${compact ? `<details class="competitor-methodology"><summary>All source documents</summary>${sourcesView(facts)}</details>` : sourcesView(facts)}</article>`;
}

export function renderCompetitorSheet(facts, { compact = false } = {}) {
  if (!facts) return '<p class="field-help">The competitor fact sheet is unavailable.</p>';
  if (facts.comparison) return latestComparison(facts, compact);
  if (compact) return compactComparison(facts);
  return `<article class="competitor-sheet ${compact ? 'compact-competitors' : ''}" aria-label="${escape(facts.title || 'CNH competitor fact sheet')}"><div class="competitor-sheet-intro"><p class="competitor-dateline">${escape(facts.period)}${facts.verifiedOn ? ` · Verified ${escape(facts.verifiedOn)}` : ''}</p>${!compact && facts.intro ? `<p>${escape(facts.intro)}</p>` : ''}${compact ? '<p>Check each company’s reporting period, business scope, and metric before comparing.</p>' : ''}</div><nav class="competitor-jump-links" aria-label="Competitor dashboard sections"><a href="#peer-stock">Stock returns</a><a href="#peer-workforce">Workforce</a><a href="#peer-gross">Gross margins</a><a href="#peer-operating">Operating margins</a></nav>${industriesView(facts, compact)}${workforceView(facts, compact)}${grossView(facts, compact)}${operatingView(facts, compact)}${stockView(facts, compact)}${methodologyView(facts, compact)}${sourcesView(facts)}</article>`;
}

export function bindCompetitorSheet(root = document) {
  const sections = [...(root.querySelectorAll?.('.competitor-stock-section') || [])];
  if (root.matches?.('.competitor-stock-section')) sections.unshift(root);
  for (const section of sections) {
    if (boundStockSections.has(section)) continue;
    const dataNode = section.querySelector('.competitor-stock-data');
    if (!dataNode) continue;
    let data;
    try { data = JSON.parse(dataNode.textContent); } catch { continue; }
    if (!data?.stock) continue;
    boundStockSections.add(section);
    section.addEventListener('click', event => {
      const button = event.target.closest?.('button[data-stock-horizon]');
      if (!button || button.closest('.competitor-stock-section') !== section) return;
      const horizon = button.dataset.stockHorizon;
      if (!Object.hasOwn(horizons, horizon)) return;
      const result = section.querySelector('.stock-period-results');
      if (!result) return;
      section.dataset.stockHorizon = horizon;
      for (const control of section.querySelectorAll('.stock-period-controls button')) control.setAttribute('aria-pressed', String(control === button));
      result.innerHTML = returnDetail(data.stock, data.sources || [], horizon);
    });
  }
}
