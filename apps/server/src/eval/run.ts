import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { makeTestDb } from "../test/helpers.js";
import { seedDatabase } from "../db/seed.js";
import { ingestKnowledge } from "../rag/ingest.js";
import { MockProvider } from "../agent/mockProvider.js";
import { buildAgentGraph } from "../agent/graph.js";
import { allTools } from "../tools/index.js";

interface GoldenCase {
  id: string;
  input: string;
  expectedTools: string[];
  category: string;
}

interface EvalResult extends GoldenCase {
  actual: string[];
  ok: boolean;
}

const cases = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../../evals/golden-cases.json"), "utf8"),
) as GoldenCase[];
const knowledgeDir = path.resolve(import.meta.dirname, "../../../../knowledge");
const reportPath = path.resolve(import.meta.dirname, "../../../../docs/EVAL_REPORT.md");

const results: EvalResult[] = [];
let passed = 0;

for (const testCase of cases) {
  const useManager = testCase.input.includes("团队") || testCase.input.includes("本月");
  const { db, sqlite } = makeTestDb();
  try {
    seedDatabase(db);
    ingestKnowledge(db, knowledgeDir);
    const actor = {
      id: useManager ? "u_manager_wang" : "u_sales_lin",
      name: useManager ? "老王" : "小林",
      role: useManager ? ("manager" as const) : ("sales" as const),
      teamId: "team_east",
    };
    const events: Array<{ type: string; name?: string }> = [];
    const ctx = { db, sqlite, actor, traceId: `eval_${testCase.id}`, emit: (event: { type: string; name?: string }) => events.push(event) };
    const graph = buildAgentGraph({ provider: new MockProvider(), ctx, allTools });
    await graph.invoke({
      messages: [{ role: "user", content: testCase.input }],
      actor,
      traceId: ctx.traceId,
      intent: "business",
      stepCount: 0,
      pendingConfirmation: false,
      citations: [],
      toolCalls: [],
      toolCounts: {},
      budgetExceeded: false,
      finalText: "",
    });
    const actual = events.filter((event) => event.type === "step.start").map((event) => event.name ?? "");
    const ok = testCase.expectedTools.every((tool) => actual.includes(tool));
    if (ok) passed += 1;
    results.push({ ...testCase, actual, ok });
  } finally {
    sqlite.close();
  }
}

const passRate = ((passed / cases.length) * 100).toFixed(1);
const rows = results
  .map(
    (result) =>
      `| ${result.id} | ${result.category} | ${result.expectedTools.join(", ") || "—"} | ${result.actual.join(", ") || "—"} | ${result.ok ? "✅" : "❌"} |`,
  )
  .join("\n");
const failed = results.filter((result) => !result.ok);

const report = `# Eval Report

> 生成方式：\`pnpm eval\`，使用真实工具注册表 + LangGraph 状态图 + 确定性 MockProvider 跑通 ${cases.length} 条 golden cases。
> 每条用例都使用独立的内存 SQLite，重新执行迁移、seed 与知识库入库。

- Total: ${cases.length}
- Passed: ${passed}
- Pass rate: ${passRate}%
- Failed: ${failed.length > 0 ? failed.map((result) => result.id).join(", ") : "—"}

## 结果明细

| Case | Category | Expected | Actual | OK |
|---|---|---|---|---|
${rows}
`;

writeFileSync(reportPath, report);
console.log(report);
