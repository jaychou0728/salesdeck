import { describe, expect, it } from "vitest";
import { WORKSPACE_NAME } from "./index.js";

describe("workspace", () => {
  it("loads shared package", () => {
    expect(WORKSPACE_NAME).toBe("salesdeck");
  });
});
