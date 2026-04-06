import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";

describe("release surface", () => {
  it("ships docs, skills, and a buildable binary", () => {
    expect(existsSync("skills/query/SKILL.md")).toBe(true);
    expect(existsSync("CLAUDE.md")).toBe(true);

    const result = Bun.spawnSync(["bun", "run", "build"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
  });
});
