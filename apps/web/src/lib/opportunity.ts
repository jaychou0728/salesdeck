import type { PriorityItem, RiskLevel } from "@salesdeck/shared";
import type { BadgeTone } from "../components/ui/Badge";

export const STAGE_LABELS: Record<string, string> = {
  lead: "线索",
  needs: "需求确认",
  solution: "方案沟通",
  quote: "报价",
  negotiation: "谈判",
  won: "成交",
  lost: "丢单",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

export const FOLLOW_UP_TYPE_LABELS: Record<string, string> = {
  call: "电话",
  wechat: "微信",
  email: "邮件",
  meeting: "会议",
  quote: "报价",
  system: "系统动作",
  ai_suggestion: "AI 建议",
};

export function stageTone(stage: string): BadgeTone {
  if (stage === "won") return "success";
  if (stage === "lost") return "neutral";
  if (stage === "quote" || stage === "negotiation") return "teal";
  return "info";
}

export function riskTone(risk: RiskLevel): BadgeTone {
  return risk === "high" ? "danger" : risk === "medium" ? "warning" : "success";
}

export function priorityTone(priority: PriorityItem["priority"]): BadgeTone {
  return priority === "P0" ? "danger" : priority === "P1" ? "warning" : "neutral";
}

export function priorityLabel(priority: PriorityItem["priority"]) {
  return priority === "P0" ? "P0 今天必须处理" : priority === "P1" ? "P1 今天建议处理" : "P2 本周处理";
}
