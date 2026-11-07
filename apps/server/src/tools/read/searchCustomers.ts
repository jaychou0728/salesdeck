import { and, eq, inArray, like, or } from "drizzle-orm";
import { SearchCustomersInput, ok } from "@salespilot/shared";
import { contacts, customers } from "../../db/schema.js";
import { scopedOwnerIds } from "../../lib/actor.js";
import type { ToolDefinition } from "../types.js";

export const searchCustomers: ToolDefinition<SearchCustomersInput, unknown> = {
  name: "search_customers",
  description: "按客户名称、联系人、地区搜索客户。返回候选列表，不自动选定；多候选时提示澄清。",
  inputSchema: SearchCustomersInput,
  kind: "read",
  allowedRoles: ["sales", "manager"],
  execute(ctx, input) {
    const pattern = `%${input.query}%`;
    const scope = inArray(customers.ownerId, scopedOwnerIds(ctx.db, ctx.actor));
    const levelFilter = input.level ? eq(customers.level, input.level) : undefined;

    const directRows = ctx.db
      .select()
      .from(customers)
      .where(and(scope, levelFilter, or(like(customers.name, pattern), like(customers.region, pattern))))
      .all();

    const contactRows = ctx.db.select().from(contacts).where(like(contacts.name, pattern)).all();
    const contactCustomerIds = [...new Set(contactRows.map((contact) => contact.customerId))];
    const contactCustomerRows =
      contactCustomerIds.length === 0
        ? []
        : ctx.db
            .select()
            .from(customers)
            .where(and(scope, levelFilter, inArray(customers.id, contactCustomerIds)))
            .all();

    const byId = new Map<string, (typeof directRows)[number]>();
    for (const row of [...directRows, ...contactCustomerRows]) byId.set(row.id, row);
    const rows = [...byId.values()].slice(0, input.limit);

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
