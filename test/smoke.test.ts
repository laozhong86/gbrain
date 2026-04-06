import { describe, expect, it } from "bun:test";
import pkg from "../package.json";

describe("project bootstrap", () => {
  it("declares the expected package name", () => {
    expect(pkg.name).toBe("gbrain");
  });
});
