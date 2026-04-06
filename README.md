# GBrain

SQLite-backed personal knowledge brain with FTS5, embeddings, CLI access, and MCP access.

## Quick start

```bash
bun install
bun run build
./bin/gbrain init
./bin/gbrain stats
./bin/gbrain upgrade --check
```

## Development

Run `bun test`, `bun run check`, and `bun run build` before finishing work.

## Upgrade

If you installed the compiled binary, you can check for updates or self-update in place:

```bash
gbrain upgrade --check
gbrain upgrade
```

`gbrain upgrade` expects to be run from the compiled binary, not through `bun run src/cli.ts`.

## Skills

Shipped workflow guides live under `skills/`:

- `skills/ingest`
- `skills/query`
- `skills/maintain`
- `skills/enrich`
- `skills/briefing`
