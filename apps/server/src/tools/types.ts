import type { z } from "zod";
import type { Actor, Artifact, Role, ToolResult, TraceEvent } from "@salesdeck/shared";
import type { Db } from "../db/client.js";
import type Database from "better-sqlite3";

export interface ToolContext {
  db: Db;
  sqlite: Database.Database;
  actor: Actor;
  traceId: string;
  emit: (event: TraceEvent) => void;
}

export interface ToolOutcome<T> {
  model: ToolResult<T>;
  artifacts?: Artifact[];
}

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I, z.ZodTypeDef, any>;
  kind: "read" | "write";
  allowedRoles: Role[];
  execute: (ctx: ToolContext, input: I) => Promise<ToolOutcome<O>> | ToolOutcome<O>;
}
