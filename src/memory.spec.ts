import type { AgentInputItem } from '@openai/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleSession, InMemorySession } from './index';

// Helper functions to create test messages
const user = (content: string): AgentInputItem => ({
    role: 'user',
    content: [{ type: 'input_text', text: content }],
});

const assistant = (content: string): AgentInputItem => ({
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text: content }],
});

describe('InMemorySession', () => {
    let session: InMemorySession;

    beforeEach(() => {
        session = new InMemorySession('test_session');
    });

    it('should start with empty items', async () => {
        const items = await session.getItems();
        expect(items).toHaveLength(0);
    });

    it('should add items', async () => {
        await session.addItems([user('Hello'), assistant('Hi')]);
        const items = await session.getItems();
        expect(items).toHaveLength(2);
    });

    it('should retrieve items with limit', async () => {
        await session.addItems([
            user('Message 1'),
            assistant('Response 1'),
            user('Message 2'),
            assistant('Response 2'),
        ]);

        const recentItems = await session.getItems(2);
        expect(recentItems).toHaveLength(2);
        expect(recentItems[0]).toEqual(user('Message 2'));
    });

    it('should pop items', async () => {
        await session.addItems([user('Hello'), assistant('Hi')]);

        const popped = await session.popItem();
        expect(popped).toEqual(assistant('Hi'));

        const remaining = await session.getItems();
        expect(remaining).toHaveLength(1);
    });

    it('should clear session', async () => {
        await session.addItems([user('Hello'), assistant('Hi')]);
        await session.clearSession();

        const items = await session.getItems();
        expect(items).toHaveLength(0);
    });

    it('should have length property', () => {
        expect(session.length).toBe(0);
    });
});

describe('DrizzleSession - SQLite', () => {
    let session: DrizzleSession;
    const sessionsToClose: DrizzleSession[] = [];

    afterEach(async () => {
        for (const s of sessionsToClose) {
            await s.close().catch(() => {});
        }
        sessionsToClose.length = 0;

        if (session) {
            await session.close().catch(() => {});
        }
    });

    it('should create from URL with in-memory SQLite', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        const items = await session.getItems();
        expect(items).toHaveLength(0);
    });

    it('should add items', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.addItems([user('Hello'), assistant('Hi')]);

        const items = await session.getItems();
        expect(items).toHaveLength(2);
    });

    it('should retrieve items with limit', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.addItems([
            user('Message 1'),
            assistant('Response 1'),
            user('Message 2'),
            assistant('Response 2'),
        ]);

        const recentItems = await session.getItems(2);
        expect(recentItems).toHaveLength(2);
        expect(recentItems[0]).toEqual(user('Message 2'));
    });

    it('should pop items', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.addItems([user('Hello'), assistant('Hi')]);

        const popped = await session.popItem();
        expect(popped).toEqual(assistant('Hi'));

        const remaining = await session.getItems();
        expect(remaining).toHaveLength(1);
    });

    it('should clear session', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.addItems([user('Hello'), assistant('Hi')]);
        await session.clearSession();

        const items = await session.getItems();
        expect(items).toHaveLength(0);
    });

    it('should return undefined when popping from empty session', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        const popped = await session.popItem();
        expect(popped).toBeUndefined();
    });

    it('should handle empty addItems', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.addItems([]);
        const items = await session.getItems();
        expect(items).toHaveLength(0);
    });

    it('should throw on unsupported database URL', async () => {
        await expect(DrizzleSession.fromUrl('test', 'mongodb://localhost')).rejects.toThrow(
            'Unsupported database',
        );
    });

    it('should handle multiple sessions in same database', async () => {
        const session1 = await DrizzleSession.fromUrl('session_1', 'sqlite::memory:');
        const session2 = await DrizzleSession.fromUrl('session_2', 'sqlite::memory:');
        sessionsToClose.push(session1, session2);

        await session1.addItems([user('Session 1 message')]);
        await session2.addItems([user('Session 2 message')]);

        const items1 = await session1.getItems();
        const items2 = await session2.getItems();

        expect(items1).toHaveLength(1);
        expect(items2).toHaveLength(1);
        expect(items1[0]).toEqual(user('Session 1 message'));
        expect(items2[0]).toEqual(user('Session 2 message'));
    });

    it('should handle large number of items with limit', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        const items = Array.from({ length: 100 }, (_, i) => user(`Message ${i}`));
        await session.addItems(items);

        const recentItems = await session.getItems(10);
        expect(recentItems).toHaveLength(10);
        expect(recentItems[0]).toEqual(user('Message 90'));
        expect(recentItems[9]).toEqual(user('Message 99'));
    });

    it('should maintain chronological order', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.addItems([user('First'), user('Second'), user('Third')]);

        const items = await session.getItems();
        expect(items[0]).toEqual(user('First'));
        expect(items[1]).toEqual(user('Second'));
        expect(items[2]).toEqual(user('Third'));
    });

    it('should handle pop with race condition protection', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.addItems([user('Message 1'), user('Message 2')]);

        const popped1 = await session.popItem();
        const popped2 = await session.popItem();

        expect(popped1).toEqual(user('Message 2'));
        expect(popped2).toEqual(user('Message 1'));

        const remaining = await session.getItems();
        expect(remaining).toHaveLength(0);
    });

    it('should handle limit greater than total items', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.addItems([user('Message 1'), user('Message 2')]);

        const items = await session.getItems(10);
        expect(items).toHaveLength(2);
    });

    it('should handle limit of 0', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.addItems([user('Message 1'), user('Message 2')]);

        const items = await session.getItems(0);
        expect(items).toHaveLength(0);
    });

    it('should create session with custom config', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:', {
            maxRetries: 5,
            retryDelay: 500,
            connectionTimeout: 5000,
        });

        await session.addItems([user('Hello')]);
        const items = await session.getItems();
        expect(items).toHaveLength(1);
    });

    it('should support createTables option', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:', {
            createTables: false,
        });

        // Should fail because tables don't exist
        await expect(session.addItems([user('Hello')])).rejects.toThrow();
    });
});

describe('DrizzleSession - Error Handling', () => {
    let session: DrizzleSession;

    afterEach(async () => {
        if (session) {
            await session.close().catch(() => {});
        }
    });

    it('should handle invalid SQLite path gracefully', async () => {
        await expect(
            DrizzleSession.fromUrl('test', 'sqlite:/invalid/path/that/does/not/exist.db'),
        ).rejects.toThrow('Failed to create SQLite session');
    });

    it('should throw error with descriptive message on invalid URL', async () => {
        await expect(DrizzleSession.fromUrl('test', 'invalid://url')).rejects.toThrow(
            'Unsupported database URL',
        );
    });

    it('should handle close after close', async () => {
        session = await DrizzleSession.fromUrl('test_session', 'sqlite::memory:');
        await session.close();
        await expect(session.close()).resolves.toBeUndefined();
    });
});
