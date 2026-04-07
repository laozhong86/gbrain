---
name: gbrain-query
description: Answer questions from the brain using FTS5, semantic search, and structured queries.
metadata:
  openclaw:
    emoji: "🔍"
    requires:
      bins: [gbrain]
---

# Query Skill

## Strategy

1. Start with `gbrain search "<query>"` when the question contains names, exact terms, or acronyms.
2. Run `gbrain query "<question>"` for semantic recall when embeddings are configured. OpenAI and OpenRouter both work.
3. Use `gbrain list`, `gbrain backlinks`, `gbrain timeline`, and `gbrain tags` when the question is relational or date-sensitive.
4. Read the top candidate pages with `gbrain get <slug>` before answering.
5. Cite slugs in the answer so the user can jump back into the brain.

## Rules

- Fall back to lexical search if embeddings are missing or unhealthy.
- Prefer pages with fresher compiled truth when two answers conflict.
- If the brain does not contain the answer, say that directly.
- If the answer should become durable memory, suggest writing it back with `gbrain put`.
