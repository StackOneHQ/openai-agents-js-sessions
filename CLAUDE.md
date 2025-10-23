# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript library that provides session memory implementations for maintaining conversation history with the OpenAI Agents JS SDK. It's a JavaScript/TypeScript port of the Python SDK's session functionality and offers three storage backends: InMemory, SQLite, and Sequelize (supporting PostgreSQL, MySQL, etc.).

## Development Commands

### Building
```bash
npm run build              # Production build (no sourcemaps)
npm run build:dev          # Development build (with sourcemaps)
```

Both commands clean the `dist/` directory first via `prebuild`/`prebuild:dev` hooks.

### Testing
```bash
npm test                   # Run tests once (silent mode)
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Generate coverage report (text + lcov)
```

Tests are located in `*.spec.ts` files and use Vitest with SWC for transpilation.

### Linting & Formatting
```bash
npm run lint               # Check code with Biome (alias for code:check)
npm run lint:fix           # Auto-fix issues (alias for code:check:fix)
npm run code:format        # Check formatting only
npm run code:format:fix    # Auto-fix formatting
npm run code:lint          # Check linting only (with --error-on-warnings)
npm run code:lint:fix      # Auto-fix linting issues
```

This project uses Biome (not ESLint/Prettier). Key Biome settings:
- 4-space indentation
- 100 character line width
- Single quotes
- Trailing commas
- No bracket spacing in objects

### Commit Standards
Commits must follow Conventional Commits (Angular style) enforced via Husky + commitlint:
- Types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`
- Format: `type(scope?): description`

## Architecture

### Core Design Pattern

All session implementations extend `SessionBase` abstract class and implement the `Session` interface (src/session.ts), which defines:
- `getItems(limit?)`: Retrieve conversation history (latest N items if limit specified)
- `addItems(items)`: Append new items to history
- `popItem()`: Remove and return most recent item
- `clearSession()`: Delete all items for this session

### Storage Implementations

**InMemorySession** (src/in-memory-session.ts)
- Simple array-based storage
- No persistence (data lost on process end)
- Includes `length` getter for debugging

**SQLiteSession** (src/sqlite-session.ts)
- Uses `better-sqlite3` for synchronous operations
- Supports in-memory (`:memory:`) or file-based storage
- Schema: `session_items` table with indexed `session_id` and `created_at`
- Stores items as JSON in `item_data` TEXT column
- Includes `close()` method and async `getLength()`

**SequelizeSession** (src/sequelize-session.ts)
- ORM-based implementation for PostgreSQL, MySQL, SQLite, etc.
- Factory methods: `fromUrl()` and `fromSequelize()`
- Manages Sequelize instance ownership (`ownSequelize` flag determines if `close()` closes connection)
- Model: `SessionItemModel` with `sessionId`, `itemData`, `createdAt`
- Includes `getSequelize()` for advanced use cases

### Key Implementation Details

1. **Item Ordering**: All implementations maintain chronological order by insertion time (auto-increment ID or timestamp).

2. **Limit Behavior**: When `getItems(limit)` is called, implementations retrieve the *latest* N items but return them in *chronological* order (oldest to newest within the subset).

3. **JSON Serialization**: `AgentInputItem` objects are stored as JSON strings in database implementations.

4. **Session Isolation**: All operations are scoped to `sessionId` - multiple sessions can coexist in the same database.

## Build Configuration

- **Rollup**: Builds both CommonJS (`dist/index.js`) and ESM (`dist/index.es.mjs`) outputs
- **TypeScript**: Declarations emitted to `dist/types/` (ES2020 module system, ES2021 target)
- **External Dependencies**: `@openai/agents`, `sequelize`, `better-sqlite3` (not bundled)
- Excludes `*.spec.ts` from build

## Testing Setup

- **Test Framework**: Vitest with globals enabled
- **Transpiler**: unplugin-swc for fast TypeScript compilation
- **Coverage**: V8 provider, outputs to `./coverage/`
- **Timezone**: Tests run in UTC (`process.env.TZ = 'UTC'`)
- Test files match pattern `**/*.spec.ts`

## Peer Dependencies

The package has `@openai/agents` as a required peer dependency. `better-sqlite3` and `sequelize` are marked as optional peer dependencies since users only need the one matching their chosen session implementation.

## Publishing

- Package is scoped: `@stackone/openai-agents-js-sessions`
- Publish via: `npm run publish-release` (uses `--access=public`)
- Version management uses release-please (see `.github/workflows/release-please.yml`)
