/**
 * Session memory module for managing conversation history across multiple agent runs.
 *
 * This module provides built-in session memory to automatically maintain conversation
 * history, eliminating the need to manually handle conversation state between turns.
 *
 * ## Available Session Implementations
 *
 * ### InMemorySession
 * In-memory storage (data lost when process ends). Ideal for development and testing.
 *
 * @example
 * ```typescript
 * import { InMemorySession } from './memory';
 *
 * const session = new InMemorySession('user_123');
 * ```
 *
 * ### SQLiteSession
 * SQLite-backed storage for persistent conversation history.
 *
 * @example
 * ```typescript
 * import { SQLiteSession } from './memory';
 *
 * // In-memory database
 * const session = new SQLiteSession('user_123');
 *
 * // Persistent file-based database
 * const session = new SQLiteSession('user_123', 'conversations.db');
 * ```
 *
 * ### SequelizeSession
 * Sequelize-powered storage supporting PostgreSQL, MySQL, SQLite, and more.
 * This is the JavaScript/TypeScript equivalent of Python's SQLAlchemySession.
 *
 * @example
 * ```typescript
 * import { SequelizeSession } from './memory';
 *
 * // From URL (PostgreSQL)
 * const session = await SequelizeSession.fromUrl(
 *   'user_123',
 *   'postgres://user:pass@localhost:5432/mydb',
 *   { createTables: true }
 * );
 *
 * // From existing Sequelize instance
 * const sequelize = new Sequelize('sqlite::memory:');
 * const session = await SequelizeSession.fromSequelize(
 *   'user_123',
 *   sequelize,
 *   { createTables: true }
 * );
 * ```
 *
 * @module memory
 */

export { InMemorySession } from './in-memory-session';
export { SequelizeSession } from './sequelize-session';
export { Session, SessionBase } from './session';
export { SQLiteSession } from './sqlite-session';
