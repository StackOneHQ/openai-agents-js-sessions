// Matches Python SDK's agent_sessions and agent_messages tables
import { sql } from 'drizzle-orm';
import {
    int,
    mediumtext,
    index as mysqlIndex,
    mysqlTable,
    timestamp as mysqlTimestamp,
    varchar as mysqlVarchar,
} from 'drizzle-orm/mysql-core';
import {
    index as pgIndex,
    pgTable,
    text as pgText,
    timestamp as pgTimestamp,
    varchar as pgVarchar,
    serial,
} from 'drizzle-orm/pg-core';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// SQLite Schema
export const sqliteSessions = sqliteTable('agent_sessions', {
    sessionId: text('session_id').primaryKey(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const sqliteMessages = sqliteTable(
    'agent_messages',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        sessionId: text('session_id')
            .notNull()
            .references(() => sqliteSessions.sessionId, { onDelete: 'cascade' }),
        messageData: text('message_data').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [index('idx_agent_messages_session_time').on(table.sessionId, table.createdAt)],
);

// PostgreSQL Schema
export const pgSessions = pgTable('agent_sessions', {
    sessionId: pgVarchar('session_id', { length: 255 }).primaryKey(),
    createdAt: pgTimestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: pgTimestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
});

export const pgMessages = pgTable(
    'agent_messages',
    {
        id: serial('id').primaryKey(),
        sessionId: pgVarchar('session_id', { length: 255 })
            .notNull()
            .references(() => pgSessions.sessionId, { onDelete: 'cascade' }),
        messageData: pgText('message_data').notNull(),
        createdAt: pgTimestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    },
    (table) => [pgIndex('idx_agent_messages_session_time').on(table.sessionId, table.createdAt)],
);

// MySQL Schema
export const mysqlSessions = mysqlTable('agent_sessions', {
    sessionId: mysqlVarchar('session_id', { length: 255 }).primaryKey(),
    createdAt: mysqlTimestamp('created_at', { mode: 'date' })
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: mysqlTimestamp('updated_at', { mode: 'date' })
        .notNull()
        .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const mysqlMessages = mysqlTable(
    'agent_messages',
    {
        id: int('id').primaryKey().autoincrement(),
        sessionId: mysqlVarchar('session_id', { length: 255 })
            .notNull()
            .references(() => mysqlSessions.sessionId, { onDelete: 'cascade' }),
        messageData: mediumtext('message_data').notNull(),
        createdAt: mysqlTimestamp('created_at', { mode: 'date' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => [mysqlIndex('idx_agent_messages_session_time').on(table.sessionId, table.createdAt)],
);

// Type exports
export type SqliteSession = typeof sqliteSessions.$inferSelect;
export type SqliteMessage = typeof sqliteMessages.$inferSelect;
export type PgSession = typeof pgSessions.$inferSelect;
export type PgMessage = typeof pgMessages.$inferSelect;
export type MysqlSession = typeof mysqlSessions.$inferSelect;
export type MysqlMessage = typeof mysqlMessages.$inferSelect;
