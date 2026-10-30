# @stackone/openai-agents-js-sessions

In-memory and SQLite, PostgreSQL, and MySQL with Drizzle ORM sessions for maintaining conversation history with [OpenAI Agents JS SDK](https://openai.github.io/openai-agents-js/).
This package is based on the [OpenAI Agents Python SDK Sessions](https://openai.github.io/openai-agents-python/sessions/).

## Features

- 🔄 Automatic conversation history management
- 💾 Multiple storage backends (In-Memory, Drizzle ORM)
- 🔌 Easy integration with OpenAI Agents
- 🎯 TypeScript support with full type definitions
- 📦 Zero configuration required
- 🗄️ Schema matches Python SDK (agent_sessions + agent_messages tables)
- 🔒 SSL/TLS support for secure PostgreSQL connections (AWS RDS, Azure, etc.)

## Installation

```bash
npm install @stackone/openai-agents-js-sessions
```

For database support, install the appropriate driver:

```bash
# SQLite
npm install drizzle-orm better-sqlite3

# PostgreSQL
npm install drizzle-orm pg

# MySQL
npm install drizzle-orm mysql2
```

## Quick Start

### InMemorySession

In-memory storage (data lost when process ends). Ideal for development and testing.

```typescript
import { InMemorySession } from '@stackone/openai-agents-js-sessions';

const session = new InMemorySession('chat_123');
```

### DrizzleSession

Drizzle ORM-powered storage supporting SQLite, PostgreSQL, and MySQL.
Matches the Python SDK's SQLAlchemySession implementation with two tables:
- `agent_sessions` - Tracks session metadata (created_at, updated_at)
- `agent_messages` - Stores conversation messages with timestamps

```typescript
import { DrizzleSession } from '@stackone/openai-agents-js-sessions';

// SQLite
const session = await DrizzleSession.fromUrl('chat_123', 'sqlite:./sessions.db');

// PostgreSQL
const session = await DrizzleSession.fromUrl('chat_123', 'postgres://user:pass@localhost:5432/mydb');

// MySQL
const session = await DrizzleSession.fromUrl('chat_123', 'mysql://user:pass@localhost:3306/mydb');

// With custom configuration
const session = await DrizzleSession.fromUrl('chat_123', 'postgres://localhost/db', {
    createTables: true,         // Auto-create tables (default: true)
    maxRetries: 6,              // Maximum connection retry attempts (default: 3)
    retryDelay: 2000,           // Delay between retries in ms (default: 1000)
    connectionTimeout: 20000,   // Connection timeout in ms (default: 10000)
});
```

### SSL/TLS Configuration (PostgreSQL)

For secure PostgreSQL connections (e.g., AWS RDS, Azure Database for PostgreSQL), you can configure SSL/TLS:

```typescript
import { DrizzleSession } from '@stackone/openai-agents-js-sessions';
import fs from 'node:fs';

// Basic SSL (encrypted connection, no certificate verification)
const session = await DrizzleSession.fromUrl(
    'chat_123',
    'postgres://user:pass@host:5432/db',
    {
        ssl: true
    }
);

// SSL with certificate verification (recommended for production)
const session = await DrizzleSession.fromUrl(
    'chat_123',
    'postgres://user:pass@rds-endpoint.amazonaws.com:5432/mydb',
    {
        ssl: {
            rejectUnauthorized: true,
            ca: fs.readFileSync('./rds-ca.pem', 'utf8'),
        }
    }
);

// SSL with client certificates (mutual TLS)
const session = await DrizzleSession.fromUrl(
    'chat_123',
    'postgres://user:pass@host:5432/db',
    {
        ssl: {
            rejectUnauthorized: true,
            ca: fs.readFileSync('./ca-cert.pem', 'utf8'),
            cert: fs.readFileSync('./client-cert.pem', 'utf8'),
            key: fs.readFileSync('./client-key.pem', 'utf8'),
        }
    }
);
```

#### AWS RDS Example

For AWS RDS PostgreSQL, download the certificate bundle from [AWS Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html):

```typescript
import { DrizzleSession } from '@stackone/openai-agents-js-sessions';
import fs from 'node:fs';

const session = await DrizzleSession.fromUrl(
    'chat_123',
    `postgres://${username}:${password}@${rdsEndpoint}:5432/${database}`,
    {
        ssl: {
            rejectUnauthorized: true,
            ca: fs.readFileSync('./rds-ca-2019-root.pem', 'utf8'),
        }
    }
);
```

**SSL Configuration Options:**
- `ssl: true` - Enable SSL without certificate verification (encrypted but less secure)
- `ssl: { ... }` - Configure SSL with certificate verification:
  - `rejectUnauthorized` - Verify server certificate (default: true, recommended)
  - `ca` - Certificate Authority certificate(s)
  - `cert` - Client certificate for mutual TLS (optional)
  - `key` - Client private key for mutual TLS (optional)

## Usage with OpenAI Agents JS SDK

```typescript
import { Agent, run, user, type AgentInputItem } from '@openai/agents';
import { InMemorySession } from '@stackone/openai-agents-js-sessions';

// Create your agent
const agent = new Agent({
  name: 'Customer Support',
  instructions: 'You are a helpful customer support assistant.',
  model: 'gpt-5.1',
});

// Create a session
const sessionId = 'chat_123';
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

### DrizzleSession

#### `static fromUrl(sessionId: string, url: string, config?: ConnectionConfig): Promise<DrizzleSession>`

Create a new database-backed session.

- `sessionId` - Unique identifier for this session
- `url` - Database connection URL:
  - SQLite: `sqlite::memory:` or `sqlite:./path/to/db.sqlite`
  - PostgreSQL: `postgres://user:pass@host:port/database`
  - MySQL: `mysql://user:pass@host:port/database`
- `config` - Optional connection configuration:
  - `createTables` - Auto-create tables if they don't exist (default: true)
  - `maxRetries` - Maximum connection retry attempts (default: 3)
  - `retryDelay` - Delay between retries in milliseconds (default: 1000)
  - `connectionTimeout` - Connection timeout in milliseconds (default: 10000)
  - `ssl` - PostgreSQL SSL configuration (boolean or object):
    - `true` - Enable SSL without certificate verification
    - Object with `rejectUnauthorized`, `ca`, `cert`, `key` - Configure SSL with certificate verification

#### `close(): Promise<void>`
Close the database connection and release resources (this is handled automatically).

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
