import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";
import { chunkMarkdown } from "./chunker.js";
import { ingestKnowledge } from "./ingest.js";
import { retrieve } from "./retrieve.js";

const knowledgeDir = path.resolve(import.meta.dirname, "../../../../knowledge");

describe("rag", () => {
  it("chunks markdown by headings", () => {
    const chunks = chunkMarkdown("## 换机规则\n签收 7 日内可换新。\n## 响应时效\n24 小时内响应。");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading).toBe("换机规则");
  });

  it("retrieves DOA policy with citations", () => {
    const { db } = makeTestDb();
    ingestKnowledge(db, knowledgeDir);
    const result = retrieve(db, "开不了机 想换机", 5);
    expect(result.hasSufficientEvidence).toBe(true);
    expect(result.chunks[0].title).toMatch(/售后|DOA/);
    expect(result.chunks[0].snippet.length).toBeGreaterThan(0);
  });

  it("refuses when evidence is absent", () => {
    const { db } = makeTestDb();
    ingestKnowledge(db, knowledgeDir);
    const result = retrieve(db, "火星移民计划", 5);
    expect(result.hasSufficientEvidence).toBe(false);
  });

  it("filters by document type", () => {
    const { db } = makeTestDb();
    ingestKnowledge(db, knowledgeDir);
    const result = retrieve(db, "换机", 5, ["policy"]);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0].title).toMatch(/政策/);
  });
});
