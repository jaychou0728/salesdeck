export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "AMBIGUOUS_ENTITY",
  "OUT_OF_STOCK",
  "CREDIT_EXCEEDED",
  "PRICE_FLOOR",
  "FORBIDDEN",
  "CONFLICT",
  "INVALID_STATE",
  "IDEMPOTENT_REPLAY",
  "TOKEN_EXPIRED",
  "TIMEOUT",
  "PROVIDER_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly recoverable = false,
    public readonly suggestedAction?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface Citation {
  docId: string;
  title: string;
  section: string;
  snippet: string;
  chunkId: string;
  score: number;
}

export interface RiskFlag {
  code: string;
  message: string;
  severity: "info" | "warning" | "blocker";
}

export interface ToolMeta {
  latencyMs: number;
  citations?: Citation[];
  ambiguous?: boolean;
}

export interface ToolError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  recoverable: boolean;
  suggestedAction?: string;
}

export type ToolResult<T> =
  | {
      ok: true;
      data: T;
      meta: ToolMeta;
      warnings: string[];
      risk: RiskFlag[];
    }
  | { ok: false; error: ToolError };

export function ok<T>(
  data: T,
  meta: Partial<Omit<ToolMeta, "latencyMs">> = {},
  warnings: string[] = [],
  risk: RiskFlag[] = [],
): ToolResult<T> {
  return { ok: true, data, meta: { latencyMs: 0, ...meta }, warnings, risk };
}

export function fail(
  code: ErrorCode,
  message: string,
  options: { details?: unknown; recoverable?: boolean; suggestedAction?: string } = {},
): ToolResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      details: options.details,
      recoverable: options.recoverable ?? false,
      suggestedAction: options.suggestedAction,
    },
  };
}
