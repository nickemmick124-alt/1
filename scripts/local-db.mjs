import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function openDatabase(path = ':memory:') {
  const database = new DatabaseSync(path);
  database.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) {
    if (!database.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name)) {
      database.exec('BEGIN');
      try { database.exec(readFileSync('drizzle/' + name, 'utf8')); database.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name); database.exec('COMMIT'); }
      catch (e) { database.exec('ROLLBACK'); throw e; }
    }
  }
  const DB = { prepare(sql) { const statement = database.prepare(sql); let args = []; const wrapper = { bind(...values) { args = values; return wrapper; }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; }, async run() { return statement.run(...args); } }; return wrapper; } };
  return { DB, close: () => database.close() };
}
