# @stackone/openai-agents-js-sessions

In-memory, SQLite, and Sequelize sessions for maintaining conversation history with [OpenAI Agents JS SDK](https://openai.github.io/openai-agents-js/).
This package is based on the [OpenAI Agents Python SDK Sessions](https://openai.github.io/openai-agents-python/sessions/).

## Features

- 🔄 Automatic conversation history management
- 💾 Multiple storage backends (In-Memory, SQLite, Sequelize)
- 🔌 Easy integration with OpenAI Agents
- 🎯 TypeScript support with full type definitions
- 📦 Zero configuration required for basic usage

## Installation

```bash
npm install @stackone/openai-agents-js-sessions
```

## Quick Start

### InMemorySession

In-memory storage (data lost when process ends). Ideal for development and testing.

```typescript
import { InMemorySession } from '@stackone/openai-agents-js-sessions';

const session = new InMemorySession('user_123');
```

### SQLiteSession

SQLite-backed storage for persistent conversation history.

```typescript
import { SQLiteSession } from '@stackone/openai-agents-js-sessions';

// In-memory database
const session = new SQLiteSession('user_123');

// Persistent file-based database
const session = new SQLiteSession('user_123', 'conversations.db');
```

### SequelizeSession

Sequelize-powered storage supporting PostgreSQL, MySQL, SQLite, and more.

```typescript
import { SequelizeSession } from '@stackone/openai-agents-js-sessions';

// From URL (PostgreSQL)
const session = await SequelizeSession.fromUrl(
  'user_123',
  'postgres://user:pass@localhost:5432/mydb',
  { createTables: true }
);

// From existing Sequelize instance
const sequelize = new Sequelize('sqlite::memory:');
const session = await SequelizeSession.fromSequelize(
  'user_123',
  sequelize,
  { createTables: true }
);
```

## Usage with OpenAI Agents JS SDK

```typescript
import { Agent, run, user, type AgentInputItem } from '@openai/agents';
import { InMemorySession } from '@stackone/openai-agents-js-sessions';

// Create your agent
const agent = new Agent({
  name: 'Customer Support',
  instructions: 'You are a helpful customer support assistant.',
  model: 'gpt-4.1',
});

// Create a session
const sessionId = 'abc_123';
const session = new InMemorySession(sessionId);

// First conversation turn
async function handleUserMessage(userMessage: string) {
  // Load existing conversation history
  const history = await session.getItems();
  
  // Add the new user message
  const newUserMessage = user(userMessage);
  const input: AgentInputItem[] = [...history, newUserMessage];
  
  // Run the agent with full conversation context
  const result = await run(agent, input);
  await result.completed;
  
  // Save the conversation (user message + agent response) to session
  const newItems = result.history.slice(history.length);
  await session.addItems([newUserMessage, ...newItems]);
  
  return result;
}

// Example conversation
await handleUserMessage('Hi, I need help with my order');
await handleUserMessage('It was order #12345'); // Agent remembers previous context
await handleUserMessage('Can you check the status?'); // Agent still has full context
```

## API Reference

### Session Interface

All session implementations provide the following methods:

#### `getItems(limit?: number): Promise<AgentInputItem[]>`
Retrieve the conversation history for this session.

- `limit` - Maximum number of items to retrieve. If undefined, retrieves all items.

#### `addItems(items: AgentInputItem[]): Promise<void>`
Add new items to the conversation history.

#### `popItem(): Promise<AgentInputItem | undefined>`
Remove and return the most recent item from the session.

#### `clearSession(): Promise<void>`
Clear all items for this session.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Fix linting issues
npm run lint:fix
```

## Contributing

Contributions are welcome! Please follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages.

## License

MIT © StackOne
