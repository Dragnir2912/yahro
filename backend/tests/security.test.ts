import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConfig } from "../src/config.js";
import { createOpaqueToken, hashPassword, hashToken, normalizeEmail, safeEqual, verifyPassword } from "../src/security/crypto.js";
import { hasMinimumRole, requireRole } from "../src/security/authorization.js";
import { createTokenService, parseRefreshToken, serializeRefreshToken } from "../src/security/tokens.js";
import { createRecoveryCodes, decryptTotpSecret, encodeBase32, encryptTotpSecret, hotp, normalizeRecoveryCode, verifyTotp } from "../src/security/totp.js";
import { moneySchema, parseBody, passwordSchema } from "../src/security/validation.js";
import { renderMigrationForCurrentOwner } from "../scripts/migration-content.js";

const baseEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://yahro_app:test@127.0.0.1:5432/yahro",
  JWT_SECRET: "j".repeat(64),
  TOKEN_HASH_PEPPER: "p".repeat(64),
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
  APP_ORIGIN: "http://127.0.0.1:5173",
  PUBLIC_API_ORIGIN: "http://127.0.0.1:4000",
};

describe("configuration security", () => {
  it("adapts legacy migrations to the provider's quoted owner without changing their source", () => {
    const source = "AUTHORIZATION yahro_owner; ALTER DEFAULT PRIVILEGES FOR ROLE yahro_owner;";
    expect(renderMigrationForCurrentOwner(source, '"neondb owner"')).toBe(
      'AUTHORIZATION "neondb owner"; ALTER DEFAULT PRIVILEGES FOR ROLE "neondb owner";',
    );
    expect(source).toContain("yahro_owner");
  });

  it("rejects wildcard CORS origins", () => {
    expect(() => loadConfig({ ...baseEnvironment, APP_ORIGIN: "*" })).toThrow();
  });

  it("rejects placeholder and short secrets", () => {
    expect(() => loadConfig({ ...baseEnvironment, JWT_SECRET: "CHANGE_ME".repeat(8) })).toThrow();
    expect(() => loadConfig({ ...baseEnvironment, TOKEN_HASH_PEPPER: "short" })).toThrow();
  });

  it("accepts only explicit trusted proxy addresses", () => {
    expect(() => loadConfig({ ...baseEnvironment, TRUSTED_PROXIES: "true" })).toThrow();
    expect(() => loadConfig({ ...baseEnvironment, TRUSTED_PROXIES: "10.0.0.0/8,127.0.0.1" })).not.toThrow();
  });

  it("derives the restricted runtime database URL for Render", () => {
    const config = loadConfig({
      ...baseEnvironment,
      DATABASE_URL: undefined,
      DATABASE_MIGRATION_URL: "postgresql://yahro_owner:owner-secret@database.internal:5432/yahro",
      YAHRO_APP_PASSWORD: "runtime-password-that-is-long-enough",
      DEPLOYMENT_PLATFORM: "render",
      HOST: "0.0.0.0",
    });
    const runtimeUrl = new URL(config.databaseUrl);
    expect(runtimeUrl.username).toBe("yahro_app");
    expect(runtimeUrl.password).toBe("runtime-password-that-is-long-enough");
    expect(runtimeUrl.hostname).toBe("database.internal");
    expect(config.deploymentPlatform).toBe("render");
  });

  it("requires Render services to bind on all interfaces", () => {
    expect(() => loadConfig({ ...baseEnvironment, DEPLOYMENT_PLATFORM: "render" })).toThrow();
  });

  it("uses Render's HTTPS address for a single-service deployment", () => {
    const config = loadConfig({
      ...baseEnvironment,
      NODE_ENV: "production",
      DEPLOYMENT_PLATFORM: "render",
      HOST: "0.0.0.0",
      APP_ORIGIN: undefined,
      PUBLIC_API_ORIGIN: undefined,
      RENDER_EXTERNAL_URL: "https://yahro-free.onrender.com",
      SMTP_HOST: "smtp-relay.brevo.com",
      SMTP_PORT: "2525",
      SMTP_USER: "yahro",
      SMTP_PASSWORD: "secret",
      SERVE_FRONTEND: "true",
    });
    expect(config.allowedOrigins).toEqual(["https://yahro-free.onrender.com"]);
    expect(config.publicApiOrigin).toBe("https://yahro-free.onrender.com");
    expect(config.serveFrontend).toBe(true);
  });

  it("requires HTTPS and SMTP in production", () => {
    expect(() => loadConfig({ ...baseEnvironment, NODE_ENV: "production" })).toThrow();
    expect(() =>
      loadConfig({
        ...baseEnvironment,
        NODE_ENV: "production",
        APP_ORIGIN: "https://app.example.com",
        PUBLIC_API_ORIGIN: "https://api.example.com",
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "yahro",
        SMTP_PASSWORD: "secret",
      }),
    ).not.toThrow();
  });
});

describe("password and opaque token protection", () => {
  it("hashes passwords with Argon2id and verifies without exposing the password", async () => {
    const password = "correct horse battery staple";
    const digest = await hashPassword(password);
    expect(digest).toMatch(/^\$argon2id\$/);
    expect(digest).not.toContain(password);
    await expect(verifyPassword(digest, password)).resolves.toBe(true);
    await expect(verifyPassword(digest, "wrong password")).resolves.toBe(false);
  });

  it("creates high entropy tokens and peppered deterministic hashes", () => {
    const tokenA = createOpaqueToken();
    const tokenB = createOpaqueToken();
    expect(tokenA).not.toBe(tokenB);
    expect(tokenA.length).toBeGreaterThanOrEqual(43);
    const digest = hashToken(tokenA, "p".repeat(64));
    expect(digest).toHaveLength(64);
    expect(safeEqual(digest, hashToken(tokenA, "p".repeat(64)))).toBe(true);
    expect(safeEqual(digest, hashToken(tokenA, "q".repeat(64)))).toBe(false);
  });

  it("normalizes international email input consistently", () => {
    expect(normalizeEmail("  USER@Example.COM  ")).toBe("user@example.com");
  });
});

describe("signed access and refresh tokens", () => {
  it("accepts a valid scoped access token and rejects tampering", async () => {
    const service = createTokenService("s".repeat(64), 900);
    const claims = {
      userId: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      role: "OWNER" as const,
      sessionId: crypto.randomUUID(),
      sessionVersion: 1,
      authTime: Math.floor(Date.now() / 1000),
    };
    const token = await service.signAccessToken(claims);
    await expect(service.verifyAccessToken(token)).resolves.toEqual(claims);
    const parts = token.split(".");
    const signature = parts[2]!;
    parts[2] = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    await expect(service.verifyAccessToken(parts.join("."))).rejects.toThrow();
    await expect(createTokenService("x".repeat(64), 900).verifyAccessToken(token)).rejects.toThrow();
  });

  it("parses only the expected refresh token shape", () => {
    const id = crypto.randomUUID();
    const secret = createOpaqueToken();
    expect(parseRefreshToken(serializeRefreshToken(id, secret))).toEqual({ sessionId: id, secret });
    expect(parseRefreshToken(undefined)).toBeNull();
    expect(parseRefreshToken("not-a-token")).toBeNull();
    expect(parseRefreshToken(`${id}.${secret}.extra`)).toBeNull();
  });
});

describe("TOTP multi-factor authentication", () => {
  it("matches the RFC 6238 SHA1 test vector reduced to six digits", () => {
    const secret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
    expect(hotp(secret, 1, 8)).toBe("94287082");
    expect(hotp(secret, 1, 6)).toBe("287082");
  });

  it("accepts only a narrow window and rejects replayed time steps", () => {
    const secret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
    const timestamp = 59_000;
    const code = hotp(secret, 1);
    expect(verifyTotp(secret, code, null, timestamp)).toBe(1);
    expect(verifyTotp(secret, code, 1, timestamp)).toBeNull();
    expect(verifyTotp(secret, "000000", null, timestamp)).toBeNull();
  });

  it("encrypts authenticator secrets with authenticated encryption", () => {
    const key = Buffer.alloc(32, 19).toString("base64url");
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptTotpSecret(encrypted, key)).toBe("JBSWY3DPEHPK3PXP");
    const parts = encrypted.split(".");
    const ciphertext = parts[2]!;
    parts[2] = `${ciphertext[0] === "a" ? "b" : "a"}${ciphertext.slice(1)}`;
    expect(() => decryptTotpSecret(parts.join("."), key)).toThrow();
  });

  it("creates normalized high entropy recovery codes", () => {
    const codes = createRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/.test(code))).toBe(true);
    expect(normalizeRecoveryCode(codes[0]!.toLowerCase())).toBe(codes[0]!.replaceAll("-", ""));
  });
});

describe("authorization and request validation", () => {
  it("enforces the role hierarchy", () => {
    expect(hasMinimumRole("OWNER", "ADMIN")).toBe(true);
    expect(hasMinimumRole("VIEWER", "MEMBER")).toBe(false);
    expect(() => requireRole("VIEWER", "MEMBER")).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("rejects weak passwords, invalid money and unknown fields", () => {
    expect(passwordSchema.safeParse("too-short").success).toBe(false);
    expect(moneySchema.safeParse("-1").success).toBe(false);
    expect(moneySchema.safeParse("12.3456").success).toBe(true);
    const schema = z.object({ expected: z.string() }).strict();
    expect(() => parseBody(schema, { expected: "ok", injected: true })).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });
});
