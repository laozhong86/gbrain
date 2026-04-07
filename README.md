# GBrain

Compiled personal knowledge graph for AI agents.

GBrain is a local-first knowledge brain built on a single SQLite file. It combines full-text search, vector embeddings, structured queries, a CLI, and an MCP server in one place.

It is not a note app, and it is not a generic RAG pipeline. The core model is:

- **compiled truth**: the current understanding, rewritten as new information arrives
- **timeline**: append-only evidence, never rewritten

That makes GBrain useful anywhere knowledge compounds around entities and relationships across time.

> Based on the original GBrain spec: compiled truth + timeline, thin CLI + fat skills, MCP-native from day one.

## What it is

Most knowledge tools fall into one of two buckets.

The first bucket is note apps. You write things down, link pages, and organize folders.

The second bucket is RAG infrastructure. You throw documents into a vector store and retrieve chunks later.

GBrain sits in a different spot. It is a **compiled knowledge graph** for people, companies, deals, concepts, projects, and sources. It keeps:

```text
brain.db
  pages               compiled truth + timeline per entity
  page_fts            FTS5 full-text index
  page_embeddings     vector embeddings per chunk
  links               cross-references
  tags                tag index
  timeline_entries    structured timeline rows
  raw_data            raw enrichment payloads
  ingest_log          ingest audit trail
  config              runtime settings
```

One file. No server. No Docker. No separate vector database.

## Who it's for

GBrain works best when your core asset is not documents, but **entities plus context that accumulates over time**.

Natural fits:

- investors tracking founders, companies, deals, and relationship context
- founders tracking investors, partners, customers, and competitive context
- sales or BD teams tracking stakeholders, follow-ups, and account history
- researchers maintaining evolving understanding of papers, concepts, and experiments
- operators running AI workflows that need memory beyond a single session

What all of these share: the information gets more useful when it compounds, and you need it back later in a structured form.

## What it's not

GBrain is not:

- a hosted SaaS product
- a team wiki with multi-user collaboration
- a code index for source repositories
- a drafting or writing editor

It is a local knowledge layer that AI agents and MCP clients can query and update.

## Why MCP-native

The point of GBrain is not just storing data. The point is making that memory available to agents.

Any MCP-capable client can talk to the same brain:

- Claude Code
- Codex
- OpenClaw
- other MCP clients that speak stdio transport

The storage is local. The access is standardized. The memory persists across sessions.

OpenClaw-specific setup now has its own guide:

- [`docs/openclaw.md`](/Users/x/Desktop/Project/GBrain/docs/openclaw.md)
- [`hooks/gbrain-ingest-session/HOOK.md`](/Users/x/Desktop/Project/GBrain/hooks/gbrain-ingest-session/HOOK.md)

## Install

Prerequisites:

- Bun `1.3.11`
- macOS or Linux
- optional: `OPENAI_API_KEY` or `OPENROUTER_API_KEY` for embeddings and hybrid query

One-command install for the latest release binary:

```bash
curl -fsSL https://raw.githubusercontent.com/laozhong86/gbrain/main/install.sh | sh
```

The installer verifies the downloaded binary against the published `SHA256SUMS` file before replacing the target executable.

If you also want the OpenClaw plugin checkout installed and wired up:

```bash
curl -fsSL https://raw.githubusercontent.com/laozhong86/gbrain/main/install.sh | sh -s -- --with-openclaw
```

From source:

```bash
git clone https://github.com/laozhong86/gbrain.git
cd gbrain

bun install
bun run check
bun test
bun run build
```

Install the binary:

```bash
mkdir -p ~/.local/bin
cp bin/gbrain ~/.local/bin/gbrain
chmod +x ~/.local/bin/gbrain
```

Initialize a local brain:

```bash
mkdir -p ~/.gbrain
gbrain init ~/.gbrain/main.db
gbrain stats --db ~/.gbrain/main.db
```

Quick verification:

```bash
gbrain version
gbrain --tools-json
gbrain stats --db ~/.gbrain/main.db
```

If you are wiring GBrain into OpenClaw, you can opt into the OpenClaw preset:

```bash
export GBRAIN_PROFILE=openclaw
gbrain init
gbrain stats
```

That makes the default database path `~/.openclaw/brain.db` unless `--db` or `GBRAIN_DB` overrides it.

## Embeddings

Lexical search works without model credentials:

```bash
gbrain search "Jensen Huang" --db ~/.gbrain/main.db
```

Embeddings and hybrid semantic query require a provider key.

OpenAI:

```bash
export OPENAI_API_KEY=your_key
```

OpenRouter:

```bash
export OPENROUTER_API_KEY=your_key
export OPENROUTER_HTTP_REFERER=https://your-site.example
export OPENROUTER_X_TITLE=GBrain
```

Typical verification:

```bash
gbrain embed --all --db ~/.gbrain/main.db
gbrain query "who knows Jensen Huang?" --db ~/.gbrain/main.db
```

## CLI usage

```bash
# Write a page from stdin
cat page.md | gbrain put people/jane-doe --db ~/.gbrain/main.db

# Read a page
gbrain get people/jane-doe --db ~/.gbrain/main.db

# Full-text search
gbrain search "Series A" --db ~/.gbrain/main.db

# Hybrid semantic search
gbrain query "who is connected to Anthropic?" --db ~/.gbrain/main.db

# Filtered list
gbrain list --type person --limit 20 --db ~/.gbrain/main.db

# Timeline
gbrain timeline people/jane-doe --db ~/.gbrain/main.db
gbrain timeline-add people/jane-doe --date 2026-04-06 --summary "Met at demo day" --source meeting --db ~/.gbrain/main.db

# Import / export
gbrain import /path/to/notes --db ~/.gbrain/main.db
gbrain export --dir ./export --db ~/.gbrain/main.db

# Embeddings
gbrain embed --all --db ~/.gbrain/main.db
```

## MCP usage

GBrain exposes an MCP server over stdio:

```bash
gbrain serve --db ~/.gbrain/main.db
```

A typical MCP config looks like this:

```json
{
  "mcpServers": {
    "gbrain": {
      "command": "gbrain",
      "args": ["serve", "--db", "/Users/you/.gbrain/main.db"]
    }
  }
}
```

The current tool surface includes:

- `brain_get`
- `brain_put`
- `brain_ingest`
- `brain_link`
- `brain_search`
- `brain_query`
- `brain_timeline`
- `brain_timeline_add`
- `brain_tags`
- `brain_tag`
- `brain_list`
- `brain_backlinks`
- `brain_stats`
- `brain_raw`

## OpenClaw

OpenClaw is now a first-class integration target for this repo.

The OpenClaw path adds three things on top of the generic MCP setup:

- the `GBRAIN_PROFILE=openclaw` runtime preset
- the shipped `skills/` pack
- the optional session ingest hook in `hooks/gbrain-ingest-session`

Use the dedicated guide for the full install path:

- [`docs/openclaw.md`](/Users/x/Desktop/Project/GBrain/docs/openclaw.md)

The quickest productized install path is now:

```bash
openclaw plugins install /absolute/path/to/GBrain/plugins/openclaw
openclaw gateway restart
```

That installs the GBrain skill pack and hook pack from the dedicated OpenClaw plugin package under `plugins/openclaw`. On first load, the plugin also auto-provisions `mcp.servers.gbrain` if it is missing. The local `gbrain` binary still needs to exist.

## Skills

Shipped workflow guides live under `skills/`:

- `skills/gbrain-cli`
- `skills/ingest`
- `skills/query`
- `skills/maintain`
- `skills/enrich`
- `skills/briefing`

These are the operational layer on top of the CLI and MCP surface.

## Upgrade

If you installed the compiled binary:

```bash
gbrain upgrade --check
gbrain upgrade
```

`gbrain upgrade` downloads the latest matching binary from GitHub Releases, verifies it against the published `SHA256SUMS`, and replaces the local executable in place.

Current release assets cover:

- `gbrain-linux-x64`
- `gbrain-darwin-arm64`
- `gbrain-darwin-x64`

If self-update is unavailable on the current platform, the manual path still works:

```bash
git pull
bun install
bun run check
bun test
bun run build
cp bin/gbrain ~/.local/bin/gbrain
chmod +x ~/.local/bin/gbrain
```

## Development

Before finishing work:

```bash
bun run check
bun test
bun run build
```

## Related docs

- [DEPLOYMENT.md](/Users/x/Desktop/Project/GBrain/DEPLOYMENT.md)
- [CLAUDE.md](/Users/x/Desktop/Project/GBrain/CLAUDE.md)

## License

MIT

See [LICENSE](/Users/x/Desktop/Project/GBrain/LICENSE).

## Credits

**Original GBrain spec and architecture** — [Garry Tan](https://github.com/garrytan)

The core ideas come from the GBrain spec: compiled truth + timeline, thin CLI + fat skills, and MCP-native local memory.

**Repository implementation and packaging** — [laozhong86](https://github.com/laozhong86)

This repository turns that spec into a working local CLI, MCP server, release workflow, and operator-facing skill pack.
