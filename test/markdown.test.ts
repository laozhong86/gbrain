import { describe, expect, it } from "bun:test";
import {
  chunkPageContent,
  parseMarkdownDocument,
  renderMarkdownDocument,
} from "../src/core/markdown";

const source = `---
title: Pedro Franceschi
type: person
tags:
  - founder
  - yc-alum
---

# Pedro Franceschi

> Co-founder of Brex.

## State

Current summary.

---

- **2026-04-05** | meeting — Discussed Brex expansion.`;

describe("parseMarkdownDocument", () => {
  it("splits frontmatter, compiled truth, and timeline", () => {
    const parsed = parseMarkdownDocument(source);

    expect(parsed.frontmatter.title).toBe("Pedro Franceschi");
    expect(parsed.compiledTruth).toContain("## State");
    expect(parsed.timeline).toContain("2026-04-05");
  });

  it("round-trips back to markdown", () => {
    const parsed = parseMarkdownDocument(source);
    const rendered = renderMarkdownDocument(parsed);

    expect(rendered).toContain("title: Pedro Franceschi");
    expect(rendered).toContain("> Co-founder of Brex.");
    expect(rendered).toContain("- **2026-04-05** | meeting");
  });

  it("chunks page content by section", () => {
    const parsed = parseMarkdownDocument(source);
    const chunks = chunkPageContent(parsed.compiledTruth, parsed.timeline);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toContain("# Pedro Franceschi");
  });
});
