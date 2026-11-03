import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { TraceEvent } from "@salespilot/shared";
import type { Db } from "../db/client.js";
import { traces, traceEvents } from "../db/schema.js";

export class TraceRecorder {
  readonly traceId = `t_${randomUUID()}`;
  private seq = 0;

  constructor(
    private db: Db,
    private actorId: string,
    private conversationId: string | undefined,
    private sink: (event: TraceEvent, seq: number) => void,
  ) {}

  start() {
    this.db.insert(traces).values({ id: this.traceId, conversationId: this.conversationId ?? null, actorId: this.actorId, status: "running", startedAt: Date.now(), inputTokens: 0, outputTokens: 0 }).run();
    this.event({ type: "trace.start", payload: { traceId: this.traceId } });
  }

  event(event: TraceEvent) {
    this.seq += 1;
    this.db.insert(traceEvents).values({
      id: `te_${randomUUID()}`,
      traceId: this.traceId,
      seq: this.seq,
      type: event.type,
      name: event.name ?? null,
      payloadJson: JSON.stringify(event.payload ?? {}),
      status: event.status ?? null,
      latencyMs: event.latencyMs ?? null,
      createdAt: Date.now(),
    }).run();
    this.sink({ ...event, traceId: this.traceId, seq: this.seq }, this.seq);
  }

  end(status: "ok" | "error") {
    this.db.update(traces).set({ status, endedAt: Date.now() }).where(eq(traces.id, this.traceId)).run();
    this.event({ type: "trace.end", payload: { status } });
  }
}
