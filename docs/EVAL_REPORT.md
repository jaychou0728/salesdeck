# Eval Report

> 生成方式：`pnpm eval`，使用真实工具注册表 + LangGraph 状态图 + 确定性 MockProvider 跑通 25 条 golden cases。
> 每条用例都使用独立的内存 SQLite，重新执行迁移、seed 与知识库入库。

- Total: 25
- Passed: 25
- Pass rate: 100.0%
- Failed: —

## 结果明细

| Case | Category | Expected | Actual | OK |
|---|---|---|---|---|
| E01 | briefing | get_sales_briefing | intent, get_sales_briefing, get_sales_briefing | ✅ |
| E02 | query | get_customer_360 | intent, get_customer_360, get_customer_360 | ✅ |
| E03 | query | check_inventory | intent, check_inventory, check_inventory | ✅ |
| E04 | query | get_pricing | intent, get_pricing, get_pricing | ✅ |
| E05 | quote | search_customers, check_inventory, get_pricing, create_quote | intent, search_customers, check_inventory, get_pricing, create_quote | ✅ |
| E06 | order | convert_quote_to_order | intent, convert_quote_to_order, convert_quote_to_order | ✅ |
| E07 | after_sales | search_knowledge, create_after_sales_ticket | intent, search_knowledge, create_after_sales_ticket | ✅ |
| E08 | policy | search_knowledge | intent, search_knowledge | ✅ |
| E09 | policy | search_knowledge | intent, search_knowledge | ✅ |
| E10 | policy | search_knowledge | intent, search_knowledge | ✅ |
| E11 | policy | search_knowledge | intent, search_knowledge | ✅ |
| E12 | policy | search_knowledge | intent, search_knowledge | ✅ |
| E13 | policy | search_knowledge | intent, search_knowledge | ✅ |
| E14 | policy | search_knowledge | intent, search_knowledge | ✅ |
| E15 | policy | search_knowledge | intent, search_knowledge | ✅ |
| E16 | query | get_customer_360 | intent, get_customer_360, get_customer_360 | ✅ |
| E17 | query | check_inventory | intent, check_inventory, check_inventory | ✅ |
| E18 | query | get_customer_360 | intent, get_customer_360, get_customer_360 | ✅ |
| E19 | briefing | get_sales_briefing | intent, get_sales_briefing, get_sales_briefing | ✅ |
| E20 | briefing | get_sales_briefing | intent, get_sales_briefing, get_sales_briefing | ✅ |
| E21 | chat | — | intent | ✅ |
| E22 | guardrail | — | intent | ✅ |
| E23 | idempotency | create_quote | intent, search_customers, check_inventory, get_pricing, create_quote | ✅ |
| E24 | boundary | get_customer_360 | intent, get_customer_360, get_customer_360 | ✅ |
| E25 | after_sales | search_knowledge, create_after_sales_ticket | intent, search_knowledge, create_after_sales_ticket | ✅ |
