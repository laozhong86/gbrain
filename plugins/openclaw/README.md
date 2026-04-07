# @laozhong86/gbrain-openclaw

Versioned OpenClaw plugin package for GBrain.

This package installs the shipped GBrain skill pack and the session-ingest hook pack for OpenClaw. The plugin also auto-provisions `mcp.servers.gbrain` when it is missing.

Install:

```bash
openclaw plugins install @laozhong86/gbrain-openclaw
openclaw gateway restart
```

You still need the `gbrain` binary available locally. The plugin defaults to:

- binary: `~/.local/bin/gbrain` if present, otherwise `gbrain` from `PATH`
- database: `~/.openclaw/brain.db`

Optional plugin config:

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

Source repository:

- GitHub: `https://github.com/laozhong86/gbrain`
- OpenClaw integration guide: `https://github.com/laozhong86/gbrain/blob/main/docs/openclaw.md`
