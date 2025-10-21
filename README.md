# @stackone/openai-agents-js-sessions

Session memory module for managing conversation history across multiple OpenAI agent runs.

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

