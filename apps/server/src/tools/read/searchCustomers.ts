import { and, eq, inArray, like, or } from "drizzle-orm";
import { SearchCustomersInput, ok } from "@salespilot/shared";
import { contacts, customers } from "../../db/schema.js";
import type { ToolDefinition } from "../types.js";

export const searchCustomers: ToolDefinition<SearchCustomersInput, unknown> = {
  name: "search_customers",
  description: "按客户名称、联系人、地区搜索客户。返回候选列表，不自动选定；多候选时提示澄清。",
  inputSchema: SearchCustomersInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const pattern = `%${input.query}%`;
    const scope = ctx.actor.role === "sales" ? eq(customers.ownerId, ctx.actor.id) : undefined;
    let rows = ctx.db
      .select()
      .from(customers)
      .where(and(scope, or(like(customers.name, pattern), like(customers.region, pattern))))
      .limit(input.limit)
      .all();
    const contactRows = ctx.db.select().from(contacts).where(like(contacts.name, pattern)).all();
    if (rows.length === 0 && contactRows.length > 0) {
      const ids = [...new Set(contactRows.map((contact) => contact.customerId))];
      rows = ctx.db
        .select()
        .from(customers)
        .where(and(scope, inArray(customers.id, ids)))
        .limit(input.limit)
        .all();
    }
    const matchedContacts = contactRows.filter((contact) => rows.some((row) => row.id === contact.customerId));
    return {
      model: ok(
        {
          customers: rows.map((row) => ({
            ...row,
            contactHighlights: matchedContacts
              .filter((contact) => contact.customerId === row.id)
              .map((contact) => `${contact.name} · ${contact.title}`),
          })),
          ambiguous: rows.length > 1,
        },
        { ambiguous: rows.length > 1 },
      ),
    };
  },
};
