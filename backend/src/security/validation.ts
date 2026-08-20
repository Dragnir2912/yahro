import { z } from "zod";
import { normalizeEmail } from "./crypto.js";

export const emailSchema = z.string().trim().min(3).max(320).email().transform(normalizeEmail);

export const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(128, "Password must contain at most 128 characters");

export const uuidSchema = z.string().uuid();
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const moneySchema = z.string().regex(/^(0|[1-9]\d{0,14})(\.\d{1,4})?$/);
export const signedMoneySchema = z.string().regex(/^-?(0|[1-9]\d{0,14})(\.\d{1,4})?$/);
export const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional();

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new Error("Invalid request data") as Error & { statusCode?: number; code?: string };
    error.statusCode = 422;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return result.data;
}
