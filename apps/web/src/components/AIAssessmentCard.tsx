import { Bot, CheckCircle2, AlertTriangle } from "lucide-react";
import type { CustomerAssessment } from "../api/business";
import { Card, CardBody, CardHeader } from "./ui/Card";

export function AIAssessmentCard({ assessment, title = "AI 客户判断" }: { assessment: CustomerAssessment; title?: string }) {
  return (
    <Card className="border-teal-100">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <Bot size={15} className="text-teal-700" />
            {title}
          </span>
        }
        description="基于当前商机、跟进、信用与库存信号"
      />
      <CardBody className="space-y-3 text-xs">
        <p className="leading-relaxed text-slate-700">{assessment.summary}</p>
        {assessment.positiveSignals.length > 0 ? (
          <div>
            <div className="mb-1 font-medium text-emerald-700">积极信号</div>
            <ul className="space-y-1">
              {assessment.positiveSignals.map((signal) => (
                <li key={signal} className="flex gap-1.5 text-slate-600">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                  {signal}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {assessment.risks.length > 0 ? (
          <div>
            <div className="mb-1 font-medium text-rose-700">风险</div>
            <ul className="space-y-1">
              {assessment.risks.map((risk) => (
                <li key={risk} className="flex gap-1.5 text-slate-600">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-rose-500" />
                  {risk}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="rounded-lg bg-teal-50 p-2.5 text-teal-900">
          <span className="font-medium">建议：</span>
          {assessment.suggestion}
        </div>
        {assessment.nextAction ? <div className="text-[11px] text-slate-500">下一步：{assessment.nextAction}</div> : null}
      </CardBody>
    </Card>
  );
}
