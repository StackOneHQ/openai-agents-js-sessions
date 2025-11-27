import type { AgentInputItem } from '@openai/agents';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { type MySql2Database, drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import { type NodePgDatabase, drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import {
    mysqlMessages,
    mysqlSessions,
    pgMessages,
    pgSessions,
    sqliteMessages,
    sqliteSessions,
} from './schema';
import { SessionBase } from './session';

// Database executor interfaces for each database type
interface SqliteExecutor {
    type: 'sqlite';
    db: BetterSQLite3Database<{
        sqliteSessions: typeof sqliteSessions;
        sqliteMessages: typeof sqliteMessages;
    }>;
    sessions: typeof sqliteSessions;
    messages: typeof sqliteMessages;
}

interface PgExecutor {
    type: 'postgres';
    db: NodePgDatabase<{ pgSessions: typeof pgSessions; pgMessages: typeof pgMessages }>;
    sessions: typeof pgSessions;
    messages: typeof pgMessages;
}

interface MysqlExecutor {
    type: 'mysql';
    db: MySql2Database<{
        mysqlSessions: typeof mysqlSessions;
        mysqlMessages: typeof mysqlMessages;
    }>;
    sessions: typeof mysqlSessions;
    messages: typeof mysqlMessages;
}

type DatabaseExecutor = SqliteExecutor | PgExecutor | MysqlExecutor;

interface ConnectionConfig {
    createTables?: boolean;
    maxRetries?: number;
    retryDelay?: number;
    connectionTimeout?: number;
}

const DEFAULT_CONFIG: Required<ConnectionConfig> = {
    createTables: true,
    maxRetries: 3,
    retryDelay: 1000,
    connectionTimeout: 10000,
};

/**
 * Drizzle ORM-powered session storage.
 *
 * Supports SQLite, PostgreSQL, and MySQL databases through a unified API.
 * Matches the Python SDK's SQLAlchemySession implementation with agent_sessions
 * and agent_messages tables.
 *
 * @example
 * ```typescript
 * // SQLite (in-memory)
 * const session = await DrizzleSession.fromUrl('chat_123', 'sqlite::memory:');
 *
 * // SQLite (file)
 * const session = await DrizzleSession.fromUrl('chat_123', 'sqlite:./data.db');
 *
 * // PostgreSQL
 * const session = await DrizzleSession.fromUrl('chat_123', 'postgres://user:pass@localhost/db');
 *
 * // MySQL
 * const session = await DrizzleSession.fromUrl('chat_123', 'mysql://user:pass@localhost/db');
 *
 * // With custom configuration
 * const session = await DrizzleSession.fromUrl('chat_123', 'postgres://...', {
 *     createTables: false  // Assumes tables exist
 *     maxRetries: 5,
 *     retryDelay: 2000,
 *     connectionTimeout: 15000,
 * });
 *
 * // Use the session
 * await session.addItems([{ role: 'user', content: 'Hello' }]);
 * const history = await session.getItems();
 * ```
 */
export class DrizzleSession extends SessionBase {
    private cleanupRegistry?: FinalizationRegistry<() => void | Promise<void>>;

    private constructor(
        sessionId: string,
        private readonly executor: DatabaseExecutor,
        private readonly cleanup: () => Promise<void>,
    ) {
        super(sessionId);

        // Auto-cleanup using FinalizationRegistry (if available)
        if (typeof FinalizationRegistry !== 'undefined') {
            this.cleanupRegistry = new FinalizationRegistry((cleanupFn) => {
                void cleanupFn();
            });
            this.cleanupRegistry.register(this, cleanup, this);
        }
    }

    /**
     * Create a new DrizzleSession connected to the specified database.
     *
     * @param sessionId - Unique identifier for this session
     * @param url - Database connection URL
     *   - SQLite: `sqlite::memory:` or `sqlite:./path/to/db.sqlite`
     *   - PostgreSQL: `postgres://user:pass@host:port/database`
     *   - MySQL: `mysql://user:pass@host:port/database`
     * @param config - Optional connection configuration
     */
    static async fromUrl(
        sessionId: string,
        url: string,
        config?: ConnectionConfig,
    ): Promise<DrizzleSession> {
        const finalConfig = { ...DEFAULT_CONFIG, ...config };
        const { protocol, path } = parseUrl(url);

        if (protocol === 'sqlite') {
            return this.createSqliteSession(sessionId, path, finalConfig);
        }

        if (protocol === 'postgres') {
            return this.createPostgresSession(sessionId, url, finalConfig);
        }

        if (protocol === 'mysql') {
            return this.createMysqlSession(sessionId, url, finalConfig);
        }

        throw new Error(`Unsupported database URL: ${url}. Use sqlite:, postgres://, or mysql://`);
    }

    private static async createSqliteSession(
        sessionId: string,
        path: string,
        config: Required<ConnectionConfig>,
    ): Promise<DrizzleSession> {
        try {
            const Database = (await import('better-sqlite3')).default;
            const sqlite = new Database(path);
            const db = drizzleSqlite(sqlite, {
                schema: { sqliteSessions, sqliteMessages },
            });

            const session = new DrizzleSession(
                sessionId,
                { type: 'sqlite', db, sessions: sqliteSessions, messages: sqliteMessages },
                async () => {
                    try {
                        sqlite.close();
                    } catch (error) {
                        console.error('Error closing SQLite connection:', error);
                    }
                },
            );

            if (config.createTables) {
                await session.ensureTables();
            }

            return session;
        } catch (error) {
            throw new Error(
                `Failed to create SQLite session: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    private static async createPostgresSession(
        sessionId: string,
        url: string,
        config: Required<ConnectionConfig>,
    ): Promise<DrizzleSession> {
        const { default: pg } = await import('pg');
        const pool = new pg.Pool({
            connectionString: url,
            connectionTimeoutMillis: config.connectionTimeout,
        });

        let retries = 0;
        while (retries < config.maxRetries) {
            try {
                const db = drizzlePg(pool, { schema: { pgSessions, pgMessages } });

                const session = new DrizzleSession(
                    sessionId,
                    { type: 'postgres', db, sessions: pgSessions, messages: pgMessages },
                    async () => {
                        try {
                            await pool.end();
                        } catch (error) {
                            console.error('Error closing PostgreSQL pool:', error);
                        }
                    },
                );

                if (config.createTables) {
                    await session.ensureTables();
                }

                return session;
            } catch (error) {
                retries++;
                if (retries >= config.maxRetries) {
                    await pool.end().catch(() => {});
                    throw new Error(
                        `Failed to create PostgreSQL session after ${config.maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    );
                }
                await new Promise((resolve) => setTimeout(resolve, config.retryDelay));
            }
        }

        throw new Error('Failed to create PostgreSQL session');
    }

    private static async createMysqlSession(
        sessionId: string,
        url: string,
        config: Required<ConnectionConfig>,
    ): Promise<DrizzleSession> {
        const mysql = await import('mysql2/promise');
        const pool = mysql.createPool({
            uri: url,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            connectTimeout: config.connectionTimeout,
        });

        let retries = 0;
        while (retries < config.maxRetries) {
            try {
                const db = drizzleMysql(pool, {
                    schema: { mysqlSessions, mysqlMessages },
                    mode: 'default',
                });

                const session = new DrizzleSession(
                    sessionId,
                    { type: 'mysql', db, sessions: mysqlSessions, messages: mysqlMessages },
                    async () => {
                        try {
                            await pool.end();
                        } catch (error) {
                            console.error('Error closing MySQL pool:', error);
                        }
                    },
                );

                if (config.createTables) {
                    await session.ensureTables();
                }

                return session;
            } catch (error) {
                retries++;
                if (retries >= config.maxRetries) {
                    await pool.end().catch(() => {});
                    throw new Error(
                        `Failed to create MySQL session after ${config.maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    );
                }
                await new Promise((resolve) => setTimeout(resolve, config.retryDelay));
            }
        }

        throw new Error('Failed to create MySQL session');
    }

    /**
     * Ensure database tables exist. Creates them if they don't exist.
     */
    private async ensureTables(): Promise<void> {
        if (this.executor.type === 'sqlite') {
            const { db } = this.executor as SqliteExecutor;

            // Create agent_sessions table
            db.run(sql`
                CREATE TABLE IF NOT EXISTS agent_sessions (
                    session_id TEXT PRIMARY KEY,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
                )
            `);

            // Create agent_messages table
            db.run(sql`
                CREATE TABLE IF NOT EXISTS agent_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
                    message_data TEXT NOT NULL,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch())
                )
            `);

            // Create index
            db.run(sql`
                CREATE INDEX IF NOT EXISTS idx_agent_messages_session_time
                ON agent_messages(session_id, created_at)
            `);

            return;
        }

        if (this.executor.type === 'postgres') {
            const { db } = this.executor as PgExecutor;

            // Create agent_sessions table
            await db.execute(sql`
                CREATE TABLE IF NOT EXISTS agent_sessions (
                    session_id VARCHAR(255) PRIMARY KEY,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create agent_messages table
            await db.execute(sql`
                CREATE TABLE IF NOT EXISTS agent_messages (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR(255) NOT NULL REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
                    message_data TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create index
            await db.execute(sql`
                CREATE INDEX IF NOT EXISTS idx_agent_messages_session_time
                ON agent_messages(session_id, created_at)
            `);

            return;
        }

        const { db } = this.executor as MysqlExecutor;

        // Create agent_sessions table
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS agent_sessions (
                session_id VARCHAR(255) PRIMARY KEY,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Create agent_messages table
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS agent_messages (
                id INT PRIMARY KEY AUTO_INCREMENT,
                session_id VARCHAR(255) NOT NULL,
                message_data MEDIUMTEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
            )
        `);

        // Create index
        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_agent_messages_session_time
            ON agent_messages(session_id, created_at)
        `);
    }

    async getItems(limit?: number): Promise<AgentInputItem[]> {
        try {
            if (this.executor.type === 'sqlite') {
                return this.getSqliteItems(limit);
            }
            return this.getAsyncItems(limit);
        } catch (error) {
            throw new Error(
                `Failed to get items: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    private getSqliteItems(limit?: number): AgentInputItem[] {
        const { db, messages } = this.executor as SqliteExecutor;

        if (limit !== undefined) {
            if (limit <= 0) return [];

            // Get latest N items ordered by timestamp desc, then reverse for chronological order
            const rows = db
                .select({ messageData: messages.messageData })
                .from(messages)
                .where(
                    sql`${messages.id} IN (
                        SELECT id FROM ${messages}
                        WHERE ${eq(messages.sessionId, this.sessionId)}
                        ORDER BY created_at DESC, id DESC
                        LIMIT ${limit}
                    )`,
                )
                .orderBy(asc(messages.createdAt), asc(messages.id))
                .all();

            return this.parseItems(rows);
        }

        const rows = db
            .select({ messageData: messages.messageData })
            .from(messages)
            .where(eq(messages.sessionId, this.sessionId))
            .orderBy(asc(messages.createdAt), asc(messages.id))
            .all();

        return this.parseItems(rows);
    }

    private async getAsyncItems(limit?: number): Promise<AgentInputItem[]> {
        if (this.executor.type === 'postgres') {
            return this.getPgItems(limit);
        }
        return this.getMysqlItems(limit);
    }

    private async getPgItems(limit?: number): Promise<AgentInputItem[]> {
        const { db, messages } = this.executor as PgExecutor;

        if (limit !== undefined) {
            if (limit <= 0) return [];

            const rows = await db
                .select({ messageData: messages.messageData })
                .from(messages)
                .where(
                    sql`${messages.id} IN (
                        SELECT id FROM ${messages}
                        WHERE ${eq(messages.sessionId, this.sessionId)}
                        ORDER BY created_at DESC, id DESC
                        LIMIT ${limit}
                    )`,
                )
                .orderBy(asc(messages.createdAt), asc(messages.id));

            return this.parseItems(rows);
        }

        const rows = await db
            .select({ messageData: messages.messageData })
            .from(messages)
            .where(eq(messages.sessionId, this.sessionId))
            .orderBy(asc(messages.createdAt), asc(messages.id));

        return this.parseItems(rows);
    }

    private async getMysqlItems(limit?: number): Promise<AgentInputItem[]> {
        const { db, messages } = this.executor as MysqlExecutor;

        if (limit !== undefined) {
            if (limit <= 0) return [];

            const rows = await db
                .select({ messageData: messages.messageData })
                .from(messages)
                .where(
                    sql`${messages.id} IN (
                        SELECT id FROM ${messages}
                        WHERE ${eq(messages.sessionId, this.sessionId)}
                        ORDER BY created_at DESC, id DESC
                        LIMIT ${limit}
                    )`,
                )
                .orderBy(asc(messages.createdAt), asc(messages.id));

            return this.parseItems(rows);
        }

        const rows = await db
            .select({ messageData: messages.messageData })
            .from(messages)
            .where(eq(messages.sessionId, this.sessionId))
            .orderBy(asc(messages.createdAt), asc(messages.id));

        return this.parseItems(rows);
    }

    private parseItems(rows: Array<{ messageData: string }>): AgentInputItem[] {
        return rows
            .map((row, index) => {
                try {
                    return JSON.parse(row.messageData) as AgentInputItem;
                } catch (error) {
                    console.error(`Failed to parse item at index ${index}:`, error);
                    return null;
                }
            })
            .filter((item): item is AgentInputItem => item !== null);
    }

    async addItems(items: AgentInputItem[]): Promise<void> {
        if (items.length === 0) return;

        try {
            if (this.executor.type === 'sqlite') {
                await this.addSqliteItems(items);
                return;
            }

            if (this.executor.type === 'postgres') {
                await this.addPgItems(items);
                return;
            }

            await this.addMysqlItems(items);
        } catch (error) {
            throw new Error(
                `Failed to add items: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    private async addSqliteItems(items: AgentInputItem[]): Promise<void> {
        const { db, sessions, messages } = this.executor as SqliteExecutor;

        // Ensure session exists
        const existing = db
            .select({ sessionId: sessions.sessionId })
            .from(sessions)
            .where(eq(sessions.sessionId, this.sessionId))
            .get();

        if (!existing) {
            db.insert(sessions).values({ sessionId: this.sessionId }).run();
        }

        // Insert messages
        const values = items.map((item) => ({
            sessionId: this.sessionId,
            messageData: JSON.stringify(item),
        }));

        db.insert(messages).values(values).run();

        // Update session timestamp
        db.update(sessions)
            .set({ updatedAt: new Date() })
            .where(eq(sessions.sessionId, this.sessionId))
            .run();
    }

    private async addPgItems(items: AgentInputItem[]): Promise<void> {
        const { db, sessions, messages } = this.executor as PgExecutor;

        // Ensure session exists
        const existing = await db
            .select({ sessionId: sessions.sessionId })
            .from(sessions)
            .where(eq(sessions.sessionId, this.sessionId))
            .limit(1);

        if (existing.length === 0) {
            await db.insert(sessions).values({ sessionId: this.sessionId });
        }

        // Insert messages
        const values = items.map((item) => ({
            sessionId: this.sessionId,
            messageData: JSON.stringify(item),
        }));

        await db.insert(messages).values(values);

        // Update session timestamp
        await db
            .update(sessions)
            .set({ updatedAt: new Date() })
            .where(eq(sessions.sessionId, this.sessionId));
    }

    private async addMysqlItems(items: AgentInputItem[]): Promise<void> {
        const { db, sessions, messages } = this.executor as MysqlExecutor;

        // Ensure session exists
        const existing = await db
            .select({ sessionId: sessions.sessionId })
            .from(sessions)
            .where(eq(sessions.sessionId, this.sessionId))
            .limit(1);

        if (existing.length === 0) {
            await db.insert(sessions).values({ sessionId: this.sessionId });
        }

        // Insert messages
        const values = items.map((item) => ({
            sessionId: this.sessionId,
            messageData: JSON.stringify(item),
        }));

        await db.insert(messages).values(values);

        // Update session timestamp (MySQL handles this automatically with ON UPDATE CURRENT_TIMESTAMP)
        // But we'll trigger it explicitly for consistency
        await db
            .update(sessions)
            .set({ updatedAt: new Date() })
            .where(eq(sessions.sessionId, this.sessionId));
    }

    async popItem(): Promise<AgentInputItem | undefined> {
        try {
            if (this.executor.type === 'sqlite') {
                return this.popSqliteItem();
            }
            if (this.executor.type === 'postgres') {
                return this.popPgItem();
            }
            return this.popMysqlItem();
        } catch (error) {
            throw new Error(
                `Failed to pop item: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    private popSqliteItem(): AgentInputItem | undefined {
        const { db, messages } = this.executor as SqliteExecutor;

        // Get the most recent item by timestamp and id
        const rows = db
            .select({ id: messages.id, messageData: messages.messageData })
            .from(messages)
            .where(eq(messages.sessionId, this.sessionId))
            .orderBy(desc(messages.createdAt), desc(messages.id))
            .limit(1)
            .all();

        if (rows.length === 0) return undefined;

        const { id, messageData } = rows[0];
        db.delete(messages).where(eq(messages.id, id)).run();

        try {
            return JSON.parse(messageData) as AgentInputItem;
        } catch (error) {
            console.error('Failed to parse popped item:', error);
            return undefined;
        }
    }

    private async popPgItem(): Promise<AgentInputItem | undefined> {
        const { db, messages } = this.executor as PgExecutor;

        // Get ID of most recent message
        const rows = await db
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.sessionId, this.sessionId))
            .orderBy(desc(messages.createdAt), desc(messages.id))
            .limit(1);

        if (rows.length === 0) return undefined;

        const { id } = rows[0];

        // Delete and return using RETURNING
        const deleted = await db
            .delete(messages)
            .where(eq(messages.id, id))
            .returning({ messageData: messages.messageData });

        if (deleted.length === 0) return undefined;

        try {
            return JSON.parse(deleted[0].messageData) as AgentInputItem;
        } catch (error) {
            console.error('Failed to parse popped item:', error);
            return undefined;
        }
    }

    private async popMysqlItem(): Promise<AgentInputItem | undefined> {
        const { db, messages } = this.executor as MysqlExecutor;

        // MySQL doesn't support RETURNING, so we use SELECT then DELETE
        const rows = await db
            .select({ id: messages.id, messageData: messages.messageData })
            .from(messages)
            .where(eq(messages.sessionId, this.sessionId))
            .orderBy(desc(messages.createdAt), desc(messages.id))
            .limit(1);

        if (rows.length === 0) return undefined;

        const { id, messageData } = rows[0];
        await db.delete(messages).where(eq(messages.id, id));

        try {
            return JSON.parse(messageData) as AgentInputItem;
        } catch (error) {
            console.error('Failed to parse popped item:', error);
            return undefined;
        }
    }

    async clearSession(): Promise<void> {
        try {
            if (this.executor.type === 'sqlite') {
                const { db, sessions } = this.executor as SqliteExecutor;
                // Delete from sessions table - CASCADE will delete messages
                db.delete(sessions).where(eq(sessions.sessionId, this.sessionId)).run();
                return;
            }

            if (this.executor.type === 'postgres') {
                const { db, sessions } = this.executor as PgExecutor;
                // Delete from sessions table - CASCADE will delete messages
                await db.delete(sessions).where(eq(sessions.sessionId, this.sessionId));
                return;
            }

            const { db, sessions } = this.executor as MysqlExecutor;
            // Delete from sessions table - CASCADE will delete messages
            await db.delete(sessions).where(eq(sessions.sessionId, this.sessionId));
        } catch (error) {
            throw new Error(
                `Failed to clear session: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    /**
     * Close the database connection and release resources.
     */
    async close(): Promise<void> {
        // Unregister from cleanup registry if it exists
        if (this.cleanupRegistry) {
            this.cleanupRegistry.unregister(this);
        }
        await this.cleanup();
    }
}

function parseUrl(url: string): { protocol: string; path: string } {
    if (url.startsWith('sqlite:')) {
        const path = url.slice(7) || ':memory:';
        return { protocol: 'sqlite', path };
    }
    if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        return { protocol: 'postgres', path: url };
    }
    if (url.startsWith('mysql://')) {
        return { protocol: 'mysql', path: url };
    }
    throw new Error(`Unsupported database URL: ${url}. Use sqlite:, postgres://, or mysql://`);
}
