export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "invalid_token"
  | "unavailable"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  rate_limited: 429,
  invalid_token: 422,
  unavailable: 503,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: ErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fieldErrors = fieldErrors;
  }
}

export function assertFound<T>(value: T | null | undefined, message = "Ressource introuvable"): T {
  if (value === null || value === undefined) {
    throw new AppError("not_found", message);
  }
  return value;
}
