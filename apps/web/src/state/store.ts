import { create } from "zustand";
import type { Artifact, TraceEvent } from "@salespilot/shared";

interface AppState {
  actorId: string;
  conversationId?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  trace: TraceEvent[];
  artifacts: Artifact[];
  streaming: boolean;
  pendingApprovalId?: string;
  setActor: (actorId: string) => void;
  addMessage: (message: { role: "user" | "assistant"; content: string }) => void;
  addTrace: (event: TraceEvent) => void;
  addArtifact: (artifact: Artifact) => void;
  setStreaming: (value: boolean) => void;
  setPendingApproval: (id?: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  actorId: "u_sales_lin",
  messages: [],
  trace: [],
  artifacts: [],
  streaming: false,
  setActor: (actorId) => set({ actorId }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  addTrace: (event) => set((state) => ({ trace: [...state.trace, event] })),
  addArtifact: (artifact) => set((state) => ({ artifacts: [...state.artifacts, artifact] })),
  setStreaming: (streaming) => set({ streaming }),
  setPendingApproval: (pendingApprovalId) => set({ pendingApprovalId }),
}));
