import type { ChatMessage, ChatProvider, ChatResponse } from "./provider.js";
import { streamResponse, textResponse, toolResponse } from "./provider.js";

function lastUser(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function hasTool(messages: ChatMessage[], name: string) {
  return messages.some((message) => message.role === "tool" && message.name === name);
}

export class MockProvider implements ChatProvider {
  name = "mock";

  async chat(request: { messages: ChatMessage[]; tools?: unknown[]; stream?: boolean }): Promise<ChatResponse | AsyncIterable<unknown>> {
    const response = this.route(request.messages);
    return request.stream ? streamResponse(response) : response;
  }

  private route(messages: ChatMessage[]): ChatResponse {
    const user = lastUser(messages);
    if (user.includes("晨报")) {
      if (!hasTool(messages, "get_sales_briefing")) return toolResponse("get_sales_briefing", { scope: "self" });
      return textResponse("晨报已生成，请查看右侧风险提醒。");
    }
    if (user.includes("开不了机") || user.includes("售后")) {
      if (!hasTool(messages, "search_knowledge")) return toolResponse("search_knowledge", { query: "开不了机 DOA 换机", topK: 5 });
      const knowledge = [...messages].reverse().find((message) => message.role === "tool" && message.name === "search_knowledge");
      const chunkId = knowledge ? JSON.parse(knowledge.content ?? "{}")?.data?.chunks?.[0]?.chunkId : undefined;
      if (chunkId && !hasTool(messages, "create_after_sales_ticket")) {
        return toolResponse("create_after_sales_ticket", { customerId: "c_huachen", productId: "p_x1", issueType: "DOA", description: "签收后无法开机，申请换机", policyRefs: [chunkId], dryRun: true });
      }
      return textResponse("根据售后与 DOA 政策，签收 7 日内非人为损坏可换新；请提供序列号，我已为你准备工单预览。");
    }
    if (user.includes("转成订单") || user.includes("转订单")) {
      if (!hasTool(messages, "convert_quote_to_order")) {
        const quoteId = user.match(/q_[a-zA-Z0-9-]+/)?.[0] ?? "q_unknown";
        return toolResponse("convert_quote_to_order", { quoteId, dryRun: true });
      }
      return textResponse("已生成转订单预览，请在下方确认。");
    }
    if (user.includes("快到期") || user.includes("团队") || user.includes("信用风险")) {
      if (!hasTool(messages, "get_sales_briefing")) return toolResponse("get_sales_briefing", { scope: user.includes("团队") || user.includes("信用风险") ? "team" : "self" });
      return textResponse("晨报已生成，请查看右侧风险提醒。");
    }
    if (/信用|联系人|最近订单|c_none/.test(user)) {
      if (!hasTool(messages, "get_customer_360")) return toolResponse("get_customer_360", { customerId: "c_huachen" });
      return textResponse("客户 360 已获取，请查看右侧业务面板。");
    }
    if (user.includes("库存") || user.includes("苏州仓")) {
      if (!hasTool(messages, "check_inventory")) return toolResponse("check_inventory", { skuQuery: "X1", quantity: 120 });
      return textResponse("库存已查询，请查看拆仓方案。");
    }
    if (user.includes("什么价") || (user.includes("价格") && !user.includes("底线"))) {
      if (!hasTool(messages, "get_pricing")) return toolResponse("get_pricing", { customerId: "c_huachen", items: [{ sku: "X1", quantity: 120 }] });
      return textResponse("价格已计算，请查看报价明细。");
    }
    if (/政策|账期|有效期|底线|保修|验收|违约金|月结|换机|DOA/.test(user)) {
      if (!hasTool(messages, "search_knowledge")) return toolResponse("search_knowledge", { query: user, topK: 5 });
      const knowledge = [...messages].reverse().find((message) => message.role === "tool" && message.name === "search_knowledge");
      let hasSufficientEvidence = false;
      try {
        hasSufficientEvidence = JSON.parse(knowledge?.content ?? "{}")?.data?.hasSufficientEvidence === true;
      } catch {
        hasSufficientEvidence = false;
      }
      if (!hasSufficientEvidence) return textResponse("资料中没有足够依据，建议转人工或创建工单。");
      return textResponse("根据知识库检索结果，以上是相关政策条款，请以引用原文为准。");
    }
    if (user.includes("报") || user.includes("报价")) {
      if (!hasTool(messages, "search_customers")) return toolResponse("search_customers", { query: "华辰设计" });
      if (!hasTool(messages, "check_inventory")) return toolResponse("check_inventory", { skuQuery: "X1", quantity: 120 });
      if (!hasTool(messages, "get_pricing")) return toolResponse("get_pricing", { customerId: "c_huachen", items: [{ sku: "X1", quantity: 120 }] });
      if (!hasTool(messages, "create_quote")) return toolResponse("create_quote", { customerId: "c_huachen", contactId: "ct_zhang_1", lines: [{ sku: "X1", quantity: 120 }], validDays: 7, dryRun: true });
      return textResponse("已生成报价预览，请在下方确认。");
    }
    return textResponse("我可以帮你查客户、查库存、报价、下单或处理售后。");
  }
}
