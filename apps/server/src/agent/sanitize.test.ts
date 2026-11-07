import { describe, expect, it } from "vitest";
import { sanitizeAssistantText } from "./sanitize.js";

describe("assistant text sanitizer", () => {
  it("removes leaked scope parameters and positional option references", () => {
    const result = sanitizeAssistantText("可以从上面的选项里挑一个继续（scope=self）。");
    expect(result).not.toContain("上面");
    expect(result).not.toContain("scope");
    expect(result).toContain("可执行选项");
  });

  it("removes internal write parameters", () => {
    const result = sanitizeAssistantText("请确认（dryRun=true）后再提交。");
    expect(result).not.toContain("dryRun");
    expect(result).toContain("请确认");
  });

  it("normalizes below/above option wording", () => {
    expect(sanitizeAssistantText("点击下面的选项继续")).toBe("点击可执行选项继续");
  });

  it("leaves normal business text untouched", () => {
    const text = "华辰设计报价 ¥280,000，建议今天确认预算与交付时间。";
    expect(sanitizeAssistantText(text)).toBe(text);
  });
});
