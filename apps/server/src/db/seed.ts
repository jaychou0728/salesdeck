import { pathToFileURL } from "node:url";
import { createDb, type Db } from "./client.js";
import {
  afterSalesTickets,
  contacts,
  customers,
  followUps,
  inventory,
  opportunities,
  orderLines,
  orders,
  priceRules,
  products,
  quoteLines,
  quotes,
  stockReservations,
  users,
  warehouses,
} from "./schema.js";
import {
  buildFollowUpSeeds,
  buildOpportunitySeeds,
  buildOrderSeeds,
  buildQuoteSeeds,
  buildTicketSeeds,
  contacts as contactSeeds,
  customers as customerSeeds,
  inventoryRows,
  orderLineSeeds,
  priceRules as priceRuleSeeds,
  products as productSeeds,
  quoteLineSeeds,
  stockReservationSeeds,
  users as userSeeds,
  warehouses as warehouseSeeds,
} from "./seed-data.js";

export function seedDatabase(db: Db, now = Date.now()) {
  db.insert(users).values(userSeeds).onConflictDoNothing().run();
  db.insert(customers).values(customerSeeds).onConflictDoNothing().run();
  db.insert(contacts).values(contactSeeds).onConflictDoNothing().run();
  db.insert(products).values(productSeeds).onConflictDoNothing().run();
  db.insert(priceRules).values(priceRuleSeeds).onConflictDoNothing().run();
  db.insert(warehouses).values(warehouseSeeds).onConflictDoNothing().run();
  db.insert(inventory).values(inventoryRows).onConflictDoNothing().run();
  db.insert(opportunities).values(buildOpportunitySeeds(now)).onConflictDoNothing().run();
  db.insert(followUps).values(buildFollowUpSeeds(now)).onConflictDoNothing().run();
  db.insert(afterSalesTickets).values(buildTicketSeeds(now)).onConflictDoNothing().run();
  db.insert(quotes).values(buildQuoteSeeds(now)).onConflictDoNothing().run();
  db.insert(quoteLines).values(quoteLineSeeds).onConflictDoNothing().run();
  db.insert(orders).values(buildOrderSeeds(now)).onConflictDoNothing().run();
  db.insert(orderLines).values(orderLineSeeds).onConflictDoNothing().run();
  db.insert(stockReservations).values(stockReservationSeeds).onConflictDoNothing().run();
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
