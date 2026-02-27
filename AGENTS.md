- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- The default branch in this repo is `dev`.
- Local `main` ref may not exist; use `dev` or `origin/dev` for diffs.
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Prefer single word variable names where possible
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream

### Naming

Prefer single word names for variables and functions. Only use multiple words if necessary.

```ts
// Good
const foo = 1
function journal(dir: string) {}

// Bad
const fooBar = 1
function prepareJournal(dir: string) {}
```

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.

## Cursor Cloud specific instructions

### Services overview

- **OpenCode core** (`packages/opencode`): The AI coding agent — CLI, TUI, headless API server with embedded SQLite. This is the main product.
- **Web app** (`packages/app`): SolidJS web UI that connects to the core server.
- **Desktop app** (`packages/desktop`): Tauri-based native app wrapping the web UI (requires Rust toolchain).
- Cloud packages (console, enterprise, slack) require external services (PlanetScale, Stripe, Cloudflare) and are not needed for local development.

### Running the application

- `bun dev` from repo root starts the TUI (interactive terminal UI).
- `bun dev serve` starts the headless API server on port 4096 (also serves the built web UI).
- `bun dev web` is an alias for `bun dev serve` plus opens browser.
- For local UI development, run the backend and app dev servers separately as documented in `packages/app/AGENTS.md`.

### Running tests and checks

- Typecheck: `bun typecheck` (runs `turbo typecheck` across all packages).
- Tests: `cd packages/opencode && bun test --timeout 30000` (do NOT run from repo root).
- Pre-push hook (`.husky/pre-push`) validates Bun version matches `package.json` `packageManager` field and runs typecheck.

### Gotchas

- Bun version must match `package.json` `packageManager` field (currently `bun@1.3.9`). The pre-push hook enforces this.
- The `test` script in root `package.json` intentionally fails with "do not run tests from root". Always `cd` into the relevant package directory first.
- API routes on the server are at `/<resource>` (e.g. `/session`, `/config`, `/provider`), not `/api/<resource>`.
- An LLM API key (e.g. `ANTHROPIC_API_KEY`) is needed for the AI agent to function; the server starts without one but queries will fail.
