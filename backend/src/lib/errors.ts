export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message = code) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Authentication required");
export const forbidden = () => new AppError(403, "FORBIDDEN", "Insufficient permissions");
export const notFound = () => new AppError(404, "NOT_FOUND", "Resource not found");
export const conflict = (code = "CONFLICT") => new AppError(409, code, "The resource changed or already exists");
