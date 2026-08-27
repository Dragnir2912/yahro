import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fileTypeFromBuffer } from "file-type";
import { ulid } from "ulid";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import {
  auditLogs,
  categories,
  memberships,
  mfaChallenges,
  mfaRecoveryCodes,
  oneTimeTokens,
  refreshSessions,
  tenants,
  users,
} from "../db/schema.js";
import { AppError, unauthorized } from "../lib/errors.js";
import type { EmailService } from "../services/email.js";
import { hashPassword, hashToken, createOpaqueToken, normalizeEmail, safeEqual, verifyPassword } from "../security/crypto.js";
import type { AuthContext } from "../security/authentication.js";
import { assertTrustedOrigin } from "../security/origin.js";
import {
  createTokenService,
  parseRefreshToken,
  serializeRefreshToken,
  type MembershipRole,
  type TokenService,
} from "../security/tokens.js";
import { emailSchema, parseBody, passwordSchema } from "../security/validation.js";
import {
  createOtpAuthUri,
  createRecoveryCodes,
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  normalizeRecoveryCode,
  verifyTotp,
} from "../security/totp.js";

const termsVersion = "2026-08-19";
const privacyVersion = "2026-08-19";
const identityNameSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .transform((value) => value.normalize("NFKC").replace(/\s+/g, " "))
    .refine((value) => !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    }), "Control characters are not allowed");

const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: z.string().min(1).max(128),
    firstName: identityNameSchema(80),
    lastName: identityNameSchema(80),
    nickname: identityNameSchema(40),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    locale: z.enum(["fr", "en"]).default("fr"),
    timezone: z.string().trim().min(1).max(64).default("Africa/Abidjan"),
    currency: z.string().regex(/^[A-Z]{3}$/).default("XOF"),
    acceptTerms: z.literal(true),
    acceptPrivacy: z.literal(true),
  })
  .strict()
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match",
  });

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
const emailOnlySchema = z.object({ email: emailSchema }).strict();
const tokenOnlySchema = z.object({ token: z.string().min(32).max(512) }).strict();
const resetPasswordSchema = tokenOnlySchema.extend({ password: passwordSchema }).strict();
const mfaCodeSchema = z.string().trim().min(6).max(32);
const mfaVerifySchema = z.object({ mfaToken: z.string().min(32).max(512), code: mfaCodeSchema }).strict();
const passwordConfirmationSchema = z.object({ currentPassword: z.string().min(1).max(128) }).strict();
const mfaConfirmSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
const mfaDisableSchema = passwordConfirmationSchema.extend({ code: mfaCodeSchema }).strict();
const avatarKeys = ["sage", "ocean", "sunset", "violet", "sand", "rose", "forest", "sky"] as const;
const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema, mfaCode: mfaCodeSchema.optional() })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "The new password must be different",
  });
const profileSchema = z
  .object({
    firstName: identityNameSchema(80).optional(),
    lastName: identityNameSchema(80).optional(),
    nickname: identityNameSchema(40).optional(),
    avatarKey: z.enum(avatarKeys).nullable().optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
    locale: z.enum(["fr", "en"]).optional(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }, "Invalid timezone")
      .optional(),
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

interface AuthLookup {
  id: string;
  email: string;
  passwordHash: string;
  nickname: string;
  status: "PENDING" | "ACTIVE" | "LOCKED" | "DELETED";
  emailVerifiedAt: Date | string | null;
  sessionVersion: number;
  failedLoginCount: number;
  lockedUntil: Date | string | null;
  tenantId: string | null;
  role: MembershipRole | null;
}

interface RefreshLookup {
  id: string;
  familyId: string;
  userId: string;
  tenantId: string;
  tokenHash: string;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
  revokeReason: string | null;
  issuedSessionVersion: number;
  currentSessionVersion: number;
  authenticatedAt: Date | string;
  status: "PENDING" | "ACTIVE" | "LOCKED" | "DELETED";
  role: MembershipRole;
}

interface OneTimeLookup {
  id: string;
  userId: string;
  tenantId: string | null;
  expiresAt: Date | string;
  consumedAt: Date | string | null;
}

interface MfaChallengeLookup {
  id: string;
  userId: string;
  tenantId: string;
  attempts: number;
  expiresAt: Date | string;
  consumedAt: Date | string | null;
  totpSecretEncrypted: string;
  totpLastUsedStep: number | null;
  sessionVersion: number;
  role: MembershipRole;
}

function databaseTimestamp(value: Date | string, field: string) {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`Invalid database timestamp for ${field}`);
  }
  return timestamp;
}

function nullableDatabaseTimestamp(value: Date | string | null, field: string) {
  return value === null ? null : databaseTimestamp(value, field);
}

interface AuthRouteDependencies {
  config: AppConfig;
  database: Database;
  email: EmailService;
  authenticate: (request: FastifyRequest) => Promise<AuthContext>;
  tokenService?: TokenService;
}

const defaultCategoryFamilies = [
  ["income.employment", "Emploi", "INCOME", "#769450", "briefcase-business"],
  ["income.business", "Activité professionnelle", "INCOME", "#5F8D7A", "store"],
  ["income.investments", "Placements", "INCOME", "#7799A6", "chart-no-axes-combined"],
  ["income.support", "Aides et transferts reçus", "INCOME", "#9A8DB5", "hand-helping"],
  ["income.exceptional", "Entrées exceptionnelles", "INCOME", "#B58B4D", "badge-plus"],
  ["expense.housing", "Logement et services", "EXPENSE", "#8D7B68", "house"],
  ["expense.food", "Alimentation", "EXPENSE", "#DDA75B", "shopping-basket"],
  ["expense.transport", "Transport", "EXPENSE", "#7799A6", "car"],
  ["expense.health", "Santé et bien-être", "EXPENSE", "#C77C72", "heart-pulse"],
  ["expense.family", "Famille et vie personnelle", "EXPENSE", "#B78383", "users"],
  ["expense.education", "Éducation et activité professionnelle", "EXPENSE", "#6F8E9D", "graduation-cap"],
  ["expense.leisure", "Loisirs et mode de vie", "EXPENSE", "#A786A5", "sparkles"],
  ["expense.financial", "Obligations financières", "EXPENSE", "#9B7653", "landmark"],
  ["expense.solidarity", "Dons et solidarité", "EXPENSE", "#A37D91", "hand-heart"],
  ["expense.projects", "Projets et dépenses exceptionnelles", "EXPENSE", "#758F62", "folder-kanban"],
] as const;

const defaultCategoryPosts = [
  ["income.employment", "income.employment.salary", "Salaire principal", "banknote"],
  ["income.employment", "income.employment.bonus", "Prime et avantage", "award"],
  ["income.business", "income.business.sales", "Vente", "shopping-bag"],
  ["income.business", "income.business.fees", "Honoraires et mission", "file-text"],
  ["income.investments", "income.investments.interest", "Intérêts", "percent"],
  ["income.investments", "income.investments.dividend", "Dividendes", "trending-up"],
  ["income.support", "income.support.aid", "Aide et allocation", "life-buoy"],
  ["income.support", "income.support.refund", "Remboursement reçu", "rotate-ccw"],
  ["income.exceptional", "income.exceptional.gift", "Cadeau reçu", "package-open"],
  ["income.exceptional", "income.exceptional.sale", "Revente personnelle", "tag"],
  ["expense.housing", "expense.housing.rent", "Loyer ou mensualité", "key-round"],
  ["expense.housing", "expense.housing.utilities", "Services et factures", "zap"],
  ["expense.housing", "expense.housing.maintenance", "Entretien du logement", "hammer"],
  ["expense.food", "expense.food.groceries", "Courses alimentaires", "shopping-cart"],
  ["expense.food", "expense.food.dining", "Restaurant", "utensils"],
  ["expense.transport", "expense.transport.public", "Transport en commun", "bus-front"],
  ["expense.transport", "expense.transport.fuel", "Carburant", "fuel"],
  ["expense.transport", "expense.transport.taxi", "Taxi et transport avec chauffeur", "car-taxi-front"],
  ["expense.health", "expense.health.care", "Consultation et soins", "stethoscope"],
  ["expense.health", "expense.health.pharmacy", "Pharmacie", "pill"],
  ["expense.health", "expense.health.sport", "Sport et bien-être", "dumbbell"],
  ["expense.family", "expense.family.children", "Enfant et garde", "baby"],
  ["expense.family", "expense.family.clothing", "Vêtement", "shirt"],
  ["expense.education", "expense.education.tuition", "Scolarité et formation", "school"],
  ["expense.education", "expense.education.tools", "Outil professionnel", "briefcase"],
  ["expense.leisure", "expense.leisure.outings", "Sortie et événement", "ticket"],
  ["expense.leisure", "expense.leisure.subscriptions", "Abonnement de loisir", "tv"],
  ["expense.leisure", "expense.leisure.travel", "Voyage et vacances", "plane"],
  ["expense.financial", "expense.financial.taxes", "Impôt et taxe", "scroll-text"],
  ["expense.financial", "expense.financial.loans", "Crédit et dette", "credit-card"],
  ["expense.financial", "expense.financial.fees", "Frais bancaire", "receipt"],
  ["expense.solidarity", "expense.solidarity.gifts", "Cadeau offert", "gift"],
  ["expense.solidarity", "expense.solidarity.family", "Soutien à un proche", "hand-coins"],
  ["expense.projects", "expense.projects.events", "Événement personnel", "party-popper"],
  ["expense.projects", "expense.projects.unplanned", "Imprévu", "triangle-alert"],
] as const;

function cookieName(config: AppConfig) {
  return config.isProduction ? "__Host-yahro_refresh" : "yahro_refresh";
}

function setRefreshCookie(reply: FastifyReply, config: AppConfig, value: string) {
  reply.setCookie(cookieName(config), value, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: config.refreshTokenTtlSeconds,
  });
}

function clearRefreshCookie(reply: FastifyReply, config: AppConfig) {
  reply.clearCookie(cookieName(config), {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    path: "/",
  });
}

function slugify(value: string) {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base || "space"}-${ulid().toLowerCase()}`;
}

async function waitForPublicAuthResponse(startedAt: number, minimumMilliseconds: number) {
  const jitter = Math.floor(Math.random() * 75);
  const remaining = minimumMilliseconds + jitter - (performance.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

export async function registerAuthRoutes(app: FastifyInstance, dependencies: AuthRouteDependencies) {
  const { config, database, email, authenticate } = dependencies;
  const tokens = dependencies.tokenService ?? createTokenService(config.jwtSecret, config.accessTokenTtlSeconds);
  const dummyHash = await hashPassword(createOpaqueToken(24));

  async function lookupUser(emailAddress: string) {
    const [record] = await database.client<AuthLookup[]>`
      select * from private.lookup_user_for_auth(${normalizeEmail(emailAddress)})
    `;
    return record
      ? {
          ...record,
          emailVerifiedAt: nullableDatabaseTimestamp(record.emailVerifiedAt, "auth.emailVerifiedAt"),
          lockedUntil: nullableDatabaseTimestamp(record.lockedUntil, "auth.lockedUntil"),
        }
      : undefined;
  }

  async function recordLoginFailure(user: AuthLookup, request: FastifyRequest) {
    if (!user.tenantId || user.status === "DELETED") return;
    await database.withSecurityContext({ userId: user.id, tenantId: user.tenantId }, async (transaction) => {
      await transaction
        .update(users)
        .set({
          failedLoginCount: sql`least(${users.failedLoginCount} + 1, 1000)`,
          lockedUntil: sql`case
            when ${users.failedLoginCount} + 1 >= 9 then now() + interval '60 minutes'
            when ${users.failedLoginCount} + 1 = 8 then now() + interval '30 minutes'
            when ${users.failedLoginCount} + 1 = 7 then now() + interval '15 minutes'
            when ${users.failedLoginCount} + 1 = 6 then now() + interval '5 minutes'
            when ${users.failedLoginCount} + 1 = 5 then now() + interval '1 minute'
            else ${users.lockedUntil}
          end`,
        })
        .where(eq(users.id, user.id));
      await transaction.insert(auditLogs).values({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "AUTH_LOGIN_FAILURE",
        entityType: "user",
        entityId: user.id,
        requestId: request.id,
        ipHash: hashToken(request.ip, config.tokenHashPepper),
      });
    });
  }

  async function clearLoginFailures(user: AuthLookup) {
    if (!user.tenantId || (user.failedLoginCount === 0 && !user.lockedUntil)) return;
    await database.withSecurityContext({ userId: user.id, tenantId: user.tenantId }, async (transaction) => {
      await transaction.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
    });
  }

  async function resendVerificationEmail(user: AuthLookup, request: FastifyRequest) {
    if (!user.tenantId || user.status !== "PENDING" || user.emailVerifiedAt) return;
    const rawToken = createOpaqueToken();
    await database.withSecurityContext({ userId: user.id, tenantId: user.tenantId }, async (transaction) => {
      await transaction
        .update(oneTimeTokens)
        .set({ consumedAt: new Date() })
        .where(and(eq(oneTimeTokens.userId, user.id), eq(oneTimeTokens.purpose, "VERIFY_EMAIL"), isNull(oneTimeTokens.consumedAt)));
      await transaction.insert(oneTimeTokens).values({
        userId: user.id,
        purpose: "VERIFY_EMAIL",
        tokenHash: hashToken(rawToken, config.tokenHashPepper),
        expiresAt: new Date(Date.now() + config.emailTokenTtlSeconds * 1000),
      });
      await transaction.insert(auditLogs).values({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "AUTH_EMAIL_VERIFICATION_RESENT",
        entityType: "user",
        entityId: user.id,
        requestId: request.id,
        ipHash: hashToken(request.ip, config.tokenHashPepper),
      });
    });
    await email.sendVerification(user.email, rawToken);
  }

  async function sendRelevantRegistrationEmail(user: AuthLookup, request: FastifyRequest) {
    if (user.status === "PENDING" && !user.emailVerifiedAt) {
      await resendVerificationEmail(user, request);
      return;
    }
    if (!user.tenantId || (user.status !== "ACTIVE" && user.status !== "LOCKED")) return;
    await email.sendAccountExists(user.email);
    await database.withSecurityContext({ userId: user.id, tenantId: user.tenantId }, async (transaction) => {
      await transaction.insert(auditLogs).values({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "AUTH_EXISTING_ACCOUNT_NOTICE_SENT",
        entityType: "user",
        entityId: user.id,
        requestId: request.id,
        ipHash: hashToken(request.ip, config.tokenHashPepper),
      });
    });
  }

  async function lookupMfaChallenge(rawToken: string) {
    const challengeHash = hashToken(rawToken, config.tokenHashPepper);
    const [record] = await database.client<MfaChallengeLookup[]>`
      select * from private.lookup_mfa_challenge(${challengeHash})
    `;
    return record
      ? {
          ...record,
          expiresAt: databaseTimestamp(record.expiresAt, "mfaChallenge.expiresAt"),
          consumedAt: nullableDatabaseTimestamp(record.consumedAt, "mfaChallenge.consumedAt"),
        }
      : undefined;
  }

  async function recordMfaFailure(record: MfaChallengeLookup, request: FastifyRequest) {
    await database.withSecurityContext({ userId: record.userId, tenantId: record.tenantId }, async (transaction) => {
      await transaction
        .update(mfaChallenges)
        .set({ attempts: sql`least(${mfaChallenges.attempts} + 1, 5)` })
        .where(and(eq(mfaChallenges.id, record.id), isNull(mfaChallenges.consumedAt), lt(mfaChallenges.attempts, 5)));
      await transaction.insert(auditLogs).values({
        tenantId: record.tenantId,
        actorUserId: record.userId,
        action: "AUTH_MFA_CHALLENGE_FAILED",
        entityType: "mfa_challenge",
        entityId: record.id,
        requestId: request.id,
        ipHash: hashToken(request.ip, config.tokenHashPepper),
      });
    });
  }

  async function consumeMfaChallenge(record: MfaChallengeLookup, suppliedCode: string, request: FastifyRequest) {
    let matchedStep: number | null = null;
    let recoveryHash: string | null = null;
    if (/^\d{6}$/.test(suppliedCode)) {
      const secret = decryptTotpSecret(record.totpSecretEncrypted, config.mfaEncryptionKey);
      matchedStep = verifyTotp(secret, suppliedCode, record.totpLastUsedStep);
      if (matchedStep === null) {
        await recordMfaFailure(record, request);
        return false;
      }
    } else {
      const normalized = normalizeRecoveryCode(suppliedCode);
      if (normalized.length !== 16) {
        await recordMfaFailure(record, request);
        return false;
      }
      recoveryHash = hashToken(normalized, config.tokenHashPepper);
    }

    try {
      return await database.withSecurityContext({ userId: record.userId, tenantId: record.tenantId }, async (transaction) => {
        const consumed = await transaction
          .update(mfaChallenges)
          .set({ consumedAt: new Date() })
          .where(and(eq(mfaChallenges.id, record.id), isNull(mfaChallenges.consumedAt), lt(mfaChallenges.attempts, 5)))
          .returning({ id: mfaChallenges.id });
        if (consumed.length !== 1) return false;

        if (matchedStep !== null) {
          const updated = await transaction
            .update(users)
            .set({ totpLastUsedStep: matchedStep })
            .where(and(eq(users.id, record.userId), or(isNull(users.totpLastUsedStep), lt(users.totpLastUsedStep, matchedStep))))
            .returning({ id: users.id });
          if (updated.length !== 1) throw unauthorized();
        } else if (recoveryHash) {
          const used = await transaction
            .update(mfaRecoveryCodes)
            .set({ usedAt: new Date() })
            .where(and(eq(mfaRecoveryCodes.userId, record.userId), eq(mfaRecoveryCodes.codeHash, recoveryHash), isNull(mfaRecoveryCodes.usedAt)))
            .returning({ id: mfaRecoveryCodes.id });
          if (used.length !== 1) throw unauthorized();
        }

        await transaction.insert(auditLogs).values({
          tenantId: record.tenantId,
          actorUserId: record.userId,
          action: recoveryHash ? "AUTH_MFA_RECOVERY_USED" : "AUTH_MFA_VERIFIED",
          entityType: "mfa_challenge",
          entityId: record.id,
          requestId: request.id,
          ipHash: hashToken(request.ip, config.tokenHashPepper),
        });
        return true;
      });
    } catch {
      await recordMfaFailure(record, request);
      return false;
    }
  }

  async function issueSession(
    user: { id: string; tenantId: string; role: MembershipRole; sessionVersion: number },
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const secret = createOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.refreshTokenTtlSeconds * 1000);

    await database.withSecurityContext({ userId: user.id, tenantId: user.tenantId }, async (transaction) => {
      await transaction.insert(refreshSessions).values({
        id: sessionId,
        familyId,
        userId: user.id,
        tenantId: user.tenantId,
        tokenHash: hashToken(secret, config.tokenHashPepper),
        userAgentHash: hashToken(request.headers["user-agent"] ?? "unknown", config.tokenHashPepper),
        ipHash: hashToken(request.ip, config.tokenHashPepper),
        expiresAt,
        sessionVersion: user.sessionVersion,
        authenticatedAt: now,
      });
      await transaction.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
      await transaction.insert(auditLogs).values({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "AUTH_LOGIN_SUCCESS",
        entityType: "refresh_session",
        entityId: sessionId,
        requestId: request.id,
        ipHash: hashToken(request.ip, config.tokenHashPepper),
      });
    });

    const accessToken = await tokens.signAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      sessionId,
      sessionVersion: user.sessionVersion,
      authTime: Math.floor(now.getTime() / 1000),
    });
    setRefreshCookie(reply, config, serializeRefreshToken(sessionId, secret));
    return accessToken;
  }

  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const responseStartedAt = performance.now();
      const input = parseBody(registerSchema, request.body);
      const existing = await lookupUser(input.email);
      const passwordHash = await hashPassword(input.password);

      if (existing) {
        await sendRelevantRegistrationEmail(existing, request);
        await waitForPublicAuthResponse(responseStartedAt, 500);
        return reply.code(202).send({ message: "If the address can be registered, a confirmation email will be sent." });
      }

      const userId = randomUUID();
      const tenantId = randomUUID();
      const rawToken = createOpaqueToken();
      const tokenHash = hashToken(rawToken, config.tokenHashPepper);

      try {
        await database.withSecurityContext({ userId, tenantId }, async (transaction) => {
          await transaction.insert(users).values({
            id: userId,
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            nickname: input.nickname,
            countryCode: input.countryCode,
            locale: input.locale,
            timezone: input.timezone,
            defaultCurrency: input.currency,
            termsAcceptedAt: new Date(),
            privacyAcceptedAt: new Date(),
            termsVersion,
            privacyVersion,
          });
          await transaction.insert(tenants).values({
            id: tenantId,
            name: input.locale === "fr" ? `Espace de ${input.nickname}` : `${input.nickname}'s space`,
            slug: slugify(input.nickname),
            baseCurrency: input.currency,
            locale: input.locale,
            timezone: input.timezone,
          });
          await transaction.insert(memberships).values({ tenantId, userId, role: "OWNER" });
          const familyRows = await transaction
            .insert(categories)
            .values(
              defaultCategoryFamilies.map(([systemKey, name, type, color, icon], index) => ({
                tenantId,
                name,
                type,
                color,
                icon,
                level: 1,
                systemKey,
                sortOrder: (index + 1) * 10,
                isSystem: true,
              })),
            )
            .returning({ id: categories.id, systemKey: categories.systemKey, type: categories.type, color: categories.color, icon: categories.icon });
          const familiesByKey = new Map(familyRows.map((family) => [family.systemKey, family]));
          await transaction.insert(categories).values(
            defaultCategoryPosts.flatMap(([parentKey, systemKey, name, icon], index) => {
              const family = familiesByKey.get(parentKey);
              if (!family) return [];
              return [{
                tenantId,
                parentId: family.id,
                name,
                type: family.type,
                color: family.color,
                icon,
                level: 2,
                systemKey,
                sortOrder: (index + 1) * 10,
                isSystem: true,
              }];
            }),
          );
          await transaction.insert(oneTimeTokens).values({
            userId,
            purpose: "VERIFY_EMAIL",
            tokenHash,
            expiresAt: new Date(Date.now() + config.emailTokenTtlSeconds * 1000),
          });
          await transaction.insert(auditLogs).values({
            tenantId,
            actorUserId: userId,
            action: "AUTH_REGISTER",
            entityType: "user",
            entityId: userId,
            requestId: request.id,
            ipHash: hashToken(request.ip, config.tokenHashPepper),
          });
        });
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          await waitForPublicAuthResponse(responseStartedAt, 500);
          return reply.code(202).send({ message: "If the address can be registered, a confirmation email will be sent." });
        }
        throw error;
      }

      await email.sendVerification(input.email, rawToken);
      await waitForPublicAuthResponse(responseStartedAt, 500);
      return reply.code(202).send({ message: "If the address can be registered, a confirmation email will be sent." });
    },
  );

  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const responseStartedAt = performance.now();
      const input = parseBody(loginSchema, request.body);
      const user = await lookupUser(input.email);
      const passwordValid = await verifyPassword(user?.passwordHash ?? dummyHash, input.password).catch(() => false);

      if (!user || !passwordValid) {
        if (user) await recordLoginFailure(user, request);
        await waitForPublicAuthResponse(responseStartedAt, 200);
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
      }
      if (user.status === "LOCKED" || user.status === "DELETED" || !user.tenantId || !user.role) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AppError(429, "ACCOUNT_TEMPORARILY_LOCKED", "Too many failed attempts. Please try again later.");
      }
      if (!user.emailVerifiedAt || user.status === "PENDING") {
        throw new AppError(403, "EMAIL_NOT_VERIFIED", "Email confirmation is required");
      }
      await clearLoginFailures(user);

      const [mfaStatus] = await database.client<{ enabled: boolean }[]>`
        select private.user_mfa_enabled(${user.id}::uuid) as enabled
      `;
      if (mfaStatus?.enabled) {
        const rawMfaToken = createOpaqueToken();
        await database.withSecurityContext({ userId: user.id, tenantId: user.tenantId }, async (transaction) => {
          await transaction.delete(mfaChallenges).where(eq(mfaChallenges.userId, user.id));
          await transaction.insert(mfaChallenges).values({
            userId: user.id,
            tenantId: user.tenantId!,
            tokenHash: hashToken(rawMfaToken, config.tokenHashPepper),
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          });
        });
        return reply.code(202).send({ mfaRequired: true, mfaToken: rawMfaToken, expiresIn: 300 });
      }

      const accessToken = await issueSession(
        { id: user.id, tenantId: user.tenantId, role: user.role, sessionVersion: user.sessionVersion },
        request,
        reply,
      );
      return {
        accessToken,
        expiresIn: config.accessTokenTtlSeconds,
        user: { id: user.id, email: user.email, nickname: user.nickname },
        tenant: { id: user.tenantId, role: user.role },
      };
    },
  );

  app.post(
    "/api/auth/mfa/verify",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = parseBody(mfaVerifySchema, request.body);
      const challenge = await lookupMfaChallenge(input.mfaToken);
      if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
        throw new AppError(401, "INVALID_MFA_CODE", "Invalid or expired verification code");
      }
      if (!(await consumeMfaChallenge(challenge, input.code, request))) {
        throw new AppError(401, "INVALID_MFA_CODE", "Invalid or expired verification code");
      }
      const accessToken = await issueSession(
        {
          id: challenge.userId,
          tenantId: challenge.tenantId,
          role: challenge.role,
          sessionVersion: challenge.sessionVersion,
        },
        request,
        reply,
      );
      return { accessToken, expiresIn: config.accessTokenTtlSeconds };
    },
  );

  app.post("/api/auth/refresh", async (request, reply) => {
    assertTrustedOrigin(request, config);
    const parsed = parseRefreshToken(request.cookies[cookieName(config)]);
    if (!parsed) throw unauthorized();

    const [session] = await database.client<RefreshLookup[]>`
      select * from private.lookup_refresh_session(${parsed.sessionId}::uuid)
    `;
    if (!session) throw unauthorized();

    const sessionExpiresAt = databaseTimestamp(session.expiresAt, "refreshSession.expiresAt");
    const sessionRevokedAt = nullableDatabaseTimestamp(session.revokedAt, "refreshSession.revokedAt");
    const sessionAuthenticatedAt = databaseTimestamp(session.authenticatedAt, "refreshSession.authenticatedAt");

    const suppliedHash = hashToken(parsed.secret, config.tokenHashPepper);
    if (!safeEqual(session.tokenHash, suppliedHash)) throw unauthorized();

    if (sessionRevokedAt) {
      const rotatedWithinGrace = session.revokeReason === "ROTATED"
        && Date.now() - sessionRevokedAt.getTime() <= config.refreshReuseGraceSeconds * 1000;
      if (rotatedWithinGrace) {
        throw new AppError(409, "REFRESH_RETRY", "A concurrent refresh completed. Retry with the current cookie.");
      }
      await database.withSecurityContext({ userId: session.userId, tenantId: session.tenantId }, async (transaction) => {
        await transaction
          .update(refreshSessions)
          .set({ revokedAt: new Date(), revokeReason: "REUSE_DETECTED" })
          .where(and(eq(refreshSessions.familyId, session.familyId), isNull(refreshSessions.revokedAt)));
        await transaction.insert(auditLogs).values({
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: "AUTH_REFRESH_REUSE_DETECTED",
          entityType: "refresh_session",
          entityId: session.id,
          requestId: request.id,
          ipHash: hashToken(request.ip, config.tokenHashPepper),
        });
      });
      clearRefreshCookie(reply, config);
      throw unauthorized();
    }

    if (
      sessionExpiresAt <= new Date() ||
      session.status !== "ACTIVE" ||
      session.issuedSessionVersion !== session.currentSessionVersion
    ) {
      clearRefreshCookie(reply, config);
      throw unauthorized();
    }

    const nextSessionId = randomUUID();
    const nextSecret = createOpaqueToken();
    const nextExpiry = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);

    await database.withSecurityContext({ userId: session.userId, tenantId: session.tenantId }, async (transaction) => {
      const replaced = await transaction
        .update(refreshSessions)
        .set({ revokedAt: new Date(), revokeReason: "ROTATED", replacedById: nextSessionId, lastUsedAt: new Date() })
        .where(and(eq(refreshSessions.id, session.id), isNull(refreshSessions.revokedAt)))
        .returning({ id: refreshSessions.id });
      if (replaced.length !== 1) throw unauthorized();
      await transaction.insert(refreshSessions).values({
        id: nextSessionId,
        familyId: session.familyId,
        userId: session.userId,
        tenantId: session.tenantId,
        tokenHash: hashToken(nextSecret, config.tokenHashPepper),
        userAgentHash: hashToken(request.headers["user-agent"] ?? "unknown", config.tokenHashPepper),
        ipHash: hashToken(request.ip, config.tokenHashPepper),
        expiresAt: nextExpiry,
        sessionVersion: session.currentSessionVersion,
        authenticatedAt: sessionAuthenticatedAt,
      });
    });

    const accessToken = await tokens.signAccessToken({
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
      sessionId: nextSessionId,
      sessionVersion: session.currentSessionVersion,
      authTime: Math.floor(sessionAuthenticatedAt.getTime() / 1000),
    });
    setRefreshCookie(reply, config, serializeRefreshToken(nextSessionId, nextSecret));
    return { accessToken, expiresIn: config.accessTokenTtlSeconds };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    assertTrustedOrigin(request, config);
    const parsed = parseRefreshToken(request.cookies[cookieName(config)]);
    clearRefreshCookie(reply, config);
    if (!parsed) return reply.code(204).send();

    const [session] = await database.client<RefreshLookup[]>`
      select * from private.lookup_refresh_session(${parsed.sessionId}::uuid)
    `;
    if (session && safeEqual(session.tokenHash, hashToken(parsed.secret, config.tokenHashPepper))) {
      await database.withSecurityContext({ userId: session.userId, tenantId: session.tenantId }, async (transaction) => {
        await transaction
          .update(refreshSessions)
          .set({ revokedAt: new Date(), revokeReason: "LOGOUT" })
          .where(and(eq(refreshSessions.id, session.id), isNull(refreshSessions.revokedAt)));
      });
    }
    return reply.code(204).send();
  });

  app.post("/api/auth/verify-email", async (request, reply) => {
    const input = parseBody(tokenOnlySchema, request.body);
    const tokenHash = hashToken(input.token, config.tokenHashPepper);
    const [record] = await database.client<OneTimeLookup[]>`
      select * from private.lookup_one_time_token(${tokenHash}, 'VERIFY_EMAIL')
    `;
    if (
      !record ||
      !record.tenantId ||
      nullableDatabaseTimestamp(record.consumedAt, "oneTimeToken.consumedAt") ||
      databaseTimestamp(record.expiresAt, "oneTimeToken.expiresAt") <= new Date()
    ) {
      throw new AppError(400, "INVALID_OR_EXPIRED_TOKEN", "Invalid or expired token");
    }
    await database.withSecurityContext({ userId: record.userId, tenantId: record.tenantId }, async (transaction) => {
      const consumed = await transaction
        .update(oneTimeTokens)
        .set({ consumedAt: new Date() })
        .where(and(eq(oneTimeTokens.id, record.id), isNull(oneTimeTokens.consumedAt)))
        .returning({ id: oneTimeTokens.id });
      if (consumed.length !== 1) throw new AppError(400, "INVALID_OR_EXPIRED_TOKEN");
      await transaction.update(users).set({ status: "ACTIVE", emailVerifiedAt: new Date() }).where(eq(users.id, record.userId));
      await transaction.insert(auditLogs).values({
        tenantId: record.tenantId,
        actorUserId: record.userId,
        action: "AUTH_EMAIL_VERIFIED",
        entityType: "user",
        entityId: record.userId,
        requestId: request.id,
        ipHash: hashToken(request.ip, config.tokenHashPepper),
      });
    });
    return reply.code(204).send();
  });

  app.post(
    "/api/auth/request-password-reset",
    { config: { rateLimit: { max: 3, timeWindow: "30 minutes" } } },
    async (request, reply) => {
      const responseStartedAt = performance.now();
      const input = parseBody(emailOnlySchema, request.body);
      const user = await lookupUser(input.email);
      if (user?.tenantId && user.status === "ACTIVE") {
        const rawToken = createOpaqueToken();
        await database.withSecurityContext({ userId: user.id, tenantId: user.tenantId }, async (transaction) => {
          await transaction
            .update(oneTimeTokens)
            .set({ consumedAt: new Date() })
            .where(and(eq(oneTimeTokens.userId, user.id), eq(oneTimeTokens.purpose, "RESET_PASSWORD"), isNull(oneTimeTokens.consumedAt)));
          await transaction.insert(oneTimeTokens).values({
            userId: user.id,
            purpose: "RESET_PASSWORD",
            tokenHash: hashToken(rawToken, config.tokenHashPepper),
            expiresAt: new Date(Date.now() + config.passwordResetTtlSeconds * 1000),
          });
        });
        await email.sendPasswordReset(user.email, rawToken);
      }
      await waitForPublicAuthResponse(responseStartedAt, 300);
      return reply.code(202).send({ message: "If the account exists, a reset email will be sent." });
    },
  );

  app.post(
    "/api/auth/resend-verification",
    { config: { rateLimit: { max: 3, timeWindow: "30 minutes" } } },
    async (request, reply) => {
      const responseStartedAt = performance.now();
      const input = parseBody(emailOnlySchema, request.body);
      const user = await lookupUser(input.email);
      if (user) await sendRelevantRegistrationEmail(user, request);
      await waitForPublicAuthResponse(responseStartedAt, 300);
      return reply.code(202).send({ message: "If the account requires confirmation, an email will be sent." });
    },
  );

  app.post("/api/auth/reset-password", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const input = parseBody(resetPasswordSchema, request.body);
    const tokenHash = hashToken(input.token, config.tokenHashPepper);
    const [record] = await database.client<OneTimeLookup[]>`
      select * from private.lookup_one_time_token(${tokenHash}, 'RESET_PASSWORD')
    `;
    if (
      !record ||
      !record.tenantId ||
      nullableDatabaseTimestamp(record.consumedAt, "oneTimeToken.consumedAt") ||
      databaseTimestamp(record.expiresAt, "oneTimeToken.expiresAt") <= new Date()
    ) {
      throw new AppError(400, "INVALID_OR_EXPIRED_TOKEN", "Invalid or expired token");
    }
    const passwordHash = await hashPassword(input.password);
    await database.withSecurityContext({ userId: record.userId, tenantId: record.tenantId }, async (transaction) => {
      const consumed = await transaction
        .update(oneTimeTokens)
        .set({ consumedAt: new Date() })
        .where(and(eq(oneTimeTokens.id, record.id), isNull(oneTimeTokens.consumedAt)))
        .returning({ id: oneTimeTokens.id });
      if (consumed.length !== 1) throw new AppError(400, "INVALID_OR_EXPIRED_TOKEN");
      await transaction
        .update(users)
        .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
        .where(eq(users.id, record.userId));
      await transaction.execute(sql`select private.revoke_all_current_user_sessions('PASSWORD_RESET', null)`);
      await transaction.insert(auditLogs).values({
        tenantId: record.tenantId,
        actorUserId: record.userId,
        action: "AUTH_PASSWORD_RESET",
        entityType: "user",
        entityId: record.userId,
        requestId: request.id,
        ipHash: hashToken(request.ip, config.tokenHashPepper),
      });
    });
    clearRefreshCookie(reply, config);
    return reply.code(204).send();
  });

  app.get("/api/auth/mfa", async (request) => {
    const auth = await authenticate(request);
    return database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const [user] = await transaction
        .select({ enabled: users.mfaEnabled, enabledAt: users.mfaEnabledAt })
        .from(users)
        .where(eq(users.id, auth.userId))
        .limit(1);
      const [recovery] = await transaction
        .select({ remaining: sql<number>`count(*)::int` })
        .from(mfaRecoveryCodes)
        .where(and(eq(mfaRecoveryCodes.userId, auth.userId), isNull(mfaRecoveryCodes.usedAt)));
      if (!user) throw unauthorized();
      return { enabled: user.enabled, enabledAt: user.enabledAt, recoveryCodesRemaining: recovery?.remaining ?? 0 };
    });
  });

  app.post(
    "/api/auth/mfa/setup",
    { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } },
    async (request) => {
      const auth = await authenticate(request);
      const input = parseBody(passwordConfirmationSchema, request.body);
      const user = await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
        const [record] = await transaction
          .select({ email: users.email, passwordHash: users.passwordHash, mfaEnabled: users.mfaEnabled })
          .from(users)
          .where(eq(users.id, auth.userId))
          .limit(1);
        return record;
      });
      if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword).catch(() => false))) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
      }
      if (user.mfaEnabled) throw new AppError(409, "MFA_ALREADY_ENABLED", "Multi-factor authentication is already enabled");

      const secret = createTotpSecret();
      const encryptedSecret = encryptTotpSecret(secret, config.mfaEncryptionKey);
      await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
        await transaction
          .update(users)
          .set({ totpSecretEncrypted: encryptedSecret, totpLastUsedStep: null, mfaEnabledAt: null })
          .where(and(eq(users.id, auth.userId), eq(users.mfaEnabled, false)));
        await transaction.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, auth.userId));
        await transaction.insert(auditLogs).values({
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
          action: "AUTH_MFA_SETUP_STARTED",
          entityType: "user",
          entityId: auth.userId,
          requestId: request.id,
        });
      });
      return { secret, otpAuthUri: createOtpAuthUri(secret, user.email), algorithm: "SHA1", digits: 6, period: 30 };
    },
  );

  app.post(
    "/api/auth/mfa/confirm",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request) => {
      const auth = await authenticate(request);
      const input = parseBody(mfaConfirmSchema, request.body);
      const user = await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
        const [record] = await transaction
          .select({
            email: users.email,
            mfaEnabled: users.mfaEnabled,
            encryptedSecret: users.totpSecretEncrypted,
            lastUsedStep: users.totpLastUsedStep,
          })
          .from(users)
          .where(eq(users.id, auth.userId))
          .limit(1);
        return record;
      });
      if (!user?.encryptedSecret || user.mfaEnabled) throw new AppError(409, "MFA_SETUP_NOT_PENDING", "No MFA setup is pending");
      const secret = decryptTotpSecret(user.encryptedSecret, config.mfaEncryptionKey);
      const matchedStep = verifyTotp(secret, input.code, user.lastUsedStep);
      if (matchedStep === null) throw new AppError(401, "INVALID_MFA_CODE", "Invalid verification code");
      const recoveryCodes = createRecoveryCodes();

      await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
        const enabled = await transaction
          .update(users)
          .set({ mfaEnabled: true, mfaEnabledAt: new Date(), totpLastUsedStep: matchedStep })
          .where(and(eq(users.id, auth.userId), eq(users.mfaEnabled, false), eq(users.totpSecretEncrypted, user.encryptedSecret!)))
          .returning({ id: users.id });
        if (enabled.length !== 1) throw new AppError(409, "MFA_SETUP_CHANGED", "MFA setup changed");
        await transaction.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, auth.userId));
        await transaction.insert(mfaRecoveryCodes).values(
          recoveryCodes.map((code) => ({
            userId: auth.userId,
            codeHash: hashToken(normalizeRecoveryCode(code), config.tokenHashPepper),
          })),
        );
        await transaction.execute(sql`select private.revoke_all_current_user_sessions('MFA_ENABLED', ${auth.sessionId}::uuid)`);
        await transaction.insert(auditLogs).values({
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
          action: "AUTH_MFA_ENABLED",
          entityType: "user",
          entityId: auth.userId,
          requestId: request.id,
          ipHash: hashToken(request.ip, config.tokenHashPepper),
        });
      });
      await email.sendSecurityAlert(user.email, "MFA_ENABLED");
      return { recoveryCodes };
    },
  );

  app.post(
    "/api/auth/mfa/disable",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const auth = await authenticate(request);
      const input = parseBody(mfaDisableSchema, request.body);
      const user = await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
        const [record] = await transaction
          .select({
            email: users.email,
            passwordHash: users.passwordHash,
            mfaEnabled: users.mfaEnabled,
            encryptedSecret: users.totpSecretEncrypted,
            lastUsedStep: users.totpLastUsedStep,
          })
          .from(users)
          .where(eq(users.id, auth.userId))
          .limit(1);
        return record;
      });
      if (!user?.mfaEnabled || !user.encryptedSecret) throw new AppError(409, "MFA_NOT_ENABLED", "Multi-factor authentication is not enabled");
      if (!(await verifyPassword(user.passwordHash, input.currentPassword).catch(() => false))) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
      }

      const isTotpCode = /^\d{6}$/.test(input.code);
      const matchedStep = isTotpCode
        ? verifyTotp(decryptTotpSecret(user.encryptedSecret, config.mfaEncryptionKey), input.code, user.lastUsedStep)
        : null;
      const recoveryHash = isTotpCode ? null : hashToken(normalizeRecoveryCode(input.code), config.tokenHashPepper);
      if ((isTotpCode && matchedStep === null) || (!isTotpCode && normalizeRecoveryCode(input.code).length !== 16)) {
        throw new AppError(401, "INVALID_MFA_CODE", "Invalid verification code");
      }

      await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
        if (recoveryHash) {
          const used = await transaction
            .update(mfaRecoveryCodes)
            .set({ usedAt: new Date() })
            .where(and(eq(mfaRecoveryCodes.userId, auth.userId), eq(mfaRecoveryCodes.codeHash, recoveryHash), isNull(mfaRecoveryCodes.usedAt)))
            .returning({ id: mfaRecoveryCodes.id });
          if (used.length !== 1) throw new AppError(401, "INVALID_MFA_CODE", "Invalid verification code");
        }
        const disabled = await transaction
          .update(users)
          .set({
            mfaEnabled: false,
            mfaEnabledAt: null,
            totpSecretEncrypted: null,
            totpLastUsedStep: null,
            sessionVersion: sql`${users.sessionVersion} + 1`,
          })
          .where(
            and(
              eq(users.id, auth.userId),
              eq(users.mfaEnabled, true),
              ...(matchedStep === null ? [] : [or(isNull(users.totpLastUsedStep), lt(users.totpLastUsedStep, matchedStep))!]),
            ),
          )
          .returning({ id: users.id });
        if (disabled.length !== 1) throw new AppError(401, "INVALID_MFA_CODE", "Invalid verification code");
        await transaction.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, auth.userId));
        await transaction.execute(sql`select private.revoke_all_current_user_sessions('MFA_DISABLED', null)`);
        await transaction.insert(auditLogs).values({
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
          action: "AUTH_MFA_DISABLED",
          entityType: "user",
          entityId: auth.userId,
          requestId: request.id,
          ipHash: hashToken(request.ip, config.tokenHashPepper),
        });
      });
      await email.sendSecurityAlert(user.email, "MFA_DISABLED");
      clearRefreshCookie(reply, config);
      return reply.code(204).send();
    },
  );

  app.get("/api/auth/me", async (request) => {
    const auth = await authenticate(request);
    return database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const [user] = await transaction
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          nickname: users.nickname,
          avatarKey: users.avatarKey,
          profilePhotoData: users.profilePhotoData,
          countryCode: users.countryCode,
          locale: users.locale,
          timezone: users.timezone,
          defaultCurrency: users.defaultCurrency,
        })
        .from(users)
        .where(eq(users.id, auth.userId))
        .limit(1);
      if (!user) throw unauthorized();
      return { user, tenant: { id: auth.tenantId, role: auth.role } };
    });
  });

  app.patch("/api/auth/me", async (request) => {
    const auth = await authenticate(request);
    const input = parseBody(profileSchema, request.body);
    return database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const changes = input.avatarKey !== undefined ? { ...input, profilePhotoData: null } : input;
      const [user] = await transaction
        .update(users)
        .set(changes)
        .where(eq(users.id, auth.userId))
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          nickname: users.nickname,
          avatarKey: users.avatarKey,
          profilePhotoData: users.profilePhotoData,
          countryCode: users.countryCode,
          locale: users.locale,
          timezone: users.timezone,
          defaultCurrency: users.defaultCurrency,
        });
      if (!user) throw unauthorized();
      if (input.defaultCurrency) {
        await transaction.update(tenants).set({ baseCurrency: input.defaultCurrency }).where(eq(tenants.id, auth.tenantId));
      }
      await transaction.insert(auditLogs).values({
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        action: "USER_PROFILE_UPDATED",
        entityType: "user",
        entityId: auth.userId,
        requestId: request.id,
        metadata: { fields: Object.keys(input) },
      });
      return { user };
    });
  });

  app.post(
    "/api/auth/me/photo",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request) => {
      const auth = await authenticate(request);
      const file = await request.file({ limits: { files: 1, fileSize: 2 * 1024 * 1024 } });
      if (!file) throw new AppError(422, "FILE_REQUIRED", "A profile photo is required");
      const buffer = await file.toBuffer();
      const detected = await fileTypeFromBuffer(buffer);
      const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
      if (!detected || !allowed.has(detected.mime)) {
        throw new AppError(415, "INVALID_PROFILE_PHOTO", "Only JPEG, PNG and WebP images are accepted");
      }
      const profilePhotoData = `data:${detected.mime};base64,${buffer.toString("base64")}`;
      return database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
        const [user] = await transaction
          .update(users)
          .set({ avatarKey: null, profilePhotoData })
          .where(eq(users.id, auth.userId))
          .returning({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            nickname: users.nickname,
            avatarKey: users.avatarKey,
            profilePhotoData: users.profilePhotoData,
            countryCode: users.countryCode,
            locale: users.locale,
            timezone: users.timezone,
            defaultCurrency: users.defaultCurrency,
          });
        if (!user) throw unauthorized();
        await transaction.insert(auditLogs).values({
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
          action: "USER_PROFILE_PHOTO_UPDATED",
          entityType: "user",
          entityId: auth.userId,
          requestId: request.id,
          metadata: { mimeType: detected.mime, bytes: buffer.length },
        });
        return { user };
      });
    },
  );

  app.post("/api/auth/change-password", async (request, reply) => {
    const auth = await authenticate(request);
    const input = parseBody(changePasswordSchema, request.body);
    const user = await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const [record] = await transaction
        .select({
          passwordHash: users.passwordHash,
          mfaEnabled: users.mfaEnabled,
          encryptedSecret: users.totpSecretEncrypted,
          lastUsedStep: users.totpLastUsedStep,
        })
        .from(users)
        .where(eq(users.id, auth.userId))
        .limit(1);
      return record;
    });
    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword).catch(() => false))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
    }
    let matchedStep: number | null = null;
    let recoveryHash: string | null = null;
    if (user.mfaEnabled) {
      if (!input.mfaCode || !user.encryptedSecret) throw new AppError(401, "MFA_REQUIRED", "A second factor is required");
      if (/^\d{6}$/.test(input.mfaCode)) {
        matchedStep = verifyTotp(decryptTotpSecret(user.encryptedSecret, config.mfaEncryptionKey), input.mfaCode, user.lastUsedStep);
        if (matchedStep === null) throw new AppError(401, "INVALID_MFA_CODE", "Invalid verification code");
      } else {
        const normalized = normalizeRecoveryCode(input.mfaCode);
        if (normalized.length !== 16) throw new AppError(401, "INVALID_MFA_CODE", "Invalid verification code");
        recoveryHash = hashToken(normalized, config.tokenHashPepper);
      }
    }
    const nextHash = await hashPassword(input.newPassword);
    await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      if (recoveryHash) {
        const used = await transaction
          .update(mfaRecoveryCodes)
          .set({ usedAt: new Date() })
          .where(and(eq(mfaRecoveryCodes.userId, auth.userId), eq(mfaRecoveryCodes.codeHash, recoveryHash), isNull(mfaRecoveryCodes.usedAt)))
          .returning({ id: mfaRecoveryCodes.id });
        if (used.length !== 1) throw new AppError(401, "INVALID_MFA_CODE", "Invalid verification code");
      }
      const updated = await transaction
        .update(users)
        .set({
          passwordHash: nextHash,
          sessionVersion: sql`${users.sessionVersion} + 1`,
          ...(matchedStep === null ? {} : { totpLastUsedStep: matchedStep }),
        })
        .where(
          and(
            eq(users.id, auth.userId),
            ...(matchedStep === null ? [] : [or(isNull(users.totpLastUsedStep), lt(users.totpLastUsedStep, matchedStep))!]),
          ),
        )
        .returning({ id: users.id });
      if (updated.length !== 1) throw new AppError(401, "INVALID_MFA_CODE", "Invalid verification code");
      await transaction.execute(sql`select private.revoke_all_current_user_sessions('PASSWORD_CHANGED', null)`);
      await transaction.insert(auditLogs).values({
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        action: "AUTH_PASSWORD_CHANGED",
        entityType: "user",
        entityId: auth.userId,
        requestId: request.id,
        ipHash: hashToken(request.ip, config.tokenHashPepper),
      });
    });
    clearRefreshCookie(reply, config);
    return reply.code(204).send();
  });

  app.get("/api/auth/sessions", async (request) => {
    const auth = await authenticate(request);
    return database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const result = await transaction.execute(sql`select * from private.list_current_user_sessions()`);
      const items = result as unknown as Array<{
        id: string;
        tenantId: string;
        createdAt: Date;
        lastUsedAt: Date | null;
        expiresAt: Date;
      }>;
      return { data: items.map((item) => ({ ...item, current: item.id === auth.sessionId })) };
    });
  });

  app.delete("/api/auth/sessions/:id", async (request, reply) => {
    const auth = await authenticate(request);
    const sessionId = parseBody(z.object({ id: z.string().uuid() }).strict(), request.params).id;
    const revoked = await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const result = await transaction.execute(sql`select private.revoke_current_user_session(${sessionId}::uuid, 'USER_REVOKED') as revoked`);
      const wasRevoked = Boolean((result as unknown as Array<{ revoked: boolean }>)[0]?.revoked);
      if (wasRevoked) {
        await transaction.insert(auditLogs).values({
          tenantId: auth.tenantId,
          actorUserId: auth.userId,
          action: "AUTH_SESSION_REVOKED",
          entityType: "refresh_session",
          entityId: sessionId,
          requestId: request.id,
        });
      }
      return wasRevoked;
    });
    if (!revoked) throw new AppError(404, "NOT_FOUND", "Resource not found");
    if (sessionId === auth.sessionId) clearRefreshCookie(reply, config);
    return reply.code(204).send();
  });

  app.post("/api/auth/logout-all", async (request, reply) => {
    const auth = await authenticate(request);
    await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      await transaction.execute(sql`select private.revoke_all_current_user_sessions('LOGOUT_ALL', null)`);
      await transaction.insert(auditLogs).values({
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        action: "AUTH_LOGOUT_ALL",
        entityType: "user",
        entityId: auth.userId,
        requestId: request.id,
      });
    });
    clearRefreshCookie(reply, config);
    return reply.code(204).send();
  });
}
