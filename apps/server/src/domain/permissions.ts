import { AppError, type Actor } from "@salespilot/shared";

export function assertCustomerAccess(actor: Actor, customer: { ownerId: string }) {
  if (actor.role === "sales" && customer.ownerId !== actor.id) {
    throw new AppError("FORBIDDEN", "无权访问其他销售名下的客户", { actorId: actor.id }, false, "请让客户负责人处理");
  }
}

export function assertManager(actor: Actor) {
  if (actor.role !== "manager") {
    throw new AppError("FORBIDDEN", "该操作需要销售经理权限");
  }
}
