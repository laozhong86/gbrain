import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";

describe("release surface", () => {
  it("ships docs, skills, and a buildable binary", () => {
    expect(existsSync("LICENSE")).toBe(true);
    expect(existsSync("README.md")).toBe(true);
    expect(existsSync("CLAUDE.md")).toBe(true);
    expect(existsSync("skills/ingest/SKILL.md")).toBe(true);
    expect(existsSync("skills/query/SKILL.md")).toBe(true);
    expect(existsSync("skills/maintain/SKILL.md")).toBe(true);
    expect(existsSync("skills/enrich/SKILL.md")).toBe(true);
    expect(existsSync("skills/briefing/SKILL.md")).toBe(true);
    expect(existsSync(".github/workflows/release.yml")).toBe(true);

    const buildResult = Bun.spawnSync(["bun", "run", "build"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(buildResult.exitCode).toBe(0);
    expect(existsSync("bin/gbrain")).toBe(true);

    const smokeResult = Bun.spawnSync(["./bin/gbrain", "version"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(smokeResult.exitCode).toBe(0);
    expect(new TextDecoder().decode(smokeResult.stdout).trim()).toBe("0.1.0");
  });
});
