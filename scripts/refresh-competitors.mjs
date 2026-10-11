import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Verify and update the dated CNH / John Deere facts before regenerating.
const file = new URL('../src/competitors.json', import.meta.url);
const round = JSON.parse(await readFile(file, 'utf8'));
const f = round.factSheet;
const source = id => {
  const item = f.sources.find(s => s.id === id);
  assert(item && /^https:\/\//.test(item.url), `Missing HTTPS source: ${id}`);
  return item;
};
assert.equal(f.kind, 'competitors');
assert(f.comparison, 'Detailed comparison is required');
assert(/^\d{4}-\d{2}-\d{2}$/.test(f.verifiedOn));
assert.equal(new Set(f.sources.map(s => s.id)).size, f.sources.length);
for (const s of f.sources) source(s.id);
for (const rows of [f.headcount, f.grossMargins, f.operating, f.stock.companies]) {
  assert(rows.every(row => ['CNH', 'Deere', 'John Deere'].includes(row.company)), 'This edition compares John Deere only');
}
assert.deepEqual(f.stock.companies.map(c=>c.ticker).sort(), ['CNH','DE']);
const byTicker = ticker => f.stock.companies.find(c => c.ticker === ticker);
const returnFor = (ticker, horizon) => {
  const company = byTicker(ticker), period = f.stock.periods[horizon];
  assert(period && period.start < period.end && period.end === f.stock.asOf);
  assert(period.end <= f.verifiedOn, 'Market snapshot must not postdate verification');
  const start = company.closes[period.start], end = company.closes[period.end];
  assert(Number.isFinite(start) && start > 0 && Number.isFinite(end) && end > 0, `Missing verified ${ticker} ${horizon} closes`);
  return (end / start - 1) * 100;
};
for (const ticker of ['CNH', 'DE']) for (const horizon of ['week', 'month', 'year']) returnFor(ticker, horizon);
for (const row of [...f.headcount, ...f.operating, ...f.grossMargins]) source(row.sourceId);
const n = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
const metric = id => {
  const item = f.comparison.metrics.find(row => row.id === id);
  assert(item, `Missing metric ${id}`);
  return item;
};
const driver = (company, segment) => {
  const row = f.comparison.drivers.flatMap(group => group.rows).find(row => row.company === company && row.segment === segment);
  assert(row, `Missing driver: ${company} ${segment}`);
  return row;
};
const bridgeAmount = (row, label) => {
  const item = row.profitBridge?.items.find(item => item.label === label);
  assert(item && Number.isFinite(item.amountMillion), `Missing profit bridge: ${row.segment} ${label}`);
  return item.amountMillion;
};
const delta = (row, key) => row[key] - row[`prior${key[0].toUpperCase()}${key.slice(1)}`];
const pressure = (row, label) => `$${n(Math.abs(bridgeAmount(row, label)))}m`;
const cnhAg = driver('CNH', 'Agriculture');
const cnhConstruction = driver('CNH', 'Construction');
const deerePpa = driver('John Deere', 'Production & Precision Agriculture');
const deereSat = driver('John Deere', 'Small Agriculture & Turf');
const deereConstruction = driver('John Deere', 'Construction & Forestry');
for (const row of [cnhAg, cnhConstruction, deerePpa, deereSat, deereConstruction]) {
  const bridge = row.profitBridge;
  assert(bridge?.items.length, `${row.segment} needs a published profit bridge`);
  source(bridge.sourceId);
  for (const id of row.sourceIds || []) source(id);
  assert(bridge.items.every(item => Number.isFinite(item.amountMillion)));
  assert(Math.abs(bridge.items.reduce((sum, item) => sum + item.amountMillion, 0) - delta(row, 'profitMillion')) <= (bridge.roundingToleranceMillion || 0), `${row.segment} bridge does not reconcile`);
}
const cnhPeriod = f.comparison.periods.cnh.label;
const deerePeriod = f.comparison.periods.deere.label;
const sales = metric('equipment-sales').cnh;
const salesGain = sales.current - sales.prior;
const constructionSalesGain = delta(cnhConstruction, 'revenueMillion');
const agSalesGain = delta(cnhAg, 'revenueMillion');
const constructionContribution = Math.round(constructionSalesGain / salesGain * 100);
const cnhGross = f.grossMargins.find(row => row.company === 'CNH');
const deereGross = f.grossMargins.find(row => row.company === 'Deere');
const financing = metric('financing-profit');
const deereProfitGain = delta(deereConstruction, 'profitMillion') + delta(deereSat, 'profitMillion') + delta(deerePpa, 'profitMillion');
assert(cnhGross && deereGross);
assert(salesGain > 0 && constructionSalesGain > agSalesGain && agSalesGain > 0, 'Revisit the CNH sales-contribution question when segment trends change');
assert(delta(cnhAg, 'profitMillion') < 0 && bridgeAmount(cnhAg, 'Volume & Mix') === Math.min(...cnhAg.profitBridge.items.map(item => item.amountMillion)), 'Revisit the Agriculture-pressure question when its bridge changes');
assert(constructionSalesGain > 0 && delta(cnhConstruction, 'profitMillion') < 0 && Math.abs(bridgeAmount(cnhConstruction, 'Product costs')) > bridgeAmount(cnhConstruction, 'Volume & Mix'), 'Revisit Construction wording when its sales/profit bridge changes');
assert(delta(deereConstruction, 'profitMillion') > 0 && bridgeAmount(deereConstruction, 'Price realization') === Math.max(...deereConstruction.profitBridge.items.map(item => item.amountMillion)), 'Revisit Deere Construction wording when its largest driver changes');
assert(delta(deereSat, 'profitMillion') > 0 && bridgeAmount(deereSat, 'Volume / Mix') === Math.max(...deereSat.profitBridge.items.map(item => item.amountMillion)), 'Revisit Deere Small Ag wording when its largest driver changes');
assert(deereProfitGain > 0 && delta(deerePpa, 'profitMillion') < 0, 'Revisit Deere business-mix wording when segment trends change');
assert(financing.cnh.current < financing.cnh.prior && financing.deere.current > financing.deere.prior, 'Revisit financing wording when trends change');

function q(index, topic, stage, prompt, options, correct, businessReasoning, discussion, ids, valueId = 'make-it-simple') {
  assert.equal(options.length, 4);
  assert.equal(new Set(options).size, 4);
  assert(Number.isInteger(correct) && correct >= 0 && correct < 4);
  for (const key of ['changed', 'drivers', 'decision']) assert(typeof businessReasoning[key] === 'string' && businessReasoning[key].trim());
  const explanation = `${businessReasoning.changed} Reported drivers: ${businessReasoning.drivers} Leadership implication: ${businessReasoning.decision}`;
  return {
    id: `${round.setId}-${String(index).padStart(2, '0')}`, topic, stage, prompt, options, correct,
    explanation, businessReasoning, discussion,
    basis: `CNH ${cnhPeriod} · John Deere ${deerePeriod} · compare each with its own prior-year quarter`,
    sourceIds: ids, sources: ids.map(source),
    valueConnection: { valueId, why: 'Connect the reported business drivers to a clear leadership decision.' }
  };
}
round.period = f.period;
round.questionDurationMs = 25000;
round.sources = structuredClone(f.sources);
round.sourceIds = f.sources.map(s => s.id);
round.questions = [
  q(1, 'cnh-sales-contribution', 'Locate the sales increase',
    `CNH equipment sales rose $${n(salesGain)}m in ${cnhPeriod}. Which business contributed most, and what supported its growth?`,
    ['Construction: more North America volume, including delayed Q1 shipments.', 'Agriculture: stronger South America volume.', 'Construction: higher prices with lower North America volume.', 'Agriculture: better North America product mix.'], 0,
    {
      changed: `CNH equipment sales rose from $${n(sales.prior)}m to $${n(sales.current)}m. Construction contributed $${n(constructionSalesGain)}m (roughly ${constructionContribution}% of the increase), versus $${n(agSalesGain)}m from Agriculture.`,
      drivers: 'CNH reported higher North America Construction volume, including shipments delayed from Q1 into Q2. Agriculture remained pressured by lower South America volumes and unfavorable North America/EMEA mix.',
      decision: 'Check whether the shipment recovery is supported by retail demand and an executable backlog before extending the staffing ramp.'
    },
    'How much of the construction increase is repeatable demand rather than delayed shipments?', ['cnh-q2']),
  q(2, 'peer-gross-margin', 'Explain a sales dollar',
    `CNH equipment gross margin is ${n(cnhGross.margin)}%. Roughly how much remains from $100 of equipment sales after product costs?`,
    [`$${n(100 - cnhGross.margin)}`, `$${n(cnhGross.margin)}`, `$${n(cnhGross.margin * 2)}`, `$${n(metric('equipment-op-margin').cnh.current)}`], 1,
    {
      changed: `About $${n(cnhGross.margin)} remains from each $100 of CNH equipment sales after product costs; about $${n(100 - cnhGross.margin)} is consumed by those costs. Deere's separate equipment measure retains about $${n(deereGross.margin)}.`,
      drivers: `Calculation from published figures: CNH equipment product costs rose $${n(metric('equipment-cogs').cnh.current - metric('equipment-cogs').cnh.prior)}m while equipment sales rose $${n(salesGain)}m, reducing gross profit by $${n(metric('gross-profit').cnh.prior - metric('gross-profit').cnh.current)}m. The $${n(cnhGross.margin)} remainder must still cover overhead, development and other expenses.`,
      decision: 'Test how quality, scrap, rework and productivity improvements affect the dollars retained per good unit; gross profit is not final profit.'
    },
    'Which controllable product-cost losses can we reduce without hurting quality or delivery?', ['cnh-deck', 'cnh-q2', 'deere-q3']),
  q(3, 'cnh-agriculture-drivers', 'Find Agriculture’s pressure',
    `CNH Agriculture adjusted EBIT fell from $${n(cnhAg.priorProfitMillion)}m to $${n(cnhAg.profitMillion)}m in ${cnhPeriod}. Which bridge item was the largest negative?`,
    ['Lower volume and unfavorable product mix.', 'Higher product costs, including tariff pressure.', 'Higher selling and administrative expense.', 'Higher R&D spending.'], 0,
    {
      changed: `CNH Agriculture adjusted EBIT fell $${n(-delta(cnhAg, 'profitMillion'))}m, from $${n(cnhAg.priorProfitMillion)}m to $${n(cnhAg.profitMillion)}m, while sales rose only $${n(agSalesGain)}m. Its margin fell from ${n(cnhAg.priorMargin)}% to ${n(cnhAg.margin)}%.`,
      drivers: `Volume & Mix was the largest pressure at −${pressure(cnhAg, 'Volume & Mix')}, reflecting lower South America volume and unfavorable North America/EMEA mix. Net pricing added ${pressure(cnhAg, 'Net pricing')}, while product costs, SG&A and R&D reduced profit further.`,
      decision: 'Plan capability by product and region; a staffing proposal should target controllable costs and qualified output while recognizing the demand and mix pressure.'
    },
    'Which product or regional mix change matters most to our workforce plan?', ['cnh-q2', 'cnh-deck'], 'win-as-one'),
  q(4, 'cnh-construction-drivers', 'Explain Construction’s decline',
    `CNH Construction sales rose to $${n(cnhConstruction.revenueMillion)}m, but adjusted EBIT fell to $${n(cnhConstruction.profitMillion)}m in ${cnhPeriod}. Which pressure outweighed the volume gain?`,
    ['Higher selling and administrative expense.', 'Lower volume and unfavorable mix.', 'Higher product costs, including tariffs.', 'Lower pricing as the main negative bridge item.'], 2,
    {
      changed: `CNH Construction sales rose from $${n(cnhConstruction.priorRevenueMillion)}m to $${n(cnhConstruction.revenueMillion)}m, but adjusted EBIT fell from $${n(cnhConstruction.priorProfitMillion)}m to $${n(cnhConstruction.profitMillion)}m. Its margin fell from ${n(cnhConstruction.priorMargin)}% to ${n(cnhConstruction.margin)}%.`,
      drivers: `Product costs reduced EBIT by ${pressure(cnhConstruction, 'Product costs')}, outweighing +${pressure(cnhConstruction, 'Volume & Mix')} of volume/mix; CNH cited tariffs and higher R&D. The full product-cost bucket is not a disclosed tariff-only amount, and the published bridge is rounded.`,
      decision: 'Validate which conversion-cost and quality improvements can offset these pressures; higher shipments alone do not justify a blanket staffing increase or reduction.'
    },
    'Which cost pressure can our operating and workforce actions change, and which needs a different response?', ['cnh-q2', 'cnh-deck'], 'we-go-beyond'),
  q(5, 'deere-construction-drivers', 'Locate Deere’s profit gain',
    `Deere Construction & Forestry operating profit rose from $${n(deereConstruction.priorProfitMillion)}m to $${n(deereConstruction.profitMillion)}m in ${deerePeriod}. Which reported driver contributed most?`,
    ['Lower production costs.', 'Favorable volume/mix.', 'Lower SG&A and R&D expense.', 'Favorable pricing.'], 3,
    {
      changed: `Deere Construction & Forestry operating profit increased $${n(delta(deereConstruction, 'profitMillion'))}m, from $${n(deereConstruction.priorProfitMillion)}m to $${n(deereConstruction.profitMillion)}m. Its margin rose from ${n(deereConstruction.priorMargin)}% to ${n(deereConstruction.margin)}%.`,
      drivers: `Pricing added ${pressure(deereConstruction, 'Price realization')}, the largest positive bridge item, against production costs −${pressure(deereConstruction, 'Production costs')} and SG&A/R&D −${pressure(deereConstruction, 'SG&A / R&D')}. Deere described a favorable comparison with higher retail incentives in the prior-year quarter.`,
      decision: 'Separate pricing and incentive effects from workforce productivity before using Deere’s profit improvement as a staffing benchmark.'
    },
    'How would we distinguish a pricing recovery from a genuine productivity gain?', ['deere-q3', 'deere-q3-slides', 'deere-q3-call'], 'win-as-one'),
  q(6, 'deere-small-ag-drivers', 'Read the other agriculture business',
    `Deere Small Agriculture & Turf operating profit rose from $${n(deereSat.priorProfitMillion)}m to $${n(deereSat.profitMillion)}m in ${deerePeriod}. Which reported driver contributed most?`,
    ['Favorable pricing.', 'Higher shipment volumes and favorable mix.', 'Favorable currency translation.', 'The absence of prior-year impairments.'], 1,
    {
      changed: `Deere Small Agriculture & Turf operating profit increased $${n(delta(deereSat, 'profitMillion'))}m, from $${n(deereSat.priorProfitMillion)}m to $${n(deereSat.profitMillion)}m. Sales rose from $${n(deereSat.priorRevenueMillion)}m to $${n(deereSat.revenueMillion)}m.`,
      drivers: `Volume/mix added ${pressure(deereSat, 'Volume / Mix')} and pricing added ${pressure(deereSat, 'Price realization')}; higher production costs removed ${pressure(deereSat, 'Production costs')}. Management described support from dairy/livestock customers and mowing demand, without assigning each a dollar contribution.`,
      decision: 'Segment customer demand before changing hiring and training plans; strength in these customers does not establish a large-ag recovery.'
    },
    'Which customer segments should our staffing forecast distinguish?', ['deere-q3', 'deere-q3-slides', 'deere-q3-call'], 'we-go-beyond'),
  q(7, 'deere-equipment-business-mix', 'Explain the company headline',
    `Deere’s combined equipment-segment operating profit rose $${n(deereProfitGain)}m in ${deerePeriod}. Which business pattern explains the increase?`,
    ['All three equipment segments increased profit.', 'Production & Precision Agriculture supplied most of the increase.', 'Small Ag & Turf and Construction & Forestry gains offset a large-ag decline.', 'Only Construction & Forestry improved; both agriculture segments fell.'], 2,
    {
      changed: `Construction & Forestry added $${n(delta(deereConstruction, 'profitMillion'))}m and Small Agriculture & Turf added $${n(delta(deereSat, 'profitMillion'))}m, while Production & Precision Agriculture fell $${n(-delta(deerePpa, 'profitMillion'))}m. Together, those equipment segments increased operating profit by $${n(deereProfitGain)}m.`,
      drivers: `Large-ag volume/mix −${pressure(deerePpa, 'Volume / Mix')} and production costs −${pressure(deerePpa, 'Production costs')} outweighed pricing +${pressure(deerePpa, 'Price realization')} and currency +${pressure(deerePpa, 'Currency translation')}. Deere’s other two equipment businesses improved for different reasons.`,
      decision: 'Use segment and product demand to plan capability; the combined company result can conceal weakness in the business most relevant to a particular plant.'
    },
    'Which Deere business is the closest comparison for our products, and which headline could mislead us?', ['deere-q3', 'deere-q3-slides', 'deere-q3-call']),
  q(8, 'financial-services-drivers', 'Separate financing from manufacturing',
    `Financial Services net income: CNH fell $${n(financing.cnh.prior)}m→$${n(financing.cnh.current)}m in ${cnhPeriod}; Deere rose $${n(financing.deere.prior)}m→$${n(financing.deere.current)}m in ${deerePeriod}. Which reported financing pattern helps explain the difference?`,
    ['CNH compressed outside North America; Deere’s financing spreads improved.', 'CNH’s financing spreads improved; Deere’s compressed.', 'CNH compressed only in North America; Deere’s financing spreads improved.', 'CNH compressed outside North America; Deere’s portfolio grew at unchanged spreads.'], 0,
    {
      changed: `CNH Financial Services net income fell $${n(financing.cnh.prior - financing.cnh.current)}m to $${n(financing.cnh.current)}m. Deere Financial Services net income rose $${n(financing.deere.current - financing.deere.prior)}m to $${n(financing.deere.current)}m; the companies’ quarters end on different dates.`,
      drivers: 'CNH cited margin compression outside North America, Brazil credit-risk pressure and lower volumes in North America and South America. Deere cited favorable financing spreads despite a lower average portfolio.',
      decision: 'Keep financing economics separate from factory-productivity claims, while monitoring how financing conditions affect customer affordability and equipment orders.'
    },
    'How might financing affordability affect orders without being a factory-efficiency issue?', ['cnh-q2', 'deere-q3'], 'you-matter')
];
await writeFile(file, JSON.stringify(round, null, 2) + '\n');
console.log(`Generated ${round.questions.length} sourced CNH / John Deere questions for ${f.period}.`);
