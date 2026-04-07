---
name: gbrain-enrich
description: Store raw enrichment payloads and distill them into concise page updates.
metadata:
  openclaw:
    emoji: "✨"
    requires:
      bins: [gbrain]
---

# Enrich Skill

## Workflow

1. Read the current page first with `gbrain get <slug>`.
2. Store the full external payload with `gbrain call brain_raw '{"slug":"...","source":"...","data":{...}}'`.
3. Distill only durable facts into compiled truth: role, company, status, major relationships, meaningful background.
4. If the payload adds dated evidence, add it to timeline with `gbrain timeline-add`.
5. Link newly confirmed entities with `gbrain link`.

## Rules

- Raw payload goes into `raw_data`, not the page body.
- Do not dump long skill lists, full resumes, or complete API responses into compiled truth.
- If enrichment conflicts with newer local knowledge, flag the conflict instead of silently overwriting it.
