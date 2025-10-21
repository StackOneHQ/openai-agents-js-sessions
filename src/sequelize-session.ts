import type { AgentInputItem } from '@openai/agents';
import { DataTypes, Model, type ModelStatic, Sequelize } from 'sequelize';
import { SessionBase } from './session';

/**
 * Session item model for Sequelize.
 */
interface SessionItemAttributes {
    id?: number;
    sessionId: string;
    itemData: string;
    createdAt?: Date;
}

class SessionItemModel extends Model<SessionItemAttributes> implements SessionItemAttributes {
    declare id: number;
    declare sessionId: string;
    declare itemData: string;
    declare createdAt: Date;
}

/**
 * Sequelize-powered session storage implementation.
 *
 * This is the JavaScript/TypeScript equivalent of Python's SQLAlchemySession.
 * It allows you to use any database supported by Sequelize (PostgreSQL, MySQL,
 * SQLite, MariaDB, SQL Server, etc.) for session storage.
 *
 * @example
 * ```typescript
 * // Example 1: Using from_url with in-memory SQLite
 * const session = await SequelizeSession.fromUrl(
 *   'user-123',
 *   'sqlite::memory:',
 *   { createTables: true }
 * );
 *
 * // Example 2: Using an existing Sequelize instance with PostgreSQL
 * const sequelize = new Sequelize('postgres://user:pass@localhost:5432/mydb');
 * const session = await SequelizeSession.fromSequelize(
 *   'user-456',
 *   sequelize,
 *   { createTables: true }
 * );
 *
 * // Example 3: Using SQLite file
 * const session = await SequelizeSession.fromUrl(
 *   'user-789',
 *   'sqlite:./conversations.db',
 *   { createTables: true }
 * );
 *
 * // Use the session
 * await session.addItems([
 *   user('Hello'),
 *   assistant('Hi there!')
 * ]);
 * ```
 */
export class SequelizeSession extends SessionBase {
    private sequelize: Sequelize;
    private model: ModelStatic<SessionItemModel>;
    private ownSequelize: boolean;
    private tableName: string;

    /**
     * Create a new Sequelize session instance.
     *
     * @param sessionId - Unique identifier for this session
     * @param sequelize - Sequelize instance
     * @param tableName - Name of the table to store session items
     * @param ownSequelize - Whether this session owns the Sequelize instance (for cleanup)
     */
    private constructor(
        sessionId: string,
        sequelize: Sequelize,
        tableName: string = 'session_items',
        ownSequelize: boolean = false,
    ) {
        super(sessionId);
        this.sequelize = sequelize;
        this.tableName = tableName;
        this.ownSequelize = ownSequelize;

        // Define the model
        this.model = sequelize.define<SessionItemModel>(
            'SessionItem',
            {
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                },
                sessionId: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    field: 'session_id',
                },
                itemData: {
                    type: DataTypes.TEXT,
                    allowNull: false,
                    field: 'item_data',
                },
                createdAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                    field: 'created_at',
                },
            },
            {
                tableName: this.tableName,
                timestamps: false,
                indexes: [
                    {
                        fields: ['session_id'],
                    },
                    {
                        fields: ['session_id', 'created_at'],
                    },
                ],
            },
        ) as ModelStatic<SessionItemModel>;
    }

    /**
     * Create a session from a database URL.
     * This is the equivalent of SQLAlchemySession.from_url() in Python.
     *
     * @param sessionId - Unique identifier for this session
     * @param url - Database URL (e.g., 'postgres://user:pass@localhost:5432/mydb', 'sqlite::memory:', 'sqlite:./db.sqlite')
     * @param options - Configuration options
     * @returns Initialized SequelizeSession instance
     *
     * @example
     * ```typescript
     * // PostgreSQL
     * const session = await SequelizeSession.fromUrl(
     *   'user-123',
     *   'postgres://user:pass@localhost:5432/agents',
     *   { createTables: true }
     * );
     *
     * // SQLite in-memory
     * const session = await SequelizeSession.fromUrl(
     *   'user-123',
     *   'sqlite::memory:',
     *   { createTables: true }
     * );
     *
     * // SQLite file
     * const session = await SequelizeSession.fromUrl(
     *   'user-123',
     *   'sqlite:./conversations.db',
     *   { createTables: true }
     * );
     * ```
     */
    static async fromUrl(
        sessionId: string,
        url: string,
        options: {
            createTables?: boolean;
            tableName?: string;
            logging?: boolean | ((sql: string, timing?: number) => void);
        } = {},
    ): Promise<SequelizeSession> {
        const { createTables = false, tableName = 'session_items', logging = false } = options;

        const sequelize = new Sequelize(url, {
            logging,
        });

        const session = new SequelizeSession(sessionId, sequelize, tableName, true);

        if (createTables) {
            await session.model.sync();
        }

        return session;
    }

    /**
     * Create a session from an existing Sequelize instance.
     * Use this when you already have a Sequelize instance in your application.
     *
     * @param sessionId - Unique identifier for this session
     * @param sequelize - Existing Sequelize instance
     * @param options - Configuration options
     * @returns Initialized SequelizeSession instance
     *
     * @example
     * ```typescript
     * // In your application, you have an existing Sequelize instance
     * const sequelize = new Sequelize('postgres://user:pass@localhost:5432/mydb');
     *
     * const session = await SequelizeSession.fromSequelize(
     *   'user-456',
     *   sequelize,
     *   { createTables: true }
     * );
     * ```
     */
    static async fromSequelize(
        sessionId: string,
        sequelize: Sequelize,
        options: {
            createTables?: boolean;
            tableName?: string;
        } = {},
    ): Promise<SequelizeSession> {
        const { createTables = false, tableName = 'session_items' } = options;

        const session = new SequelizeSession(sessionId, sequelize, tableName, false);

        if (createTables) {
            await session.model.sync();
        }

        return session;
    }

    /**
     * Retrieve the conversation history for this session.
     *
     * @param limit - Maximum number of items to retrieve. If undefined, retrieves all items.
     *                When specified, returns the latest N items in chronological order.
     * @returns List of input items representing the conversation history
     */
    async getItems(limit?: number): Promise<AgentInputItem[]> {
        const rows = await this.model.findAll({
            where: { sessionId: this.sessionId },
            order: [['id', 'ASC']],
            limit: limit,
            ...(limit && {
                // When limit is specified, get the last N items but still in chronological order
                offset: Math.max(0, (await this.getLength()) - limit),
            }),
        });

        return rows.map((row) => JSON.parse(row.itemData) as AgentInputItem);
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

        await this.model.bulkCreate(
            items.map((item) => ({
                sessionId: this.sessionId,
                itemData: JSON.stringify(item),
                createdAt: new Date(),
            })),
        );
    }

    /**
     * Remove and return the most recent item from the session.
     *
     * @returns The most recent item if it exists, undefined if the session is empty
     */
    async popItem(): Promise<AgentInputItem | undefined> {
        // Get the most recent item
        const row = await this.model.findOne({
            where: { sessionId: this.sessionId },
            order: [['id', 'DESC']],
        });

        if (!row) {
            return undefined;
        }

        const item = JSON.parse(row.itemData) as AgentInputItem;

        // Delete the item
        await row.destroy();

        return item;
    }

    /**
     * Clear all items for this session.
     */
    async clearSession(): Promise<void> {
        await this.model.destroy({
            where: { sessionId: this.sessionId },
        });
    }

    /**
     * Close the database connection.
     * Call this when you're done with the session to free resources.
     * Only closes if this session owns the Sequelize instance.
     */
    async close(): Promise<void> {
        if (this.ownSequelize) {
            await this.sequelize.close();
        }
    }

    /**
     * Get the current number of items in the session.
     * Useful for testing and debugging.
     *
     * @returns Number of items in the session
     */
    async getLength(): Promise<number> {
        return await this.model.count({
            where: { sessionId: this.sessionId },
        });
    }

    /**
     * Get the underlying Sequelize instance.
     * Useful for advanced use cases.
     *
     * @returns The Sequelize instance
     */
    getSequelize(): Sequelize {
        return this.sequelize;
    }
}
