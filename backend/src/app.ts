import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { LogController } from "fastify";
import type { AppConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { AppError } from "./lib/errors.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerFinanceRoutes } from "./routes/finance.js";
import { registerImportRoutes } from "./routes/imports.js";
import { registerInsightRoutes } from "./routes/insights.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerCurrencyRoutes } from "./routes/currencies.js";
import { createAuthGuard } from "./security/authentication.js";
import { createTokenService } from "./security/tokens.js";
import { createEmailService } from "./services/email.js";

export async function createApp(config: AppConfig) {
  const app = Fastify({
    // Render's public port is reachable only through its load balancer. Trusting
    // exactly one hop preserves the real protocol and client IP without accepting
    // an arbitrary X-Forwarded-For chain. Other platforms still require CIDRs.
    trustProxy: config.deploymentPlatform === "render"
      ? (_address: string, hop: number) => hop === 0
      : config.trustedProxies.length > 0 ? config.trustedProxies : false,
    bodyLimit: 1024 * 1024,
    requestTimeout: 15_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 5_000,
    routerOptions: { maxParamLength: 200 },
    genReqId: () => crypto.randomUUID(),
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "password",
          "passwordConfirmation",
          "currentPassword",
          "newPassword",
          "token",
          "accessToken",
          "refreshToken",
          "secret",
          "otpAuthUri",
          "recoveryCodes",
          "code",
          "*.password",
          "*.passwordConfirmation",
          "*.currentPassword",
          "*.newPassword",
          "req.body.password",
          "req.body.passwordConfirmation",
          "req.body.currentPassword",
          "req.body.newPassword",
          "req.body.code",
          "req.body.mfaToken",
          "*.token",
          "*.secret",
          "*.code",
        ],
        censor: "[REDACTED]",
      },
    },
    logController: new LogController({ disableRequestLogging: config.isProduction }),
  });

  const database = createDatabase(config);
  const tokenService = createTokenService(config.jwtSecret, config.accessTokenTtlSeconds);
  const authenticate = createAuthGuard(database, tokenService);
  const email = createEmailService(config);

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
  });
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-CSRF-Intent"],
    exposedHeaders: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After", "X-Request-Id"],
    maxAge: 600,
  });
  await app.register(cookie, { hook: "onRequest" });
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
    enableDraftSpec: true,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({ code: "RATE_LIMITED", message: "Too many requests. Please try again later." }),
  });
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: config.maxUploadBytes,
      fields: 10,
      fieldNameSize: 100,
      fieldSize: 4096,
      parts: 11,
      headerPairs: 100,
    },
    throwFileSizeLimit: true,
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
    reply.header("Cache-Control", "no-store");
    if (config.isProduction && request.protocol !== "https") {
      if (request.method === "GET" || request.method === "HEAD") {
        return reply.redirect(new URL(request.url, config.publicApiOrigin).toString(), 308);
      }
      return reply.code(426).send({ code: "HTTPS_REQUIRED", message: "HTTPS is required." });
    }
  });

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({ code: "NOT_FOUND", message: "Resource not found." });
  });

  app.setErrorHandler(async (error, request, reply) => {
    const unknownError = error as { statusCode?: number; validation?: unknown; code?: string };
    const statusCode = error instanceof AppError ? error.statusCode : (unknownError.statusCode ?? 500);
    const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    if (safeStatus >= 500) request.log.error({ err: error, requestId: request.id }, "Request failed");
    else request.log.warn({ code: unknownError.code, requestId: request.id }, "Request rejected");

    const publicCode = error instanceof AppError
      ? error.code
      : unknownError.validation
        ? "VALIDATION_ERROR"
        : safeStatus === 429
          ? "RATE_LIMITED"
          : safeStatus >= 500
            ? "INTERNAL_ERROR"
            : "REQUEST_ERROR";
    const publicMessage = safeStatus >= 500 ? "An internal error occurred." : error instanceof AppError ? error.message : "The request could not be processed.";
    return reply.code(safeStatus).send({ code: publicCode, message: publicMessage, requestId: request.id });
  });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await database.client`select 1`;
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  await registerAuthRoutes(app, { config, database, email, authenticate, tokenService });
  await registerFinanceRoutes(app, { database, authenticate });
  await registerImportRoutes(app, { config, database, authenticate });
  await registerInsightRoutes(app, { database, authenticate });
  await registerProjectRoutes(app, { database, authenticate });
  await registerCurrencyRoutes(app, { database, authenticate });

  app.addHook("onClose", async () => {
    await database.close();
  });

  return app;
}
