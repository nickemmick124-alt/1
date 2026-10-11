import { mkdir, readFile, writeFile } from 'node:fs/promises';
const files = { '/index.html': 'text/html; charset=utf-8', '/style.css': 'text/css; charset=utf-8', '/live-style.css': 'text/css; charset=utf-8', '/business-style.css': 'text/css; charset=utf-8', '/leadership-style.css': 'text/css; charset=utf-8', '/competitors.css': 'text/css; charset=utf-8', '/live-app.js': 'text/javascript; charset=utf-8', '/business-app.js': 'text/javascript; charset=utf-8', '/leadership.js': 'text/javascript; charset=utf-8', '/competitors.js': 'text/javascript; charset=utf-8', '/capacity.js': 'text/javascript; charset=utf-8', '/values.js': 'text/javascript; charset=utf-8', '/favicon.svg': 'image/svg+xml', '/cnh-logo.png': 'image/png' };
for (const file of ['arena.css','fonts.css','arena-backdrop.webp','arena-game-art.webp', ...Array.from({ length: 7 }, (_, i) => `font-${i}.woff2`), ...['arrow-right','check-circle','triangle','diamond','circle','square'].map(name => `icon-${name}.svg`)]) {
  files['/' + file] = file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.webp') ? 'image/webp' : file.endsWith('.woff2') ? 'font/woff2' : 'image/svg+xml';
}
Object.assign(files, { '/practice.html': 'text/html; charset=utf-8', '/practice.js': 'text/javascript; charset=utf-8', '/practice.css': 'text/css; charset=utf-8' });
const assets = {};
for (const [path, type] of Object.entries(files)) {
  const binary = type === 'image/png' || type === 'image/webp' || type === 'font/woff2';
  assets[path] = { type, ...(binary ? { encoding: 'base64' } : {}), body: binary ? (await readFile('public' + path)).toString('base64') : await readFile('public' + path, 'utf8') };
}
await mkdir('src', { recursive: true });
await writeFile('src/assets.mjs', 'export const assets = ' + JSON.stringify(assets) + ';\n');
await mkdir('dist/server', { recursive: true });
const domain = (await readFile('src/domain.mjs', 'utf8')).replaceAll('export function ', 'function ');
const weeklyBank = await readFile('src/weekly-bank.json', 'utf8');
const weekly = (await readFile('src/weekly.mjs', 'utf8')).replaceAll('export function ', 'function ');
const data = await readFile('src/challenges.json', 'utf8');
const beginnerData = await readFile('src/beginner.json', 'utf8');
const leadershipData = await readFile('src/leadership.json', 'utf8');
const competitorData = await readFile('src/competitors.json', 'utf8');
const extraQuestions = await readFile('src/question-levels.json', 'utf8');
const rounds = (await readFile('src/rounds.mjs', 'utf8')).replaceAll('export function ', 'function ').replaceAll('export const ', 'const ');
const context = await readFile('src/business-context.json', 'utf8');
const values = (await readFile('public/values.js', 'utf8')).replaceAll('export function ', 'function ');
const access = (await readFile('src/access.mjs', 'utf8')).replaceAll('export async function ', 'async function ').replaceAll('export function ', 'function ');
const guests = (await readFile('src/guests.mjs', 'utf8')).replaceAll('export async function ', 'async function ');
const worker = (await readFile('src/live.mjs', 'utf8')).split('\n').filter(line => !line.startsWith('import ')).join('\n');
await writeFile('dist/server/index.js', `const weeklyBank = ${weeklyBank};\n${weekly}\nconst challenges = ${data};\nconst questionLevels = ${extraQuestions};\nconst beginnerRounds = ${beginnerData};\nconst leadershipRound = ${leadershipData};\nconst competitorRound = ${competitorData};\nconst businessContext = ${context};\nconst assets = ${JSON.stringify(assets)};\n${values}\n${rounds}\n${access}\n${guests}\n${domain}\n${worker}`);
console.log('Built Cloudflare Worker with embedded frontend.');
