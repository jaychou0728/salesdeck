import { pathToFileURL } from "node:url";
import { createDb, type Db } from "./client.js";
import { contacts, customers, inventory, orders, priceRules, products, quotes, users, warehouses } from "./schema.js";
import {
  contacts as contactSeeds,
  customers as customerSeeds,
  inventoryRows,
  orderSeeds,
  priceRules as priceRuleSeeds,
  products as productSeeds,
  quoteSeeds,
  users as userSeeds,
  warehouses as warehouseSeeds,
} from "./seed-data.js";

export function seedDatabase(db: Db) {
  db.insert(users).values(userSeeds).onConflictDoNothing().run();
  db.insert(customers).values(customerSeeds).onConflictDoNothing().run();
  db.insert(contacts).values(contactSeeds).onConflictDoNothing().run();
  db.insert(products).values(productSeeds).onConflictDoNothing().run();
  db.insert(priceRules).values(priceRuleSeeds).onConflictDoNothing().run();
  db.insert(warehouses).values(warehouseSeeds).onConflictDoNothing().run();
  db.insert(inventory).values(inventoryRows).onConflictDoNothing().run();
  db.insert(quotes).values(quoteSeeds).onConflictDoNothing().run();
  db.insert(orders).values(orderSeeds).onConflictDoNothing().run();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { db, sqlite } = createDb();
  try {
    seedDatabase(db);
  } finally {
    sqlite.close();
  }
  console.log("seed done");
}
