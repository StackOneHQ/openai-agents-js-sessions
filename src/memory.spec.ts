import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import type { AgentInputItem } from '@openai/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemorySession, SQLiteSession, SequelizeSession } from './index';

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

describe('SQLiteSession', () => {
    const testDbPath = './test_sessions.db';
    let session: SQLiteSession;

    afterEach(() => {
        if (session) {
            session.close();
        }
        // Clean up test database
        if (existsSync(testDbPath)) {
            unlink(testDbPath).catch(() => {
                // Ignore cleanup errors
            });
        }
    });

    it('should create in-memory database', async () => {
        session = new SQLiteSession('test_session');
        const items = await session.getItems();
        expect(items).toHaveLength(0);
    });

    it('should create persistent database', async () => {
        session = new SQLiteSession('test_session', testDbPath);
        await session.addItems([user('Hello')]);

        const items = await session.getItems();
        expect(items).toHaveLength(1);
    });

    it('should add items', async () => {
        session = new SQLiteSession('test_session');
        await session.addItems([user('Hello'), assistant('Hi')]);

        const items = await session.getItems();
        expect(items).toHaveLength(2);
    });

    it('should retrieve items with limit', async () => {
        session = new SQLiteSession('test_session');
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
        session = new SQLiteSession('test_session');
        await session.addItems([user('Hello'), assistant('Hi')]);

        const popped = await session.popItem();
        expect(popped).toEqual(assistant('Hi'));

        const remaining = await session.getItems();
        expect(remaining).toHaveLength(1);
    });

    it('should clear session', async () => {
        session = new SQLiteSession('test_session');
        await session.addItems([user('Hello'), assistant('Hi')]);
        await session.clearSession();

        const items = await session.getItems();
        expect(items).toHaveLength(0);
    });

    it('should support multiple sessions in same database', async () => {
        const session1 = new SQLiteSession('session_1', testDbPath);
        const session2 = new SQLiteSession('session_2', testDbPath);

        await session1.addItems([user('Hello from session 1')]);
        await session2.addItems([user('Hello from session 2')]);

        const items1 = await session1.getItems();
        const items2 = await session2.getItems();

        expect(items1).toHaveLength(1);
        expect(items2).toHaveLength(1);
        expect(items1[0]).toEqual(user('Hello from session 1'));
        expect(items2[0]).toEqual(user('Hello from session 2'));

        session1.close();
        session2.close();
    });

    it('should get length', async () => {
        session = new SQLiteSession('test_session');
        await session.addItems([user('Hello'), assistant('Hi')]);

        const length = await session.getLength();
        expect(length).toBe(2);
    });
});

describe('SequelizeSession', () => {
    let session: SequelizeSession;
    const sessionsToClose: SequelizeSession[] = [];

    afterEach(async () => {
        // Close any sessions that were added to the cleanup list
        for (const s of sessionsToClose) {
            try {
                await s.close();
            } catch {
                // Ignore errors during cleanup
            }
        }
        sessionsToClose.length = 0;

        // Close the main session if it exists
        if (session) {
            try {
                await session.close();
            } catch {
                // Ignore errors during cleanup
            }
        }
    });

    it('should create from URL with in-memory SQLite', async () => {
        session = await SequelizeSession.fromUrl('test_session', 'sqlite::memory:', {
            createTables: true,
        });

        const items = await session.getItems();
        expect(items).toHaveLength(0);
    });

    it('should add items', async () => {
        session = await SequelizeSession.fromUrl('test_session', 'sqlite::memory:', {
            createTables: true,
        });

        await session.addItems([user('Hello'), assistant('Hi')]);

        const items = await session.getItems();
        expect(items).toHaveLength(2);
    });

    it('should retrieve items with limit', async () => {
        session = await SequelizeSession.fromUrl('test_session', 'sqlite::memory:', {
            createTables: true,
        });

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
        session = await SequelizeSession.fromUrl('test_session', 'sqlite::memory:', {
            createTables: true,
        });

        await session.addItems([user('Hello'), assistant('Hi')]);

        const popped = await session.popItem();
        expect(popped).toEqual(assistant('Hi'));

        const remaining = await session.getItems();
        expect(remaining).toHaveLength(1);
    });

    it('should clear session', async () => {
        session = await SequelizeSession.fromUrl('test_session', 'sqlite::memory:', {
            createTables: true,
        });

        await session.addItems([user('Hello'), assistant('Hi')]);
        await session.clearSession();

        const items = await session.getItems();
        expect(items).toHaveLength(0);
    });

    it('should get length', async () => {
        session = await SequelizeSession.fromUrl('test_session', 'sqlite::memory:', {
            createTables: true,
        });

        await session.addItems([user('Hello'), assistant('Hi')]);

        const length = await session.getLength();
        expect(length).toBe(2);
    });

    it('should support multiple sessions', async () => {
        const session1 = await SequelizeSession.fromUrl('session_1', 'sqlite::memory:', {
            createTables: true,
        });
        sessionsToClose.push(session1);

        const session2 = await SequelizeSession.fromSequelize(
            'session_2',
            session1.getSequelize(),
            { createTables: false }, // Tables already created
        );
        // Don't add session2 to cleanup - it doesn't own the Sequelize instance

        await session1.addItems([user('Hello from session 1')]);
        await session2.addItems([user('Hello from session 2')]);

        const items1 = await session1.getItems();
        const items2 = await session2.getItems();

        expect(items1).toHaveLength(1);
        expect(items2).toHaveLength(1);
        expect(items1[0]).toEqual(user('Hello from session 1'));
        expect(items2[0]).toEqual(user('Hello from session 2'));
    });
});
