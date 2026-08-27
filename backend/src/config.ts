import { z } from "zod";
import { isIP } from "node:net";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalString = z.string().trim().optional().transform((value) => value || undefined);

const trustedProxyList = optionalString.refine((value) => {
  if (!value) return true;
  return value.split(",").every((entry) => {
    const [address, prefix, ...rest] = entry.trim().split("/");
    const version = isIP(address ?? "");
    if (rest.length > 0 || version === 0) return false;
    if (prefix === undefined) return true;
    if (!/^\d+$/.test(prefix)) return false;
    const bits = Number(prefix);
    return bits >= 0 && bits <= (version === 4 ? 32 : 128);
  });
}, "TRUSTED_PROXIES must contain only explicit IP addresses or CIDR ranges");

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEPLOYMENT_PLATFORM: z.enum(["local", "render"]).default("local"),
    HOST: z.string().trim().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().url().optional(),
    DATABASE_MIGRATION_URL: z.string().url().optional(),
    YAHRO_APP_PASSWORD: z.string().min(32).optional(),
    JWT_SECRET: z.string().min(64).refine((value) => !value.includes("CHANGE_ME"), "JWT_SECRET must be replaced"),
    TOKEN_HASH_PEPPER: z.string().min(64).refine((value) => !value.includes("CHANGE_ME"), "TOKEN_HASH_PEPPER must be replaced"),
    MFA_ENCRYPTION_KEY: z
      .string()
      .refine((value) => {
        try {
          return Buffer.from(value, "base64url").length === 32;
        } catch {
          return false;
        }
      }, "MFA_ENCRYPTION_KEY must be a base64url encoded 32 byte key"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(60 * 60 * 24 * 90).default(60 * 60 * 24 * 30),
    REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(1).max(30).default(5),
    EMAIL_TOKEN_TTL_SECONDS: z.coerce.number().int().min(900).max(60 * 60 * 48).default(60 * 60 * 24),
    PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().min(600).max(3600).default(1800),
    APP_ORIGIN: z.string().min(1),
    PUBLIC_API_ORIGIN: z.string().url(),
    TRUSTED_PROXIES: trustedProxyList,
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleanFromString,
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_FROM: z.string().trim().default("Yahro <no-reply@example.invalid>"),
    DEV_EMAIL_CAPTURE_DIR: z.string().trim().default(".dev-mail"),
    SERVE_FRONTEND: booleanFromString,
    FRONTEND_DIST_PATH: z.string().trim().default("../dist"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(5 * 1024 * 1024),
    MAX_CSV_ROWS: z.coerce.number().int().min(1).max(100_000).default(10_000),
  })
  .superRefine((value, context) => {
    const origins = value.APP_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
    if (!value.DATABASE_URL && !(value.DEPLOYMENT_PLATFORM === "render" && value.DATABASE_MIGRATION_URL && value.YAHRO_APP_PASSWORD)) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required unless Render derives it from the migration URL and the application role password",
      });
    }
    if (origins.includes("*")) {
      context.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "Wildcard origins are forbidden" });
    }
    if (value.DEPLOYMENT_PLATFORM === "render" && value.HOST !== "0.0.0.0") {
      context.addIssue({ code: "custom", path: ["HOST"], message: "Render services must bind to 0.0.0.0" });
    }
    if (value.NODE_ENV === "production") {
      if (origins.some((origin) => !origin.startsWith("https://"))) {
        context.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "Production origins must use HTTPS" });
      }
      if (!value.PUBLIC_API_ORIGIN.startsWith("https://")) {
        context.addIssue({ code: "custom", path: ["PUBLIC_API_ORIGIN"], message: "Production API origin must use HTTPS" });
      }
      if (!value.SMTP_HOST || !value.SMTP_USER || !value.SMTP_PASSWORD) {
        context.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "SMTP is required in production" });
      }
    }
  });

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const renderExternalUrl = environment.DEPLOYMENT_PLATFORM === "render" ? environment.RENDER_EXTERNAL_URL : undefined;
  const parsed = environmentSchema.parse({
    ...environment,
    APP_ORIGIN: environment.APP_ORIGIN || renderExternalUrl,
    PUBLIC_API_ORIGIN: environment.PUBLIC_API_ORIGIN || renderExternalUrl,
  });
  const databaseUrl = parsed.DATABASE_URL ?? (() => {
    const derived = new URL(parsed.DATABASE_MIGRATION_URL!);
    derived.username = "yahro_app";
    derived.password = parsed.YAHRO_APP_PASSWORD!;
    return derived.toString();
  })();
  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === "production",
    deploymentPlatform: parsed.DEPLOYMENT_PLATFORM,
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl,
    jwtSecret: parsed.JWT_SECRET,
    tokenHashPepper: parsed.TOKEN_HASH_PEPPER,
    mfaEncryptionKey: parsed.MFA_ENCRYPTION_KEY,
    accessTokenTtlSeconds: parsed.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: parsed.REFRESH_TOKEN_TTL_SECONDS,
    refreshReuseGraceSeconds: parsed.REFRESH_REUSE_GRACE_SECONDS,
    emailTokenTtlSeconds: parsed.EMAIL_TOKEN_TTL_SECONDS,
    passwordResetTtlSeconds: parsed.PASSWORD_RESET_TTL_SECONDS,
    allowedOrigins: parsed.APP_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
    publicApiOrigin: parsed.PUBLIC_API_ORIGIN,
    trustedProxies: parsed.TRUSTED_PROXIES?.split(",").map((proxy) => proxy.trim()).filter(Boolean) ?? [],
    smtp: parsed.SMTP_HOST
      ? {
          host: parsed.SMTP_HOST,
          port: parsed.SMTP_PORT,
          secure: parsed.SMTP_SECURE,
          user: parsed.SMTP_USER,
          password: parsed.SMTP_PASSWORD,
          from: parsed.SMTP_FROM,
        }
      : undefined,
    devEmailCaptureDirectory: parsed.DEV_EMAIL_CAPTURE_DIR,
    serveFrontend: parsed.SERVE_FRONTEND,
    frontendDistPath: parsed.FRONTEND_DIST_PATH,
    logLevel: parsed.LOG_LEVEL,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    maxCsvRows: parsed.MAX_CSV_ROWS,
  } as const;
}
