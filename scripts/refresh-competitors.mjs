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
const stockContext = (a,b) => a<0&&b<0 ? 'A smaller decline is relative outperformance when both stocks fall.' : a>0&&b>0 ? 'A larger increase is relative outperformance when both stocks rise.' : 'Relative return compares the percentage movement on matching dates.';
const pct = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${n(Math.abs(value))}%`;
const metric = id => { const item = f.comparison.metrics.find(row=>row.id===id); assert(item, `Missing metric ${id}`); return item; };
const growth = row => (row.current / row.prior - 1) * 100;
const cnhGross = f.grossMargins.find(row => row.company === 'CNH');
const deereGross = f.grossMargins.find(row => row.company === 'Deere');
const ag = f.operating.find(row => row.company === 'CNH' && row.industry === 'agriculture');
const ppa = f.operating.find(row => row.company === 'Deere' && row.segment === 'Production & Precision Agriculture');
const construction = f.comparison.drivers.find(group=>group.rows.some(row=>row.company==='CNH' && row.segment==='Construction')).rows.find(row=>row.company==='CNH');
assert(cnhGross && deereGross && ag && ppa && construction);
const difference = ppa.margin-ag.margin;
assert(difference > 0, 'Revisit agriculture comparison wording if CNH closes the gap');
const stockSources = ['stock-CNH','stock-DE'];
const cnhWeek=returnFor('CNH','week'), deereWeek=returnFor('DE','week');
const cnhMonth=returnFor('CNH','month'), deereMonth=returnFor('DE','month');
const cnhYear=returnFor('CNH','year'), deereYear=returnFor('DE','year');
for (const gap of [cnhWeek-deereWeek,cnhMonth-deereMonth,cnhYear-deereYear]) assert(Math.abs(gap)>0.005,'Revise the stock question when displayed returns tie');
const sales=metric('equipment-sales').cnh, earnings=metric('net-income').cnh;
assert(sales.current>sales.prior && earnings.current<earnings.prior, 'Revisit sales/profit interpretation when the trend changes');
assert(construction.revenueMillion>construction.priorRevenueMillion && construction.profitMillion<construction.priorProfitMillion,'Revisit construction wording when the trend changes');
const workforce = f.headcount.find(row=>row.company==='Deere');
assert(workforce);
function q(index, topic, stage, prompt, options, correct, explanation, discussion, ids, valueId='make-it-simple') {
  assert.equal(options.length,4);
  assert.equal(new Set(options).size,4);
  assert(Number.isInteger(correct) && correct>=0 && correct<4);
  return {id:`${round.setId}-${String(index).padStart(2,'0')}`,topic,stage,prompt,options,correct,explanation,discussion,basis:`${f.period} · CNH vs John Deere · actual source periods on the reference`,sourceIds:ids,sources:ids.map(source),valueConnection:{valueId,why:'Use the financial evidence and its scope to make a clear operating decision.'}};
}
round.period=f.period;
round.questionDurationMs=25000;
round.sources=structuredClone(f.sources);
round.sourceIds=f.sources.map(s=>s.id);
round.questions=[
q(1,'sales-versus-profit','Read the headline',`CNH equipment sales grew ${n(growth(sales))}%; parent net income fell ${n(Math.abs(growth(earnings)))}%. What does this tell us?`,
 ['Sales growth alone does not guarantee profit growth.','More revenue always creates more profit.','The sales figure includes only financing income.','Net income is the same as gross profit.'],0,
 `CNH equipment sales rose from $${n(sales.prior)}m to $${n(sales.current)}m, while attributable net income fell from $${n(earnings.prior)}m to $${n(earnings.current)}m. Revenue is before expenses; net income is after them. Read the cost and margin changes to explain the result.`,
 'Which costs, pricing and product-mix changes matter most for our decisions?', ['cnh-q2']),
q(2,'peer-gross-margin','Explain a sales dollar',`CNH equipment gross margin is ${n(cnhGross.margin)}%. Roughly how much remains from $100 of equipment sales after product costs?`,
 [`$${n(ag.margin)}`,`$${n(cnhGross.margin)}`,`$${n(deereGross.margin)}`,`$${n(metric('equipment-op-margin').cnh.current)}`],1,
 `About $${n(cnhGross.margin)} remains. CNH gross profit was $${n(metric('gross-profit').cnh.current)}m on $${n(sales.current)}m equipment sales. This still has to cover overhead, development and other expenses. Deere’s equipment gross margin is ${n(deereGross.margin)}%, with different products and quarter dates.`,
 'What would better quality, less scrap and stronger pricing do to the dollars retained?', ['cnh-deck','deere-q3']),
q(3,'peer-operating-margin','Read the margin gap',`CNH Agriculture: ${n(ag.margin)}%. Deere Production & Precision Ag: ${n(ppa.margin)}%. What is the reported margin gap?`,
 [`${n(difference)} percentage points, Deere higher.`,`${n(difference*10)} percentage points, Deere higher.`,`${n(difference)} percentage points, CNH higher.`,'Both margins are the same.'],0,
 `The displayed gap is ${n(difference)} percentage points. CNH uses adjusted EBIT; Deere uses segment operating profit. Deere’s quarter ends later and its business scope differs. The gap is context to investigate, not a staffing or workforce-efficiency target.`,
 'What scope, mix and accounting differences would Finance reconcile before setting a target?', [ag.sourceId,ppa.sourceId],'win-as-one'),
q(4,'construction-costs','Explain the outcome',`CNH Construction sales rose to $${n(construction.revenueMillion)}m, but profit fell to $${n(construction.profitMillion)}m. What is the best reading?`,
 ['Higher sales prove that margins improved.','Profit is unrelated to product costs.','More sales were outweighed by pressures on profit.','The result proves that headcount must be cut.'],2,
 `Sales rose from $${n(construction.priorRevenueMillion)}m; adjusted EBIT fell from $${n(construction.priorProfitMillion)}m. CNH cited tariffs and higher R&D, partly offset by volume and lower SG&A. Selling more is helpful, but the remaining profit depends on costs and price.`,
 'Which cost, quality or pricing actions could improve the result while protecting needed capability?', ['cnh-q2'],'we-go-beyond'),
q(5,'peer-workforce','Understand company scale',`John Deere disclosed ${n(workforce.count)} worldwide employees. What does this establish?`,
 ['Deere is more productive per worker.','CNH should use the same staffing ratio.','This is Deere’s current North America headcount.','Deere’s global workforce size at the disclosed annual date.'],3,
 `The count is ${n(workforce.count)} at ${workforce.asOf}; CNH’s disclosed count is ${n(f.headcount.find(row=>row.company==='CNH').count)} at its separately stated year-end. Counts establish scale, not productivity. Compare output, hours, business mix and outsourcing before drawing a staffing conclusion.`,
 'What evidence would allow a fair comparison of workforce productivity?', ['cnh-annual','deere-annual'],'you-matter'),
q(6,'peer-stock-week','Read one week','Which stock had the stronger price return over this edition’s one-week window?',
 [`CNH: ${pct(cnhWeek)}`,`John Deere: ${pct(deereWeek)}`,'The two returns were equal.','Dollar share prices are needed to compare returns.'],cnhWeek>deereWeek?0:1,
 `${cnhWeek>deereWeek?'CNH':'John Deere'} had the stronger price return from ${f.stock.periods.week.start} to ${f.stock.periods.week.end}. CNH ${pct(cnhWeek)}; Deere ${pct(deereWeek)}. ${stockContext(cnhWeek,deereWeek)} Dividends are excluded.`,
 'What facts can we report from the prices, and what additional evidence would explain the move?',stockSources),
q(7,'peer-stock-month','Compare one month',`One month: CNH ${pct(cnhMonth)}, John Deere ${pct(deereMonth)}. Which performed better?`,
 [`CNH by ${n(Math.abs(cnhMonth-deereMonth))} percentage points.`,`John Deere by ${n(Math.abs(cnhMonth-deereMonth))} percentage points.`,'Dollar share prices establish the better return.','They delivered the same price return.'],cnhMonth>deereMonth?0:1,
 `${cnhMonth>deereMonth?'CNH':'John Deere'} outperformed by ${n(Math.abs(cnhMonth-deereMonth))} percentage points from ${f.stock.periods.month.start} to ${f.stock.periods.month.end}. Relative performance and a positive absolute return are different claims.`,
 'How can we describe relative performance alongside each stock’s absolute return?',stockSources),
q(8,'peer-stock-year','Take the longer view',`One year: CNH ${pct(cnhYear)}, John Deere ${pct(deereYear)}. What is the accurate conclusion?`,
 [cnhYear>0&&deereYear>0?`Both rose; ${cnhYear>deereYear?'CNH':'John Deere'} rose more.`:`${cnhYear>deereYear?'CNH':'John Deere'} had the higher return.`,'Their price returns were equal.','The share-price gap proves a workforce-efficiency gap.','These returns include dividends.'],0,
 `From ${f.stock.periods.year.start} to ${f.stock.periods.year.end}, CNH returned ${pct(cnhYear)} and Deere ${pct(deereYear)}. CNH minus Deere is ${n(cnhYear-deereYear)} percentage points. These are price returns excluding dividends; neither explains the cause of the gap.`,
 'What would sustained progress look like across margins, cash, customer outcomes and capability?', [...stockSources,'year-CNH','year-DE'],'we-go-beyond')
];
await writeFile(file, JSON.stringify(round,null,2)+'\n');
console.log(`Generated ${round.questions.length} sourced CNH / John Deere questions for ${f.period}.`);
