import { describe, expect, it } from "bun:test";
import { getToolDefinitions } from "../src/mcp/server";

describe("getToolDefinitions", () => {
  it("declares the expected tool names", () => {
    const names = getToolDefinitions().map((tool) => tool.name);

    expect(names).toContain("brain_get");
    expect(names).toContain("brain_query");
  });
});
