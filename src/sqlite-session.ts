import type { AgentInputItem } from '@openai/agents';
import Database from 'better-sqlite3';
import { SessionBase } from './session';

/**
 * SQLite-backed session storage implementation.
 *
 * Stores conversation history in a SQLite database. Supports both in-memory
 * databases (for development/testing) and persistent file-based databases
 * (for production).
 *
 * Uses better-sqlite3 for synchronous, high-performance SQLite operations.
 *
 * @example
 * ```typescript
 * // In-memory database (lost when process ends)
 * const session = new SQLiteSession('user_123');
 *
 * // Persistent file-based database
 * const session = new SQLiteSession('user_123', 'conversations.db');
 *
 * // Add items to history
 * await session.addItems([
 *   user('Hello'),
 *   assistant('Hi there!')
 * ]);
 *
 * // Retrieve history
 * const items = await session.getItems();
 * ```
 */
export class SQLiteSession extends SessionBase {
    private db: Database.Database;
    private tableName: string;

    /**
     * Create a new SQLite session instance.
     *
     * @param sessionId - Unique identifier for this session
     * @param dbPath - Path to SQLite database file. Use ':memory:' or omit for in-memory database.
     * @param tableName - Name of the table to store session items (default: 'session_items')
     */
    constructor(
        sessionId: string,
        dbPath: string = ':memory:',
        tableName: string = 'session_items',
    ) {
        super(sessionId);
        this.tableName = tableName;
        this.db = new Database(dbPath);
        this.initializeTable();
    }

    /**
     * Initialize the database table for storing session items.
     */
    private initializeTable(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                item_data TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(session_id, id)
            );
            CREATE INDEX IF NOT EXISTS idx_session_id ON ${this.tableName}(session_id);
            CREATE INDEX IF NOT EXISTS idx_created_at ON ${this.tableName}(session_id, created_at);
        `);
    }

    /**
     * Retrieve the conversation history for this session.
     *
     * @param limit - Maximum number of items to retrieve. If undefined, retrieves all items.
     *                When specified, returns the latest N items in chronological order.
     * @returns List of input items representing the conversation history
     */
    async getItems(limit?: number): Promise<AgentInputItem[]> {
        const query = limit
            ? `
                SELECT item_data FROM (
                    SELECT id, item_data FROM ${this.tableName}
                    WHERE session_id = ?
                    ORDER BY id DESC
                    LIMIT ?
                ) AS recent_items ORDER BY id ASC
              `
            : `
                SELECT item_data FROM ${this.tableName}
                WHERE session_id = ?
                ORDER BY id ASC
              `;

        const params = limit ? [this.sessionId, limit] : [this.sessionId];
        const rows = this.db.prepare(query).all(...params) as Array<{ item_data: string }>;

        return rows.map((row) => JSON.parse(row.item_data) as AgentInputItem);
    }

    /**
     * Add new items to the conversation history.
     *
     * @param items - List of input items to add to the history
     */
    async addItems(items: AgentInputItem[]): Promise<void> {
        if (items.length === 0) {
            return;
        }

        const insert = this.db.prepare(`
            INSERT INTO ${this.tableName} (session_id, item_data, created_at)
            VALUES (?, ?, ?)
        `);

        const insertMany = this.db.transaction((items: AgentInputItem[]) => {
            const now = Date.now();
            for (const item of items) {
                insert.run(this.sessionId, JSON.stringify(item), now);
            }
        });

        insertMany(items);
    }

    /**
     * Remove and return the most recent item from the session.
     *
     * @returns The most recent item if it exists, undefined if the session is empty
     */
    async popItem(): Promise<AgentInputItem | undefined> {
        // Get the most recent item
        const row = this.db
            .prepare(`
            SELECT id, item_data FROM ${this.tableName}
            WHERE session_id = ?
            ORDER BY id DESC
            LIMIT 1
        `)
            .get(this.sessionId) as { id: number; item_data: string } | undefined;

        if (!row) {
            return undefined;
        }

        // Delete the item
        this.db
            .prepare(`
            DELETE FROM ${this.tableName}
            WHERE id = ?
        `)
            .run(row.id);

        return JSON.parse(row.item_data) as AgentInputItem;
    }

    /**
     * Clear all items for this session.
     */
    async clearSession(): Promise<void> {
        this.db
            .prepare(`
            DELETE FROM ${this.tableName}
            WHERE session_id = ?
        `)
            .run(this.sessionId);
    }

    /**
     * Close the database connection.
     * Call this when you're done with the session to free resources.
     */
    close(): void {
        this.db.close();
    }

    /**
     * Get the current number of items in the session.
     * Useful for testing and debugging.
     *
     * @returns Number of items in the session
     */
    async getLength(): Promise<number> {
        const result = this.db
            .prepare(`
            SELECT COUNT(*) as count FROM ${this.tableName}
            WHERE session_id = ?
        `)
            .get(this.sessionId) as { count: number };

        return result.count;
    }
}
