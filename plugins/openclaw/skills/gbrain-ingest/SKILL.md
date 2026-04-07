---
name: gbrain-ingest
description: Ingest meetings, documents, and conversations into the brain.
metadata:
  openclaw:
    emoji: "🧠"
    requires:
      bins: [gbrain]
---

# Ingest Skill

## Workflow

1. Read the source closely. Pull out entities, events, commitments, and relationship signals.
2. For each meaningful entity:
   - `gbrain search "<name>"` to check whether a page already exists.
   - If it exists, `gbrain get <slug>` and rewrite compiled truth so the page reflects the current state.
   - If it does not exist, create a new page with `gbrain put <slug>`.
3. Add dated events with `gbrain timeline-add <slug> --date YYYY-MM-DD --summary "..." --source "..."`.
4. Create cross-references with `gbrain link <from> <to> --context "..."`.
5. Use tags only for durable categories such as `investor`, `customer`, `active`, `follow-up`.
6. Verify a few updated pages with `gbrain get <slug>` and check aggregate counts with `gbrain stats`.

## Rules

- Rewrite compiled truth. Do not stack duplicate summaries.
- Keep timeline append-only. New evidence belongs in timeline, not as a patchwork paragraph.
- Use `gbrain ingest <file> --type conversation --ref openclaw-session/<id>` when the source came from an OpenClaw session hook.
- If a mention is casual and has no lasting value, do not create a page for it.
