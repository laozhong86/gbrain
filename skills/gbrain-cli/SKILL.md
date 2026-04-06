---
name: gbrain-cli
description: Use when installing, deploying locally, upgrading, configuring embeddings, or wiring the GBrain CLI into MCP clients such as Claude Code, Codex, or OpenClaw.
---

# GBrain CLI

## Overview

GBrain is a local CLI plus a local SQLite database, not a hosted web service.

The stable mental model is:

- binary: `gbrain`
- data file: `brain.db`
- MCP entrypoint: `gbrain serve --db /absolute/path/to/brain.db`

If someone says "deploy GBrain", translate that into one of three jobs:

1. install the binary locally
2. initialize or use a local `brain.db`
3. connect an MCP client to `gbrain serve`

Primary repo docs:

- [`README.md`](/Users/x/Desktop/Project/GBrain/README.md)
- [`DEPLOYMENT.md`](/Users/x/Desktop/Project/GBrain/DEPLOYMENT.md)

## When to Use

Use this skill when someone asks how to:

- install `gbrain`
- deploy it locally
- initialize a new brain
- configure OpenAI or OpenRouter embeddings
- connect GBrain to Claude Code, Codex, or OpenClaw
- upgrade the installed binary
- troubleshoot local CLI or MCP setup

Do not use this skill for schema design, search ranking, or migration debugging inside the repo. That is code work, not operator guidance.

## Quick Start

From source:

```bash
git clone https://github.com/laozhong86/gbrain.git
cd gbrain

bun install
bun run check
bun test
bun run build
```

Install the binary into PATH:

```bash
mkdir -p ~/.local/bin
cp bin/gbrain ~/.local/bin/gbrain
chmod +x ~/.local/bin/gbrain
```

Recommended local data path:

```bash
mkdir -p ~/.gbrain
gbrain init ~/.gbrain/main.db
gbrain stats --db ~/.gbrain/main.db
```

Minimum smoke checks:

```bash
gbrain version
gbrain --tools-json
gbrain stats --db ~/.gbrain/main.db
```

## Embeddings

Lexical search works without any model key:

```bash
gbrain search "Jensen Huang" --db ~/.gbrain/main.db
```

Embeddings and hybrid query require a provider key.

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

Current provider behavior:

- if `OPENAI_API_KEY` exists, use OpenAI
- if only `OPENROUTER_API_KEY` exists, use OpenRouter
- `EMBEDDING_BASE_URL` or `OPENAI_BASE_URL` can override the embeddings endpoint

Typical verification:

```bash
gbrain embed --all --db ~/.gbrain/main.db
gbrain query "who knows Jensen Huang?" --db ~/.gbrain/main.db
```

If embeddings fail, check the environment first before debugging the code.

## MCP Client Wiring

Every client uses the same stdio server shape:

```json
{
  "mcpServers": {
    "gbrain": {
      "command": "gbrain",
      "args": ["serve", "--db", "/absolute/path/to/brain.db"]
    }
  }
}
```

If `gbrain` is not in PATH, use the absolute binary path instead:

```json
{
  "mcpServers": {
    "gbrain": {
      "command": "/Users/x/.local/bin/gbrain",
      "args": ["serve", "--db", "/Users/x/.gbrain/main.db"]
    }
  }
}
```

### Claude Code

Place the MCP entry in Claude Code's MCP config or UI using the stdio shape above.

Verification:

```bash
gbrain serve --db ~/.gbrain/main.db
gbrain --tools-json
```

### Codex

Codex uses the same stdio MCP shape. Prefer an absolute binary path and a stable absolute database path.

### OpenClaw

OpenClaw also works best by treating GBrain as a stdio MCP server. The server shape is the same, only the host config surface changes.

## Upgrade

If GBrain was installed from a compiled binary:

```bash
gbrain upgrade --check
gbrain upgrade
```

Important constraints:

- self-update only works from the compiled `gbrain` binary
- it pulls from GitHub Releases
- current release assets exist for the platforms the repo publishes

If self-update is unavailable for the platform, do the manual path:

```bash
git pull
bun install
bun run check
bun test
bun run build
cp bin/gbrain ~/.local/bin/gbrain
chmod +x ~/.local/bin/gbrain
```

## Sensitive Data Rules

Never put real keys in:

- repo files
- `.env` files that might be committed
- issue comments
- prompts or logs that get synced elsewhere

Treat these as local-only runtime data:

- `~/.gbrain/main.db`
- `brain.db`, `brain.db-wal`, `brain.db-shm`
- shell environment variables like `OPENAI_API_KEY` and `OPENROUTER_API_KEY`

If someone pastes a real key into chat or logs, tell them to rotate it.

## Troubleshooting

If `gbrain init` or `gbrain stats` says `database is locked`, clear the stale local db files and retry:

```bash
rm -f ~/.gbrain/main.db ~/.gbrain/main.db-wal ~/.gbrain/main.db-shm
gbrain init ~/.gbrain/main.db
```

If `gbrain query` fails but `gbrain search` works, it is almost always an embeddings credential or endpoint problem.

If MCP tools do not appear, check in this order:

1. `gbrain version`
2. `gbrain --tools-json`
3. `gbrain stats --db ~/.gbrain/main.db`
4. `gbrain serve --db ~/.gbrain/main.db`

If `gbrain upgrade --check` returns a release lookup error, either the release does not exist yet or the installed binary cannot reach GitHub.
