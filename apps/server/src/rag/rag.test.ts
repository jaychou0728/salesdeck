import path from "node:path";
import { describe, expect, it } from "vitest";
import { knowledgeChunks, knowledgeDocs } from "../db/schema.js";
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
    const result = retrieve(db, "换机", 5, ["faq"]);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.every((chunk) => chunk.docId === "product-faq")).toBe(true);
  });

  it("matches fragmented DOA phrasing through aliases", () => {
    const { db } = makeTestDb();
    ingestKnowledge(db, knowledgeDir);
    const result = retrieve(db, "开不机", 5);
    expect(result.hasSufficientEvidence).toBe(true);
  });

  it("rejects incidental single-character matches", () => {
    const { db } = makeTestDb();
    ingestKnowledge(db, knowledgeDir);
    const result = retrieve(db, "可以开发票吗", 5);
    expect(result.hasSufficientEvidence).toBe(false);
  });

  it("finds exact policy vocabulary", () => {
    const { db } = makeTestDb();
    ingestKnowledge(db, knowledgeDir);
    const result = retrieve(db, "内存", 5);
    expect(result.hasSufficientEvidence).toBe(true);
    expect(result.chunks[0].title).toMatch(/FAQ/);
  });

  it("returns nothing for an unknown document type", () => {
    const { db } = makeTestDb();
    ingestKnowledge(db, knowledgeDir);
    const result = retrieve(db, "换机", 5, ["nope"]);
    expect(result.chunks.length).toBe(0);
    expect(result.hasSufficientEvidence).toBe(false);
  });

  it("is idempotent across repeated ingestion", () => {
    const { db } = makeTestDb();
    ingestKnowledge(db, knowledgeDir);
    ingestKnowledge(db, knowledgeDir);
    expect(db.select().from(knowledgeDocs).all()).toHaveLength(6);
    expect(db.select().from(knowledgeChunks).all()).toHaveLength(12);
  });

  it("splits long sections into overlapping windows", () => {
    const chunks = chunkMarkdown("## 长段落\n" + "x".repeat(1600));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].content.startsWith(chunks[0].content.slice(-80))).toBe(true);
  });
});
