import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { approvals, customers, inventory, products, quotes, warehouses } from "../db/schema.js";

export function registerBusiness(app: FastifyInstance, deps: { db: Db }) {
  app.get("/api/business/customers", async () => deps.db.select().from(customers).all());
  app.get("/api/business/customers/:id", async (request) => {
    const { id } = request.params as { id: string };
    return deps.db.select().from(customers).where(eq(customers.id, id)).get();
  });
  app.get("/api/business/inventory", async () =>
    deps.db.select({ productId: inventory.productId, warehouseId: inventory.warehouseId, onHand: inventory.onHand, reserved: inventory.reserved, safetyStock: inventory.safetyStock, etaDays: inventory.etaDays, sku: products.sku, name: products.name, warehouse: warehouses.name }).from(inventory).innerJoin(products, eq(inventory.productId, products.id)).innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id)).all(),
  );
  app.get("/api/business/quotes", async () => deps.db.select().from(quotes).orderBy(desc(quotes.createdAt)).limit(50).all());
  app.get("/api/business/approvals", async () => deps.db.select().from(approvals).all());
}
