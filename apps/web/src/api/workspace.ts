import { apiGet, apiPatch, apiPost, type OpportunityDetailResponse, type OpportunitiesResponse, type WorkspaceResponse } from "./business";

export function fetchWorkspace() {
  return apiGet<WorkspaceResponse>("/api/business/workspace");
}

export function fetchOpportunities(query: { stage?: string; risk?: string; customerId?: string } = {}) {
  const params = new URLSearchParams();
  if (query.stage) params.set("stage", query.stage);
  if (query.risk) params.set("risk", query.risk);
  if (query.customerId) params.set("customerId", query.customerId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiGet<OpportunitiesResponse>(`/api/business/opportunities${suffix}`);
}

export function fetchOpportunity(id: string) {
  return apiGet<OpportunityDetailResponse>(`/api/business/opportunities/${id}`);
}

export function createOpportunity(input: {
  customerId: string;
  name: string;
  amountCents: number;
  stage: string;
  probability: number;
  expectedCloseDate: number;
  nextAction?: string;
  nextActionDueAt?: number;
  riskLevel?: string;
}) {
  return apiPost<{ ok: true; opportunity: { id: string; name: string } }>("/api/business/opportunities", input);
}

export function updateOpportunity(
  id: string,
  patch: {
    stage?: string;
    probability?: number;
    riskLevel?: string;
    nextAction?: string | null;
    nextActionDueAt?: number | null;
    amountCents?: number;
    expectedCloseDate?: number;
  },
) {
  return apiPatch<{ ok: true; opportunity: unknown }>(`/api/business/opportunities/${id}`, patch);
}

export function recordFollowUp(input: {
  customerId: string;
  opportunityId?: string;
  type: string;
  content: string;
  result?: string;
  nextAction?: string;
  nextActionDueAt?: number;
}) {
  return apiPost<{ ok: true; followUp: unknown }>("/api/business/follow-ups", input);
}
