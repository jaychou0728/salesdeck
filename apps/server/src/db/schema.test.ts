import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";

describe("database schema", () => {
  it("creates all core tables", () => {
    const { sqlite } = makeTestDb();
    const tables = sqlite
      .prepare("select name from sqlite_master where type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);
    for (const table of [
      "users",
      "customers",
      "contacts",
      "products",
      "price_rules",
      "warehouses",
      "inventory",
      "quotes",
      "quote_lines",
      "orders",
      "order_lines",
      "stock_reservations",
      "approvals",
      "after_sales_tickets",
      "conversations",
      "messages",
      "traces",
      "trace_events",
      "audit_logs",
      "idempotency_keys",
      "confirmation_tokens",
      "knowledge_docs",
      "knowledge_chunks",
    ]) {
      expect(tables).toContain(table);
    }
  });
});
