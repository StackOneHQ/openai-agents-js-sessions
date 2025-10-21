import type { AgentInputItem } from '@openai/agents';
import { SessionBase } from './session';

/**
 * In-memory implementation of session storage.
 *
 * This implementation stores conversation history in memory. The history is lost
 * when the process ends. Useful for development, testing, or temporary conversations.
 *
 * For production use with persistent storage, consider using FileSession or
 * implementing a database-backed session.
 *
 * @example
 * ```typescript
 * const session = new InMemorySession('user_123');
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
export class InMemorySession extends SessionBase {
    private items: AgentInputItem[] = [];

    /**
     * Retrieve the conversation history for this session.
     *
     * @param limit - Maximum number of items to retrieve. If undefined, retrieves all items.
     *                When specified, returns the latest N items in chronological order.
     * @returns List of input items representing the conversation history
     */
    async getItems(limit?: number): Promise<AgentInputItem[]> {
        if (limit === undefined) {
            return [...this.items];
        }

        // Return the latest N items
        const startIndex = Math.max(0, this.items.length - limit);
        return this.items.slice(startIndex);
    }

    /**
     * Add new items to the conversation history.
     *
     * @param items - List of input items to add to the history
     */
    async addItems(items: AgentInputItem[]): Promise<void> {
        this.items.push(...items);
    }

    /**
     * Remove and return the most recent item from the session.
     *
     * @returns The most recent item if it exists, undefined if the session is empty
     */
    async popItem(): Promise<AgentInputItem | undefined> {
        return this.items.pop();
    }

    /**
     * Clear all items for this session.
     */
    async clearSession(): Promise<void> {
        this.items = [];
    }

    /**
     * Get the current number of items in the session.
     * Useful for testing and debugging.
     *
     * @returns Number of items in the session
     */
    get length(): number {
        return this.items.length;
    }
}
