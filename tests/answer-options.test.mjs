import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import beginner from '../src/beginner.json' with { type: 'json' };
import leadership from '../src/leadership.json' with { type: 'json' };
import competitors from '../src/competitors.json' with { type: 'json' };
import challenges from '../src/challenges.json' with { type: 'json' };
import levels from '../src/question-levels.json' with { type: 'json' };
import weekly from '../src/weekly-bank.json' with { type: 'json' };
import { shuffleRoundOptions } from '../src/rounds.mjs';

const rounds = [...beginner, leadership, competitors, ...challenges, ...levels, ...weekly.rounds];
const questions = rounds.flatMap(round => round.questions);

function numericOption(text) {
  const match = /^([+$−-]?)([\d,]+(?:\.\d+)?)\s*(%|bps|million|billion)?$/i.exec(text.trim());
  if (!match) return null;
  return {
    value: Number(match[2].replaceAll(',', '')) * (/[-−]/.test(match[1]) ? -1 : 1),
    unit: (match[1].includes('$') ? '$' : '') + (match[3] || '').toLowerCase()
  };
}

test('equipment gross margin distinguishes dollars retained from dollars spent on product cost', () => {
  const question = competitors.questions.find(question => question.topic === 'peer-gross-margin');
  assert.match(question.prompt, /18%.*\$100/);
  assert.equal(question.options[question.correct], '$18');
  assert(question.options.includes('$82'), 'the product-cost complement is a plausible wrong answer');
  assert.equal(question.options.filter(option => option === '$82').length, 1);
  for (const rotation of [0, 0.25, 0.5, 0.75]) {
    const shuffled = shuffleRoundOptions({ questions: [question] }, () => rotation).questions[0];
    assert.equal(shuffled.options[shuffled.correct], '$18');
    assert(shuffled.options.includes('$82'));
  }
});

test('served questions have four distinct choices and numeric distractors do not depend on tiny rounding differences', () => {
  for (const question of questions) {
    assert.equal(question.options.length, 4, question.id);
    assert.equal(new Set(question.options.map(option => option.trim().toLowerCase())).size, 4, question.id);
    assert(Number.isInteger(question.correct) && question.correct >= 0 && question.correct < 4, question.id);
    const answer = numericOption(question.options[question.correct]);
    if (!answer || answer.value === 0) continue;
    question.options.forEach((option, index) => {
      const wrong = numericOption(option);
      if (index === question.correct || !wrong || answer.unit !== wrong.unit) return;
      assert(Math.abs(wrong.value - answer.value) / Math.abs(answer.value) >= 0.05,
        `${question.id}: ${option} is too close to ${question.options[question.correct]}`);
    });
  }
});

test('weekly answer help continues to reveal the keyed answer after distractor edits', () => {
  for (const question of weekly.rounds.flatMap(round => round.questions)) {
    for (const hint of question.hints.filter(hint => hint.kind === 'answer')) {
      assert.equal(hint.text, question.options[question.correct], question.id);
    }
  }
});

test('competitor refresh preserves the reviewed business questions, sources and profit bridges', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cnh-reviewed-round-'));
  try {
    await Promise.all([
      mkdir(join(directory, 'src')),
      mkdir(join(directory, 'scripts'))
    ]);
    const script = await readFile(new URL('../scripts/refresh-competitors.mjs', import.meta.url), 'utf8');
    const bankFile = join(directory, 'src', 'competitors.json');
    const scriptFile = join(directory, 'scripts', 'refresh-competitors.mjs');
    await Promise.all([
      writeFile(bankFile, JSON.stringify(competitors), 'utf8'),
      writeFile(scriptFile, script, 'utf8')
    ]);
    execFileSync(process.execPath, [scriptFile], { stdio: 'pipe' });
    const refreshed = JSON.parse(await readFile(bankFile, 'utf8'));
    assert.deepEqual(refreshed, competitors);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
