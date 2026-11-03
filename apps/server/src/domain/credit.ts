export interface CreditSnapshot {
  creditLimitCents: number;
  creditUsedCents: number;
}

export function checkCredit(customer: CreditSnapshot, orderTotalCents: number) {
  const availableCents = customer.creditLimitCents - customer.creditUsedCents;
  return {
    availableCents,
    requiresApproval: orderTotalCents > availableCents,
    reason:
      orderTotalCents > availableCents
        ? `信用可用额度不足：可用 ${availableCents} 分，本次需要 ${orderTotalCents} 分`
        : null,
  };
}
