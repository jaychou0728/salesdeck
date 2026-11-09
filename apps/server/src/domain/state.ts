import { AppError, type OrderStatus, type QuoteStatus } from "@salesdeck/shared";

export type { OrderStatus };

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["approved", "pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved: ["converted", "expired", "cancelled"],
  rejected: [],
  converted: [],
  expired: [],
  cancelled: [],
};

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus) {
  if (!QUOTE_TRANSITIONS[from].includes(to)) {
    throw new AppError("INVALID_STATE", `报价不能从 ${from} 变为 ${to}`);
  }
}

export function assertQuoteConvertible(quote: { status: string; validUntil: number }, now: number) {
  if (quote.status !== "approved") {
    throw new AppError("INVALID_STATE", "只有已批准的报价才能转订单");
  }
  if (quote.validUntil < now) {
    throw new AppError("INVALID_STATE", "报价已过期");
  }
}

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_approval: ["reserved", "cancelled"],
  reserved: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw new AppError("INVALID_STATE", `订单不能从 ${from} 变为 ${to}`);
  }
}
