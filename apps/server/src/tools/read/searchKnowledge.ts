import { ok, SearchKnowledgeInput } from "@salesdeck/shared";
import { retrieve } from "../../rag/retrieve.js";
import type { ToolDefinition } from "../types.js";

export const searchKnowledge: ToolDefinition<SearchKnowledgeInput, unknown> = {
  name: "search_knowledge",
  description: "检索企业知识库（报价、信用、售后/DOA、产品 FAQ、合同条款），返回带引用的原文片段。",
  inputSchema: SearchKnowledgeInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const result = retrieve(ctx.db, input.query, input.topK, input.docTypes);
    return {
      model: ok(
        { chunks: result.chunks, hasSufficientEvidence: result.hasSufficientEvidence },
        { citations: result.chunks },
        result.hasSufficientEvidence ? [] : ["知识库中没有足够证据，请转人工或创建工单"],
      ),
    };
  },
};
