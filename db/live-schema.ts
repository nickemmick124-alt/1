import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(), hostId: text('host_id').notNull(), title: text('title').notNull(), snapshot: text('snapshot').notNull(), phase: text('phase').notNull(), questionIndex: integer('question_index').notNull(), startedAt: integer('started_at'), createdAt: text('created_at').notNull()
}, t => [index('rooms_host_created').on(t.hostId, t.createdAt)]);
export const players = sqliteTable('players', {
  id: text('id').primaryKey(), roomCode: text('room_code').notNull().references(() => rooms.code), userId: text('user_id').notNull(), name: text('name').notNull(), email: text('email').notNull(), joinedAt: text('joined_at').notNull(), participantType: text('participant_type').notNull().default('account')
}, t => [uniqueIndex('players_room_user').on(t.roomCode, t.userId)]);
export const answers = sqliteTable('answers', {
  id: text('id').primaryKey(), roomCode: text('room_code').notNull().references(() => rooms.code), userId: text('user_id').notNull(), questionIndex: integer('question_index').notNull(), selected: integer('selected').notNull(), isCorrect: integer('is_correct').notNull(), points: integer('points').notNull(), elapsedMs: integer('elapsed_ms').notNull(), submittedAt: text('submitted_at').notNull()
}, t => [uniqueIndex('answers_room_user_question').on(t.roomCode, t.userId, t.questionIndex)]);
export const hostAccess = sqliteTable('host_access', {
  email: text('email').primaryKey(), displayName: text('display_name').notNull(), grantedBy: text('granted_by').notNull(), grantedAt: text('granted_at').notNull()
});
export const guestSessions = sqliteTable('guest_sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull(), displayName: text('display_name').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull()
}, t => [uniqueIndex('guest_sessions_user').on(t.userId), index('guest_sessions_expiry').on(t.expiresAt)]);
