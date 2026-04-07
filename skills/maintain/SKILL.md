---
name: gbrain-maintain
description: Run periodic maintenance over the knowledge graph.
metadata:
  openclaw:
    emoji: "🧹"
    requires:
      bins: [gbrain]
---

# Maintain Skill

## Workflow

1. Check stale pages with `gbrain list --limit 50` and read candidates that have not been touched recently.
2. Compare compiled truth against `gbrain timeline <slug>` to catch pages whose state no longer matches newer evidence.
3. Use `gbrain backlinks <slug>` to find orphans and weakly connected pages.
4. Review tag consistency with `gbrain tags <slug>` and `gbrain stats`.
5. Refresh semantic recall with `gbrain embed --stale` after material page updates.

## Output

Write the maintenance pass back into the brain as a dated source page, for example:

```bash
cat report.md | gbrain put sources/maintenance-$(date +%Y-%m-%d)
```

## Rules

- Fix contradictions in compiled truth, not by adding a second conflicting paragraph.
- Delete nothing unless you are certain it is duplicate or broken.
- Maintenance is allowed to create follow-up tasks, but it should not invent facts.
