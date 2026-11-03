import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { knowledgeChunks, knowledgeDocs } from "../db/schema.js";
import { chunkMarkdown } from "./chunker.js";
import { hashEmbedding } from "./embeddings.js";

function parseFrontmatter(raw: string) {
  const match = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {} as Record<string, string>, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) meta[key.trim()] = rest.join(":").trim();
  }
  return { meta, body: match[2] };
}

export function ingestKnowledge(db: Db, dir: string) {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort();
  for (const file of files) {
    const raw = readFileSync(path.join(dir, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const id = meta.id ?? path.basename(file, ".md");
    const contentHash = createHash("sha256").update(JSON.stringify(meta) + "\n" + body).digest("hex");
    const existing = db.select().from(knowledgeDocs).where(eq(knowledgeDocs.id, id)).get();
    if (existing?.contentHash === contentHash) continue;
    db.insert(knowledgeDocs)
      .values({
        id,
        title: meta.title ?? id,
        type: meta.type ?? "doc",
        effectiveDate: meta.effectiveDate ?? null,
        contentHash,
        createdAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: knowledgeDocs.id,
        set: {
          title: meta.title ?? id,
          type: meta.type ?? "doc",
          effectiveDate: meta.effectiveDate ?? null,
          contentHash,
          createdAt: Date.now(),
        },
      })
      .run();
    db.delete(knowledgeChunks).where(eq(knowledgeChunks.docId, id)).run();
    for (const [index, chunk] of chunkMarkdown(body).entries()) {
      db.insert(knowledgeChunks)
        .values({
          id: `${id}-${index}`,
          docId: id,
          heading: chunk.heading,
          content: chunk.content,
          embeddingJson: JSON.stringify(hashEmbedding(`${meta.title ?? id}\n${chunk.heading}\n${chunk.content}`)),
          tokenCount: Math.ceil(chunk.content.length / 2),
          createdAt: Date.now(),
        })
        .run();
    }
  }
}
