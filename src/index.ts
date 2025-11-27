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
 * import { InMemorySession } from '@stackone/openai-agents-js-sessions';
 *
 * const session = new InMemorySession('user_123');
 * ```
 *
 * ### DrizzleSession
 * Database-backed storage using Drizzle ORM. Supports SQLite, PostgreSQL, and MySQL.
 *
 * @example
 * ```typescript
 * import { DrizzleSession } from '@stackone/openai-agents-js-sessions';
 *
 * // SQLite
 * const session = await DrizzleSession.fromUrl('user_123', 'sqlite:./data.db');
 *
 * // PostgreSQL
 * const session = await DrizzleSession.fromUrl('user_123', 'postgres://localhost/db');
 *
 * // MySQL
 * const session = await DrizzleSession.fromUrl('user_123', 'mysql://localhost/db');
 * ```
 *
 * @module memory
 */

export { DrizzleSession } from './drizzle-session';
export { InMemorySession } from './in-memory-session';
export { Session, SessionBase } from './session';
