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

  it("supports page and paragraph chunk strategies", () => {
    const parsed = parseMarkdownDocument(source);

    expect(chunkPageContent(parsed.compiledTruth, parsed.timeline, "page")).toHaveLength(1);
    expect(chunkPageContent(parsed.compiledTruth, parsed.timeline, "paragraph").length).toBeGreaterThan(1);
  });

  it("keeps ordinary body horizontal rules inside compiled truth", () => {
    const parsed = parseMarkdownDocument(`---
title: Body Rule
type: concept
---

# Body Rule

Intro paragraph.

---

Still compiled truth.`);

    expect(parsed.compiledTruth).toContain("Intro paragraph.");
    expect(parsed.compiledTruth).toContain("---");
    expect(parsed.compiledTruth).toContain("Still compiled truth.");
    expect(parsed.timeline).toBe("");
  });

  it("splits timeline correctly in CRLF documents", () => {
    const parsed = parseMarkdownDocument(
      "---\r\ntitle: Windows Doc\r\ntype: person\r\n---\r\n\r\n# Windows Doc\r\n\r\nSummary.\r\n\r\n---\r\n\r\n- **2026-04-05** | meeting — CRLF timeline.\r\n",
    );

    expect(parsed.compiledTruth).toContain("# Windows Doc");
    expect(parsed.compiledTruth).toContain("Summary.");
    expect(parsed.timeline).toContain("2026-04-05");
    expect(parsed.timeline).toContain("CRLF timeline.");
  });
});
