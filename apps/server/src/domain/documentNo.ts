import type { Db } from "../db/client.js";
import { afterSalesTickets, orders, quotes } from "../db/schema.js";

function nextNo(values: string[], prefix: string) {
  const year = new Date().getFullYear();
  const head = `${prefix}-${year}-`;
  const max = values
    .filter((value) => value.startsWith(head))
    .reduce((current, value) => {
      const parsed = Number(value.slice(head.length));
      return Number.isFinite(parsed) ? Math.max(current, parsed) : current;
    }, 0);
  return `${head}${String(max + 1).padStart(4, "0")}`;
}

export function nextQuoteNo(db: Db) {
  return nextNo(
    db.select({ value: quotes.quoteNo }).from(quotes).all().map((row) => row.value),
    "Q",
  );
}

export function nextOrderNo(db: Db) {
  return nextNo(
    db.select({ value: orders.orderNo }).from(orders).all().map((row) => row.value),
    "SO",
  );
}

export function nextTicketNo(db: Db) {
  return nextNo(
    db.select({ value: afterSalesTickets.ticketNo }).from(afterSalesTickets).all().map((row) => row.value),
    "AS",
  );
}
