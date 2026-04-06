import { describe, expect, it } from "bun:test";
import pkg from "../package.json";

describe("project bootstrap", () => {
  it("declares only the bootstrap metadata and checks that exist in Task 1", () => {
    expect(pkg.name).toBe("gbrain");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.scripts).toEqual({
      test: "bun test",
      check: "tsc --noEmit"
    });
    expect(pkg.devDependencies["bun-types"]).toBe("^1.3.11");
  });
});
