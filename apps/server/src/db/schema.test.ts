import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { FOLLOW_UP_TYPES, OPPORTUNITY_STAGES, RISK_LEVELS } from "@salespilot/shared";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";
import { followUps, opportunities } from "./schema.js";

type TableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

type IndexListRow = {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
};

type Sqlite = ReturnType<typeof makeTestDb>["sqlite"];

function tableInfo(sqlite: Sqlite, table: string): TableInfoRow[] {
  return sqlite.prepare(`pragma table_info('${table}')`).all() as TableInfoRow[];
}

function columnInfo(sqlite: Sqlite, table: string, column: string): TableInfoRow {
  const match = tableInfo(sqlite, table).find((row) => row.name === column);
  expect(match, `expected column ${table}.${column} to exist`).toBeDefined();
  return match as TableInfoRow;
}

function indexColumns(sqlite: Sqlite, index: string): string[] {
  return (sqlite.prepare(`pragma index_info('${index}')`).all() as Array<{ name: string }>).map(
    (row) => row.name,
  );
}

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
      "opportunities",
      "follow_ups",
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

  it("defines the expected keys, defaults, and indexes", () => {
    const { sqlite } = makeTestDb();

    const inventoryPkColumns = tableInfo(sqlite, "inventory")
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    expect(inventoryPkColumns).toEqual(["warehouse_id", "product_id"]);

    const version = columnInfo(sqlite, "inventory", "version");
    expect(version.notnull).toBe(1);
    expect(version.dflt_value).toBe("0");

    const productIndexes = sqlite.prepare("pragma index_list('products')").all() as IndexListRow[];
    const skuIndex = productIndexes.find((index) => index.name === "products_sku_idx");
    expect(skuIndex, "expected products_sku_idx to exist").toBeDefined();
    expect(skuIndex?.unique).toBe(1);

    expect(columnInfo(sqlite, "customers", "credit_used_cents").dflt_value).toBe("0");
    expect(columnInfo(sqlite, "products", "tax_rate_bps").dflt_value).toBe("1300");
  });

  it("adds opportunity linkage and monthly targets", () => {
    const { sqlite } = makeTestDb();
    expect(columnInfo(sqlite, "quotes", "opportunity_id")).toBeDefined();
    expect(columnInfo(sqlite, "orders", "opportunity_id")).toBeDefined();
    expect(columnInfo(sqlite, "users", "monthly_target_cents").notnull).toBe(1);
    expect(columnInfo(sqlite, "quotes", "opportunity_id").notnull).toBe(0);
    expect(columnInfo(sqlite, "orders", "opportunity_id").notnull).toBe(0);
    expect(columnInfo(sqlite, "users", "monthly_target_cents").dflt_value).toBe("0");
    expect(columnInfo(sqlite, "opportunities", "stage").notnull).toBe(1);
    expect(columnInfo(sqlite, "opportunities", "probability").dflt_value).toBe("0");
    expect(columnInfo(sqlite, "opportunities", "risk_level").dflt_value).toBe("'low'");
    expect(columnInfo(sqlite, "follow_ups", "type").notnull).toBe(1);

    expect(indexColumns(sqlite, "opportunities_owner_stage_idx")).toEqual(["owner_id", "stage"]);
    expect(indexColumns(sqlite, "opportunities_customer_idx")).toEqual(["customer_id"]);
    expect(indexColumns(sqlite, "opportunities_due_idx")).toEqual(["next_action_due_at"]);
    expect(indexColumns(sqlite, "follow_ups_customer_idx")).toEqual(["customer_id", "created_at"]);
    expect(indexColumns(sqlite, "follow_ups_opportunity_idx")).toEqual([
      "opportunity_id",
      "created_at",
    ]);
  });

  it("keeps drizzle enums in sync with shared contracts", () => {
    expect(opportunities.stage.enumValues).toEqual([...OPPORTUNITY_STAGES]);
    expect(opportunities.riskLevel.enumValues).toEqual([...RISK_LEVELS]);
    expect(followUps.type.enumValues).toEqual([...FOLLOW_UP_TYPES]);
  });

  it("applies the migration idempotently", () => {
    const { db, sqlite } = makeTestDb();
    try {
      expect(() =>
        migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") }),
      ).not.toThrow();
    } finally {
      sqlite.close();
    }
  });
});
