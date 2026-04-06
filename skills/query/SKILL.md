---
name: gbrain-query
description: Answer questions from the brain using FTS5, semantic search, and structured queries.
---

# Query Skill

1. Run `gbrain search "<query>"` for exact terms.
2. Run `gbrain query "<question>"` for semantic recall only when `OPENAI_API_KEY` is configured.
3. Use `gbrain get <slug>` on top hits before answering.
4. Cite pages by slug in the answer.
5. Fall back to `gbrain search "<query>"` when embeddings are not configured or semantic recall is unavailable.
6. If the brain does not contain the answer, say so directly.
