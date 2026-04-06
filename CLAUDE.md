# CLAUDE.md

GBrain is a personal knowledge brain backed by SQLite.

## Architecture

Thin CLI, fat skills. Durable logic belongs in `src/core`. CLI command adapters live in `src/commands`. MCP logic lives in `src/mcp`.

## Testing

Run `bun test`, `bun run check`, and `bun run build` before finishing work.
