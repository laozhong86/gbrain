---
name: gbrain-ingest-session
description: Save an OpenClaw session into GBrain when `/new` or `/reset` is issued.
metadata:
  openclaw:
    emoji: "🧠"
    events: ["command:new", "command:reset"]
    requires:
      bins: [gbrain]
    install:
      - id: manual
        kind: manual
        label: "Register the hook in ~/.openclaw/openclaw.json"
---

# GBrain Session Ingest Hook

This hook captures the current OpenClaw session transcript and writes it into GBrain as a `conversation` source whenever `/new` or `/reset` is invoked.

## What it does

1. Reads the current session transcript from the hook event payload.
2. Skips trivial sessions with fewer than two user messages.
3. Writes a temporary markdown transcript.
4. Runs:

```bash
gbrain ingest /tmp/... --type conversation --ref openclaw-session/<session-id>
```

The ingest stays lightweight on purpose. The durable extraction step still belongs to `skills/ingest/SKILL.md`.

## Install

Copy this directory into your OpenClaw workspace:

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

## Notes

- The hook fails closed. If `gbrain` is missing or ingest fails, the OpenClaw session still continues.
- Pair this hook with `skills/ingest/SKILL.md` so the stored conversation can be distilled into compiled truth and timeline updates.
