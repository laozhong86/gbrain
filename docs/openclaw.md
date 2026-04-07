# OpenClaw Integration

This is the first-class path for wiring GBrain into OpenClaw.

The shape is simple:

- GBrain stays the local knowledge layer.
- OpenClaw stays the execution environment and client surface.
- The integration happens through a local database, an MCP server, a skill pack, and an optional session hook.

## Fastest install path

OpenClaw can now install GBrain as a native plugin package from the repo root:

```bash
openclaw plugins install /absolute/path/to/GBrain/plugins/openclaw
openclaw gateway restart
```

That plugin package ships:

- the GBrain skill pack from `skills/`
- the session ingest hook pack from `hooks/`

You still need the `gbrain` binary available on `PATH` or at `~/.local/bin/gbrain`, because the hook and MCP flow call the local CLI.

## 1. Install GBrain

```bash
git clone https://github.com/laozhong86/gbrain.git
cd gbrain

bun install
bun run check
bun test
bun run build

mkdir -p ~/.local/bin
cp bin/gbrain ~/.local/bin/gbrain
chmod +x ~/.local/bin/gbrain
```

## 2. Enable the OpenClaw profile

If you want GBrain to behave like a native OpenClaw companion, set:

```bash
export GBRAIN_PROFILE=openclaw
```

With that profile enabled, the default database path becomes `~/.openclaw/brain.db`.

Then initialize it once:

```bash
gbrain init
gbrain stats
```

If you prefer explicit paths, `--db` and `GBRAIN_DB` still win.

## 3. Let the plugin provision the MCP server

When you install the native plugin package and restart OpenClaw, it now auto-provisions:

```json
{
  "mcp": {
    "servers": {
      "gbrain": {
        "command": "/Users/you/.local/bin/gbrain",
        "args": ["serve", "--db", "/Users/you/.openclaw/brain.db"]
      }
    }
  }
}
```

The defaults are:

- binary: `~/.local/bin/gbrain` if it exists, otherwise `gbrain` from `PATH`
- database: `~/.openclaw/brain.db`

If you need overrides, set them under `plugins.entries.gbrain.config`:

```json
{
  "plugins": {
    "entries": {
      "gbrain": {
        "config": {
          "binaryPath": "/absolute/path/to/gbrain",
          "dbPath": "/absolute/path/to/brain.db"
        }
      }
    }
  }
}
```

If `mcp.servers.gbrain` already exists, the plugin leaves it alone.

## 4. Install the skill pack

```bash
mkdir -p ~/.openclaw/workspace/skills
cp -R skills/ingest ~/.openclaw/workspace/skills/gbrain-ingest
cp -R skills/query ~/.openclaw/workspace/skills/gbrain-query
cp -R skills/maintain ~/.openclaw/workspace/skills/gbrain-maintain
cp -R skills/enrich ~/.openclaw/workspace/skills/gbrain-enrich
cp -R skills/briefing ~/.openclaw/workspace/skills/gbrain-briefing
```

These skills add the operator workflow layer on top of the CLI and MCP tools.

## 5. Optional: enable session auto-ingest

```bash
mkdir -p ~/.openclaw/workspace/skills
cp -R hooks/gbrain-ingest-session ~/.openclaw/workspace/skills/gbrain-ingest-session
```

Then register it in `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "internal": {
      "handlers": [
        {
          "event": "command:new",
          "module": "~/.openclaw/workspace/skills/gbrain-ingest-session/hook.js",
          "export": "default"
        },
        {
          "event": "command:reset",
          "module": "~/.openclaw/workspace/skills/gbrain-ingest-session/hook.js",
          "export": "default"
        }
      ]
    }
  }
}
```

That hook stores the conversation as a `conversation` source via:

```bash
gbrain ingest /tmp/... --type conversation --ref openclaw-session/<session-id>
```

## 6. Embeddings

Lexical search works without any provider key. Hybrid query needs one of:

```bash
export OPENAI_API_KEY=your_key
```

or:

```bash
export OPENROUTER_API_KEY=your_key
export OPENROUTER_HTTP_REFERER=https://your-site.example
export OPENROUTER_X_TITLE=GBrain
```

## 7. Smoke test

Run these before blaming OpenClaw:

```bash
gbrain version
gbrain --tools-json
gbrain stats
gbrain serve
```
