import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { forbidden } from "../lib/errors.js";

export function assertTrustedOrigin(request: FastifyRequest, config: AppConfig) {
  const origin = request.headers.origin;
  if (!origin || !config.allowedOrigins.includes(origin)) throw forbidden();
}
