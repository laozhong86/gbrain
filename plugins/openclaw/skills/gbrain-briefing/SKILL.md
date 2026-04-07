---
name: gbrain-briefing
description: Produce a daily briefing from current brain state.
metadata:
  openclaw:
    emoji: "📋"
    requires:
      bins: [gbrain]
---

# Briefing Skill

## Workflow

1. Start with `gbrain stats` to get overall state.
2. Pull recent updates with `gbrain list --limit 20`.
3. Pull important people, companies, and deals with filtered `gbrain list` calls.
4. Read the most relevant pages with `gbrain get <slug>` and scan for open threads or near-term deadlines.
5. Summarize what changed, what matters now, and what needs action next.

## Output format

- current state at a glance
- active threads
- important people and companies in play
- recent changes worth remembering
- stale items or follow-ups needing action

Write the result back into the brain:

```bash
cat briefing.md | gbrain put sources/briefing-$(date +%Y-%m-%d)
```
