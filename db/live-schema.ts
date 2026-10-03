import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(), hostId: text('host_id').notNull(), title: text('title').notNull(), snapshot: text('snapshot').notNull(), phase: text('phase').notNull(), questionIndex: integer('question_index').notNull(), startedAt: integer('started_at'), createdAt: text('created_at').notNull()
}, t => [index('rooms_host_created').on(t.hostId, t.createdAt)]);
export const players = sqliteTable('players', {
  id: text('id').primaryKey(), roomCode: text('room_code').notNull().references(() => rooms.code), userId: text('user_id').notNull(), name: text('name').notNull(), email: text('email').notNull(), joinedAt: text('joined_at').notNull()
}, t => [uniqueIndex('players_room_user').on(t.roomCode, t.userId)]);
export const answers = sqliteTable('answers', {
  id: text('id').primaryKey(), roomCode: text('room_code').notNull().references(() => rooms.code), userId: text('user_id').notNull(), questionIndex: integer('question_index').notNull(), selected: integer('selected').notNull(), isCorrect: integer('is_correct').notNull(), points: integer('points').notNull(), elapsedMs: integer('elapsed_ms').notNull(), submittedAt: text('submitted_at').notNull()
}, t => [uniqueIndex('answers_room_user_question').on(t.roomCode, t.userId, t.questionIndex)]);
