import { create } from "zustand";
import type { Artifact, Role, TraceEvent } from "@salespilot/shared";
import type { TraceEventLike } from "../api/business";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface AppState {
  actorId: string;
  role?: Role;
  conversationId?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  trace: TraceEvent[];
  artifacts: Artifact[];
  streaming: boolean;
  pendingApprovalId?: string;
  lastQuoteId?: string;
  chatContext?: string;
  pendingPrompt?: string;
  aiOpen: boolean;
  auditOpen: boolean;
  auditTraceId?: string;
  auditEvents?: TraceEventLike[];
  dataVersion: number;
  toasts: Toast[];
  setActor: (actorId: string) => void;
  setRole: (role?: Role) => void;
  setConversation: (conversationId?: string) => void;
  addMessage: (message: { role: "user" | "assistant"; content: string }) => void;
  updateLastAssistant: (content: string) => void;
  addTrace: (event: TraceEvent) => void;
  addArtifact: (artifact: Artifact) => void;
  removeArtifact: (index: number) => void;
  setStreaming: (value: boolean) => void;
  setPendingApproval: (id?: string) => void;
  setLastQuoteId: (id?: string) => void;
  resetChat: () => void;
  openAi: (context?: string) => void;
  closeAi: () => void;
  setChatContext: (context?: string) => void;
  queuePrompt: (prompt: string) => void;
  consumePendingPrompt: () => string | undefined;
  openAudit: (options?: { traceId?: string; events?: TraceEventLike[] }) => void;
  closeAudit: () => void;
  bumpData: () => void;
  pushToast: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useAppStore = create<AppState>((set, get) => ({
  actorId: "u_sales_lin",
  messages: [],
  trace: [],
  artifacts: [],
  streaming: false,
  aiOpen: false,
  auditOpen: false,
  dataVersion: 0,
  toasts: [],

  setActor: (actorId) => set({ actorId, role: undefined }),
  setRole: (role) => set({ role }),
  setConversation: (conversationId) => set({ conversationId }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateLastAssistant: (content) =>
    set((state) => {
      if (state.messages.length === 0) return { messages: [{ role: "assistant", content }] };
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      messages[messages.length - 1] = last.role === "assistant" ? { ...last, content } : { role: "assistant", content };
      return { messages };
    }),
  addTrace: (event) => set((state) => ({ trace: [...state.trace, event] })),
  addArtifact: (artifact) => set((state) => ({ artifacts: [...state.artifacts, artifact] })),
  removeArtifact: (index) => set((state) => ({ artifacts: state.artifacts.filter((_, i) => i !== index) })),
  setStreaming: (streaming) => set({ streaming }),
  setPendingApproval: (pendingApprovalId) => set({ pendingApprovalId }),
  setLastQuoteId: (lastQuoteId) => set({ lastQuoteId }),

  // Role switches clear the conversation but keep a pending approval card so the
  // manager can still act on the request that was just raised.
  resetChat: () =>
    set({
      conversationId: undefined,
      messages: [],
      trace: [],
      artifacts: [],
      streaming: false,
      lastQuoteId: undefined,
      chatContext: undefined,
      pendingPrompt: undefined,
    }),

  openAi: (context) => set({ aiOpen: true, chatContext: context }),
  closeAi: () => set({ aiOpen: false }),
  setChatContext: (chatContext) => set({ chatContext }),
  queuePrompt: (pendingPrompt) => set({ pendingPrompt }),
  consumePendingPrompt: () => {
    const prompt = get().pendingPrompt;
    if (prompt) set({ pendingPrompt: undefined });
    return prompt;
  },

  openAudit: (options) =>
    set({
      auditOpen: true,
      auditTraceId: options?.traceId,
      auditEvents: options?.events,
    }),
  closeAudit: () => set({ auditOpen: false }),

  bumpData: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),

  pushToast: (message, kind = "info") => {
    const id = ++toastSeq;
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, 4000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Current role, preferring the value returned by /api/business/me. */
export function useRole(): Role {
  const actorId = useAppStore((state) => state.actorId);
  const role = useAppStore((state) => state.role);
  if (role) return role;
  return actorId === "u_manager_wang" ? "manager" : "sales";
}
