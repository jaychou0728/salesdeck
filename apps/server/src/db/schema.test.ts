import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "../test/helpers.js";

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
    expect(columnInfo(sqlite, "users", "monthly_target_cents").dflt_value).toBe("0");
    expect(columnInfo(sqlite, "opportunities", "stage").notnull).toBe(1);
    expect(columnInfo(sqlite, "follow_ups", "type").notnull).toBe(1);
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
