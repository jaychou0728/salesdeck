import type { ChatMessage, ChatProvider, ChatResponse } from "./provider.js";
import { streamResponse, textResponse, toolResponse } from "./provider.js";

function lastUser(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function hasTool(messages: ChatMessage[], name: string) {
  return messages.some((message) => message.role === "tool" && message.name === name);
}

function pickOpportunityId(user: string) {
  if (user.includes("远山")) return "o_yuanshan_storage";
  if (user.includes("星河")) return "o_xinghe_maintenance";
  if (user.includes("智航")) return "o_zhihang_server";
  return "o_huachen_server";
}

function pickCustomerName(user: string) {
  if (user.includes("远山")) return "远山制造";
  if (user.includes("星河")) return "星河零售";
  if (user.includes("智航")) return "智航电子";
  return "华辰设计";
}

export class MockProvider implements ChatProvider {
  name = "mock";

  async chat(request: { messages: ChatMessage[]; tools?: unknown[]; stream?: boolean }): Promise<ChatResponse | AsyncIterable<unknown>> {
    const response = this.route(request.messages);
    return request.stream ? streamResponse(response) : response;
  }

  private route(messages: ChatMessage[]): ChatResponse {
    const user = lastUser(messages);
    if (user.includes("推进")) {
      if (!hasTool(messages, "get_opportunity_detail")) {
        return toolResponse("get_opportunity_detail", { opportunityId: pickOpportunityId(user) });
      }
      if (!hasTool(messages, "check_inventory")) {
        return toolResponse("check_inventory", { skuQuery: "SRV", quantity: 20 });
      }
      if (!hasTool(messages, "suggest_actions")) {
        const customer = pickCustomerName(user);
        return toolResponse("suggest_actions", {
          actions: [
            { label: "拉取 360 + 库存", prompt: `拉取${customer}客户 360 和库存拆仓方案` },
            { label: "试算转订单", prompt: `把${customer}的报价试算转订单` },
            { label: "准备最终报价", prompt: `为${customer}准备最终报价` },
            { label: "生成跟进话术", prompt: `为${customer}生成采购跟进话术` },
          ],
        });
      }
      return textResponse(
        "我先分析了这个商机：客户处于报价阶段，最近一次跟进后已有 5 天没有新进展；关联报价将在 48 小时内到期；当前 SRV 可用库存低于需求。\n建议：今天先联系采购确认预算审批与交付时间，再决定是否申请备货或调拨。\n下面是可继续执行的选项，点击即可继续。",
      );
    }
    if (user.includes("今天") && (user.includes("跟进") || user.includes("最值得"))) {
      if (!hasTool(messages, "get_sales_priorities")) return toolResponse("get_sales_priorities", { scope: "self", limit: 3 });
      return textResponse("已按金额、成交概率、跟进紧迫度和风险排序；最值得先推进的是华辰设计的服务器采购。");
    }
    if (user.includes("最危险") || user.includes("风险商机")) {
      if (!hasTool(messages, "get_sales_priorities")) return toolResponse("get_sales_priorities", { scope: "team", focus: "risk", limit: 3 });
      return textResponse("团队当前有 3 个高风险商机，最高风险是华辰设计的服务器采购：报价后 5 天未跟进，且库存不足。");
    }
    if (user.includes("记录跟进")) {
      if (!hasTool(messages, "log_follow_up")) {
        return toolResponse("log_follow_up", {
          customerId: "c_huachen",
          opportunityId: "o_huachen_server",
          type: "call",
          content: user.replace(/^.*?记录跟进[：:]\s*/, "").slice(0, 200) || "已联系客户，确认预算审批进度",
          result: "客户表示本周内答复",
          nextAction: "周五再次联系采购",
          nextActionDueAt: Date.now() + 3 * 86_400_000,
          dryRun: true,
        });
      }
      return textResponse("已生成跟进记录预览，请在下方确认。");
    }
    if (user.includes("下一步改成") || user.includes("接受建议")) {
      if (!hasTool(messages, "update_opportunity_next_action")) {
        return toolResponse("update_opportunity_next_action", {
          opportunityId: pickOpportunityId(user),
          nextAction: "周五确认预算",
          nextActionDueAt: Date.now() + 3 * 86_400_000,
          dryRun: true,
        });
      }
      return textResponse("已生成下一步行动预览，请在下方确认。");
    }
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
