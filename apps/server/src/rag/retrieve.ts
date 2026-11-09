import { eq, inArray } from "drizzle-orm";
import type { Citation } from "@salesdeck/shared";
import type { Db } from "../db/client.js";
import { knowledgeChunks, knowledgeDocs } from "../db/schema.js";
import { cosine, hashEmbedding } from "./embeddings.js";

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const ascii = lower.match(/[a-z0-9]+/g) ?? [];
  const chinese = lower.replace(/[^一-龥]/g, "");
  const grams: string[] = [];
  for (let i = 0; i < chinese.length; i += 1) {
    grams.push(chinese[i]);
    if (i < chinese.length - 1) grams.push(chinese.slice(i, i + 2));
  }
  return [...ascii, ...grams];
}

function bm25Scores(query: string, docs: string[]): number[] {
  const queryTokens = [...new Set(tokenize(query))];
  const docTokens = docs.map(tokenize);
  const avgLength = docTokens.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const token of queryTokens) {
    df.set(token, docTokens.filter((tokens) => tokens.includes(token)).length);
  }
  return docTokens.map((tokens) => {
    let score = 0;
    for (const token of queryTokens) {
      const tf = tokens.filter((item) => item === token).length;
      if (tf === 0) continue;
      const idf = Math.log(1 + (docs.length - (df.get(token) ?? 0) + 0.5) / ((df.get(token) ?? 0) + 0.5));
      score += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (tokens.length / avgLength))));
    }
    return score;
  });
}

function ranks(scores: number[]): number[] {
  return scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.index);
}

const QUERY_ALIASES: Array<[RegExp, string]> = [
  [/开不了机|开不机|无法启动|开不了/g, "无法开机"],
  [/换新/g, "换机"],
];

export function normalizeQuery(query: string): string {
  return QUERY_ALIASES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), query);
}

const ASCII_WORD = /^[a-z0-9]+$/;
const CJK_BIGRAM = /^[一-龥]{2}$/;

// A chunk only counts as evidence when it shares a real term with the query:
// an ASCII word (length >= 2) or a CJK bigram. Single-character matches are
// deliberately ignored so incidental characters such as 计 in 设计 cannot
// answer an unrelated question.
export function hasLexicalSupport(query: string, text: string): boolean {
  const docTokens = new Set(tokenize(text));
  for (const token of new Set(tokenize(normalizeQuery(query)))) {
    if ((ASCII_WORD.test(token) && token.length >= 2) || CJK_BIGRAM.test(token)) {
      if (docTokens.has(token)) return true;
    }
  }
  return false;
}

export function retrieve(
  db: Db,
  query: string,
  topK = 5,
  docTypes?: string[],
): { chunks: Citation[]; hasSufficientEvidence: boolean } {
  const base = db
    .select({
      chunkId: knowledgeChunks.id,
      docId: knowledgeChunks.docId,
      heading: knowledgeChunks.heading,
      content: knowledgeChunks.content,
      embeddingJson: knowledgeChunks.embeddingJson,
      title: knowledgeDocs.title,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocs, eq(knowledgeChunks.docId, knowledgeDocs.id));
  const filter = docTypes && docTypes.length > 0 ? inArray(knowledgeDocs.type, docTypes) : undefined;
  const rows = base.where(filter).all();
  if (rows.length === 0) return { chunks: [], hasSufficientEvidence: false };

  const normalized = normalizeQuery(query);
  const texts = rows.map((row) => `${row.title}\n${row.heading}\n${row.content}`);
  const keyword = bm25Scores(normalized, texts);
  const queryVector = hashEmbedding(normalized);
  const vector = rows.map((row) => cosine(queryVector, JSON.parse(row.embeddingJson) as number[]));
  const keywordRank = ranks(keyword);
  const vectorRank = ranks(vector);
  const fused = rows.map(
    (_, index) => 1 / (60 + keywordRank.indexOf(index) + 1) + 1 / (60 + vectorRank.indexOf(index) + 1),
  );
  const ranked = ranks(fused).slice(0, topK);

  // Float chunks that share real terms with the query to the front so an
  // exact-keyword section is cited even when a noisy vector chunk ranks first.
  const supported = ranked.filter((index) => hasLexicalSupport(normalized, texts[index]));
  const ordered = [...supported, ...ranked.filter((index) => !supported.includes(index))].slice(0, topK);
  const hasSufficientEvidence = supported.length > 0;

  const chunks = ordered.map((index) => ({
    docId: rows[index].docId,
    title: rows[index].title,
    section: rows[index].heading,
    snippet: rows[index].content.slice(0, 220),
    chunkId: rows[index].chunkId,
    score: fused[index],
  }));

  return { chunks, hasSufficientEvidence };
}
