export function capacityReadiness(input) {
  const keys = ['demand', 'assembly', 'test', 'materials', 'yield'];
  if (keys.some(k => input[k] === '' || input[k] === null || input[k] === undefined)) return { error: 'Enter all five figures using the same weekly production period.' };
  const v = Object.fromEntries(keys.map(k => [k, Number(input[k])]));
  if (keys.some(k => !Number.isFinite(v[k]) || v[k] < 0) || !Number.isInteger(v.demand) || v.yield > 100 || v.yield <= 0) return { error: 'Use whole good-unit demand, nonnegative capacities, and a first-pass yield above 0%, up to 100%.' };
  const stages = [['Assembly', v.assembly], ['Final test', v.test], ['Material availability', v.materials]];
  const gross = Math.min(...stages.map(s => s[1]));
  const good = Math.floor(gross * v.yield / 100);
  const requiredGross = Math.ceil(v.demand / (v.yield / 100));
  return { demand: v.demand, gross, good, requiredGross, gap: Math.max(0, v.demand - good), surplus: Math.max(0, good - v.demand), bottlenecks: stages.filter(s => s[1] === gross).map(s => s[0]), load: good > 0 ? v.demand / good * 100 : null, ready: good >= v.demand };
}
