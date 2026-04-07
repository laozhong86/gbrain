import { describe, expect, it } from "bun:test";
import pkg from "../package.json";
import openclawPluginPkg from "../plugins/openclaw/package.json";

describe("project bootstrap", () => {
  it("declares only the bootstrap metadata and checks that exist in Task 1", () => {
    expect(pkg.name).toBe("gbrain");
    expect(pkg.version).toBe("0.1.1");
    expect(openclawPluginPkg.version).toBe(pkg.version);
    expect(pkg.scripts.test).toBe("bun test");
    expect(pkg.scripts.check).toBe("tsc --noEmit");
    expect(pkg.devDependencies["bun-types"]).toBe("^1.3.11");
  });
});
