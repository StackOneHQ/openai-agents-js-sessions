import type { AgentInputItem } from '@openai/agents';

/**
 * Protocol for session implementations.
 *
 * Session stores conversation history for a specific session, allowing agents
 * to maintain context without requiring explicit manual memory management.
 */
export interface Session {
    /**
     * The unique identifier for this session.
     */
    readonly sessionId: string;

    /**
     * Retrieve the conversation history for this session.
     *
     * @param limit - Maximum number of items to retrieve. If undefined, retrieves all items.
     *                When specified, returns the latest N items in chronological order.
     * @returns List of input items representing the conversation history
     */
    getItems(limit?: number): Promise<AgentInputItem[]>;

    /**
     * Add new items to the conversation history.
     *
     * @param items - List of input items to add to the history
     */
    addItems(items: AgentInputItem[]): Promise<void>;

    /**
     * Remove and return the most recent item from the session.
     *
     * @returns The most recent item if it exists, undefined if the session is empty
     */
    popItem(): Promise<AgentInputItem | undefined>;

    /**
     * Clear all items for this session.
     */
    clearSession(): Promise<void>;
}

/**
 * Abstract base class for session implementations.
 * Provides common functionality and interface for session storage.
 */
export abstract class SessionBase implements Session {
    constructor(public readonly sessionId: string) {}

    abstract getItems(limit?: number): Promise<AgentInputItem[]>;
    abstract addItems(items: AgentInputItem[]): Promise<void>;
    abstract popItem(): Promise<AgentInputItem | undefined>;
    abstract clearSession(): Promise<void>;
}
