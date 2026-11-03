import type { BadgeTone } from "../components/ui/Badge";

const LABELS: Record<string, string> = {
  draft: "草稿",
  pending_approval: "待审批",
  approved: "已批准",
  rejected: "已驳回",
  converted: "已转订单",
  expired: "已过期",
  cancelled: "已取消",
  reserved: "已预留",
  fulfilled: "已履约",
  pending: "待处理",
  open: "待处理",
  processing: "处理中",
  resolved: "已解决",
  closed: "已关闭",
  running: "执行中",
  ok: "成功",
  error: "失败",
};

const TONES: Record<string, BadgeTone> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  converted: "info",
  expired: "neutral",
  cancelled: "neutral",
  reserved: "success",
  fulfilled: "info",
  pending: "warning",
  open: "warning",
  processing: "info",
  resolved: "success",
  closed: "neutral",
  running: "info",
  ok: "success",
  error: "danger",
};

export function statusLabel(status: string): string {
  return LABELS[status] ?? status;
}

export function statusTone(status: string): BadgeTone {
  return TONES[status] ?? "neutral";
}

export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("zh-CN");
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function parseRiskFlags(value: unknown): Array<{ code: string; message: string; severity: "info" | "warning" | "blocker" }> {
  if (Array.isArray(value)) return value as Array<{ code: string; message: string; severity: "info" | "warning" | "blocker" }>;
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
