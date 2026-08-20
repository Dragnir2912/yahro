import { and, desc, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { accounts, auditLogs, budgets, categories, personalCategoryDetails, transactions } from "../db/schema.js";
import { conflict, notFound } from "../lib/errors.js";
import type { AuthContext } from "../security/authentication.js";
import { requireRole } from "../security/authorization.js";
import { colorSchema, currencySchema, moneySchema, parseBody, uuidSchema } from "../security/validation.js";

interface FinanceDependencies {
  database: Database;
  authenticate: (request: FastifyRequest) => Promise<AuthContext>;
}

const accountTypeSchema = z.enum(["CHECKING", "SAVINGS", "CASH", "MOBILE_MONEY", "CREDIT_CARD", "INVESTMENT", "DEBT", "OTHER"]);
const accountCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: accountTypeSchema,
    currency: currencySchema,
    openingBalance: z.string().regex(/^-?(0|[1-9]\d{0,14})(\.\d{1,4})?$/),
    openingBalanceDate: z.coerce.date(),
    color: colorSchema,
    icon: z.string().trim().max(40).optional(),
    includeInNetWorth: z.boolean().default(true),
  })
  .strict();
const accountUpdateSchema = accountCreateSchema
  .pick({ name: true, color: true, icon: true, includeInNetWorth: true })
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict();

const categoryTypeSchema = z.enum(["INCOME", "EXPENSE"]);
const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: categoryTypeSchema,
    parentId: uuidSchema,
    color: colorSchema,
    icon: z.string().trim().max(40).optional(),
  })
  .strict();
const categoryUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    parentId: uuidSchema.optional(),
    color: colorSchema.optional(),
    icon: z.string().trim().max(40).nullable().optional(),
    version: z.number().int().positive(),
  })
  .strict();

const personalDetailCreateSchema = z
  .object({
    categoryId: uuidSchema,
    name: z.string().trim().min(1).max(100),
  })
  .strict();
const personalDetailUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    version: z.number().int().positive(),
  })
  .strict();

const transactionCreateSchema = z
  .object({
    accountId: uuidSchema,
    categoryId: uuidSchema.optional(),
    personalDetailId: uuidSchema.optional(),
    type: z.enum(["INCOME", "EXPENSE"]),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "BANK_CARD", "MOBILE_MONEY", "DIGITAL_WALLET", "DIRECT_DEBIT", "CHECK", "OTHER"]).default("BANK_TRANSFER"),
    amount: moneySchema,
    transactionDate: z.coerce.date(),
    merchant: z.string().trim().max(160).optional(),
    description: z.string().trim().min(1).max(240),
    notes: z.string().trim().max(4000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  })
  .strict();
const transactionUpdateSchema = transactionCreateSchema
  .omit({ accountId: true, type: true })
  .partial()
  .extend({ personalDetailId: uuidSchema.nullable().optional(), version: z.number().int().positive() })
  .strict();

const transactionQuerySchema = z
  .object({
    accountId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    beforeDate: z.coerce.date().optional(),
    beforeId: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(40),
  })
  .strict()
  .refine((value) => Boolean(value.beforeDate) === Boolean(value.beforeId), "Both cursor fields are required");

const budgetCreateSchema = z
  .object({
    categoryId: uuidSchema,
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    amount: moneySchema,
    currency: currencySchema,
    frequency: z.enum(["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"]).default("MONTHLY"),
    warningThreshold: z.number().int().min(1).max(100).default(80),
    rolloverEnabled: z.boolean().default(false),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((value) => value.periodEnd > value.periodStart, { path: ["periodEnd"], message: "End must be after start" });
const budgetUpdateSchema = z
  .object({
    amount: moneySchema.optional(),
    frequency: z.enum(["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"]).optional(),
    warningThreshold: z.number().int().min(1).max(100).optional(),
    rolloverEnabled: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional(),
    version: z.number().int().positive(),
  })
  .strict();

function resourceId(request: FastifyRequest) {
  return parseBody(z.object({ id: uuidSchema }).strict(), request.params).id;
}

function auditValues(request: FastifyRequest, auth: AuthContext, action: string, entityType: string, entityId: string) {
  return {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action,
    entityType,
    entityId,
    requestId: request.id,
  } as const;
}

export async function registerFinanceRoutes(app: FastifyInstance, dependencies: FinanceDependencies) {
  const { database, authenticate } = dependencies;

  app.get("/api/accounts", async (request) => {
    const auth = await authenticate(request);
    return database.withSecurityContext(auth, async (transaction) => {
      const rows = await transaction
        .select({
          id: accounts.id,
          name: accounts.name,
          type: accounts.type,
          currency: accounts.currency,
          openingBalance: accounts.openingBalance,
          openingBalanceDate: accounts.openingBalanceDate,
          color: accounts.color,
          icon: accounts.icon,
          includeInNetWorth: accounts.includeInNetWorth,
          version: accounts.version,
        })
        .from(accounts)
        .where(and(eq(accounts.tenantId, auth.tenantId), isNull(accounts.archivedAt)))
        .orderBy(accounts.createdAt);
      return { data: rows };
    });
  });

  app.post("/api/accounts", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const input = parseBody(accountCreateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const [created] = await transaction
        .insert(accounts)
        .values({ tenantId: auth.tenantId, ...input })
        .returning();
      if (!created) throw new Error("Account creation failed");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "ACCOUNT_CREATED", "account", created.id));
      return reply.code(201).send({ data: created });
    });
  });

  app.patch("/api/accounts/:id", async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = resourceId(request);
    const input = parseBody(accountUpdateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const { version, ...changes } = input;
      const [updated] = await transaction
        .update(accounts)
        .set({ ...changes, version: sql`${accounts.version} + 1` })
        .where(and(eq(accounts.id, id), eq(accounts.tenantId, auth.tenantId), eq(accounts.version, version), isNull(accounts.archivedAt)))
        .returning();
      if (!updated) throw conflict("STALE_OR_MISSING_ACCOUNT");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "ACCOUNT_UPDATED", "account", id));
      return { data: updated };
    });
  });

  app.delete("/api/accounts/:id", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "ADMIN");
    const id = resourceId(request);
    await database.withSecurityContext(auth, async (transaction) => {
      const [archived] = await transaction
        .update(accounts)
        .set({ archivedAt: new Date(), version: sql`${accounts.version} + 1` })
        .where(and(eq(accounts.id, id), eq(accounts.tenantId, auth.tenantId), isNull(accounts.archivedAt)))
        .returning({ id: accounts.id });
      if (!archived) throw notFound();
      await transaction.insert(auditLogs).values(auditValues(request, auth, "ACCOUNT_ARCHIVED", "account", id));
    });
    return reply.code(204).send();
  });

  app.get("/api/categories", async (request) => {
    const auth = await authenticate(request);
    return database.withSecurityContext(auth, async (transaction) => ({
      data: await transaction
        .select({
          id: categories.id,
          parentId: categories.parentId,
          ownerUserId: categories.ownerUserId,
          name: categories.name,
          type: categories.type,
          level: categories.level,
          systemKey: categories.systemKey,
          sortOrder: categories.sortOrder,
          color: categories.color,
          icon: categories.icon,
          isSystem: categories.isSystem,
          version: categories.version,
        })
        .from(categories)
        .where(and(
          eq(categories.tenantId, auth.tenantId),
          isNull(categories.archivedAt),
          or(isNull(categories.ownerUserId), eq(categories.ownerUserId, auth.userId)),
        ))
        .orderBy(categories.type, categories.level, categories.sortOrder, categories.name),
    }));
  });

  app.post("/api/categories", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const input = parseBody(categoryCreateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const [parent] = await transaction
        .select({ type: categories.type, level: categories.level })
        .from(categories)
        .where(and(
          eq(categories.id, input.parentId),
          eq(categories.tenantId, auth.tenantId),
          eq(categories.level, 1),
          isNull(categories.archivedAt),
          or(isNull(categories.ownerUserId), eq(categories.ownerUserId, auth.userId)),
        ))
        .limit(1);
      if (!parent || parent.type !== input.type) throw conflict("INVALID_PARENT_CATEGORY");
      const [duplicate] = await transaction
        .select({ id: categories.id })
        .from(categories)
        .where(and(
          eq(categories.tenantId, auth.tenantId),
          eq(categories.ownerUserId, auth.userId),
          eq(categories.parentId, input.parentId),
          eq(categories.type, input.type),
          sql`lower(${categories.name}) = lower(${input.name})`,
          isNull(categories.archivedAt),
        ))
        .limit(1);
      if (duplicate) throw conflict("DUPLICATE_CATEGORY");
      const [created] = await transaction.insert(categories).values({
        tenantId: auth.tenantId,
        ownerUserId: auth.userId,
        level: 2,
        isSystem: false,
        ...input,
      }).returning();
      if (!created) throw new Error("Category creation failed");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "CATEGORY_CREATED", "category", created.id));
      return reply.code(201).send({ data: created });
    });
  });

  app.patch("/api/categories/:id", async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = resourceId(request);
    const input = parseBody(categoryUpdateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const { version, ...changes } = input;
      if (changes.parentId) {
        const [current, parent] = await Promise.all([
          transaction.select({ type: categories.type }).from(categories).where(and(
            eq(categories.id, id), eq(categories.tenantId, auth.tenantId), eq(categories.ownerUserId, auth.userId), isNull(categories.archivedAt),
          )).limit(1),
          transaction.select({ type: categories.type, level: categories.level }).from(categories).where(and(
            eq(categories.id, changes.parentId), eq(categories.tenantId, auth.tenantId), eq(categories.level, 1), isNull(categories.archivedAt),
          )).limit(1),
        ]);
        if (!current[0] || !parent[0] || current[0].type !== parent[0].type) throw conflict("INVALID_PARENT_CATEGORY");
      }
      const [updated] = await transaction
        .update(categories)
        .set({ ...changes, version: sql`${categories.version} + 1` })
        .where(and(
          eq(categories.id, id),
          eq(categories.tenantId, auth.tenantId),
          eq(categories.ownerUserId, auth.userId),
          eq(categories.isSystem, false),
          eq(categories.level, 2),
          eq(categories.version, version),
          isNull(categories.archivedAt),
        ))
        .returning();
      if (!updated) throw conflict("STALE_OR_MISSING_CATEGORY");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "CATEGORY_UPDATED", "category", id));
      return { data: updated };
    });
  });

  app.delete("/api/categories/:id", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = resourceId(request);
    await database.withSecurityContext(auth, async (transaction) => {
      const [archived] = await transaction
        .update(categories)
        .set({ archivedAt: new Date(), version: sql`${categories.version} + 1` })
        .where(and(
          eq(categories.id, id),
          eq(categories.tenantId, auth.tenantId),
          eq(categories.ownerUserId, auth.userId),
          eq(categories.isSystem, false),
          eq(categories.level, 2),
          isNull(categories.archivedAt),
        ))
        .returning({ id: categories.id });
      if (!archived) throw notFound();
      await transaction.insert(auditLogs).values(auditValues(request, auth, "CATEGORY_ARCHIVED", "category", id));
    });
    return reply.code(204).send();
  });

  app.get("/api/category-details", async (request) => {
    const auth = await authenticate(request);
    const query = parseBody(z.object({ categoryId: uuidSchema.optional() }).strict(), request.query);
    return database.withSecurityContext(auth, async (transaction) => {
      const conditions = [
        eq(personalCategoryDetails.tenantId, auth.tenantId),
        eq(personalCategoryDetails.ownerUserId, auth.userId),
        isNull(personalCategoryDetails.archivedAt),
      ];
      if (query.categoryId) conditions.push(eq(personalCategoryDetails.categoryId, query.categoryId));
      return {
        data: await transaction
          .select({
            id: personalCategoryDetails.id,
            categoryId: personalCategoryDetails.categoryId,
            name: personalCategoryDetails.name,
            version: personalCategoryDetails.version,
            createdAt: personalCategoryDetails.createdAt,
          })
          .from(personalCategoryDetails)
          .where(and(...conditions))
          .orderBy(personalCategoryDetails.name),
      };
    });
  });

  app.post("/api/category-details", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const input = parseBody(personalDetailCreateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const [category] = await transaction
        .select({ id: categories.id })
        .from(categories)
        .where(and(
          eq(categories.id, input.categoryId),
          eq(categories.tenantId, auth.tenantId),
          eq(categories.level, 2),
          isNull(categories.archivedAt),
          or(isNull(categories.ownerUserId), eq(categories.ownerUserId, auth.userId)),
        ))
        .limit(1);
      if (!category) throw conflict("PERSONAL_DETAIL_REQUIRES_POST");
      const [duplicate] = await transaction
        .select({ id: personalCategoryDetails.id })
        .from(personalCategoryDetails)
        .where(and(
          eq(personalCategoryDetails.tenantId, auth.tenantId),
          eq(personalCategoryDetails.ownerUserId, auth.userId),
          eq(personalCategoryDetails.categoryId, input.categoryId),
          sql`lower(${personalCategoryDetails.name}) = lower(${input.name})`,
          isNull(personalCategoryDetails.archivedAt),
        ))
        .limit(1);
      if (duplicate) throw conflict("DUPLICATE_CATEGORY_DETAIL");
      const [created] = await transaction
        .insert(personalCategoryDetails)
        .values({ tenantId: auth.tenantId, ownerUserId: auth.userId, ...input })
        .returning();
      if (!created) throw new Error("Personal category detail creation failed");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "CATEGORY_DETAIL_CREATED", "category_detail", created.id));
      return reply.code(201).send({ data: created });
    });
  });

  app.patch("/api/category-details/:id", async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = resourceId(request);
    const input = parseBody(personalDetailUpdateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const [updated] = await transaction
        .update(personalCategoryDetails)
        .set({ name: input.name, version: sql`${personalCategoryDetails.version} + 1` })
        .where(and(
          eq(personalCategoryDetails.id, id),
          eq(personalCategoryDetails.tenantId, auth.tenantId),
          eq(personalCategoryDetails.ownerUserId, auth.userId),
          eq(personalCategoryDetails.version, input.version),
          isNull(personalCategoryDetails.archivedAt),
        ))
        .returning();
      if (!updated) throw conflict("STALE_OR_MISSING_CATEGORY_DETAIL");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "CATEGORY_DETAIL_UPDATED", "category_detail", id));
      return { data: updated };
    });
  });

  app.delete("/api/category-details/:id", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = resourceId(request);
    await database.withSecurityContext(auth, async (transaction) => {
      const [archived] = await transaction
        .update(personalCategoryDetails)
        .set({ archivedAt: new Date(), version: sql`${personalCategoryDetails.version} + 1` })
        .where(and(
          eq(personalCategoryDetails.id, id),
          eq(personalCategoryDetails.tenantId, auth.tenantId),
          eq(personalCategoryDetails.ownerUserId, auth.userId),
          isNull(personalCategoryDetails.archivedAt),
        ))
        .returning({ id: personalCategoryDetails.id });
      if (!archived) throw notFound();
      await transaction.insert(auditLogs).values(auditValues(request, auth, "CATEGORY_DETAIL_ARCHIVED", "category_detail", id));
    });
    return reply.code(204).send();
  });

  app.get("/api/transactions", async (request) => {
    const auth = await authenticate(request);
    const query = parseBody(transactionQuerySchema, request.query);
    return database.withSecurityContext(auth, async (transaction) => {
      const conditions = [eq(transactions.tenantId, auth.tenantId), isNull(transactions.deletedAt)];
      if (query.accountId) conditions.push(eq(transactions.accountId, query.accountId));
      if (query.categoryId) conditions.push(eq(transactions.categoryId, query.categoryId));
      if (query.type) conditions.push(eq(transactions.type, query.type));
      if (query.from) conditions.push(gte(transactions.transactionDate, query.from));
      if (query.to) conditions.push(lte(transactions.transactionDate, query.to));
      if (query.beforeDate && query.beforeId) {
        conditions.push(
          or(
            lt(transactions.transactionDate, query.beforeDate),
            and(eq(transactions.transactionDate, query.beforeDate), lt(transactions.id, query.beforeId)),
          )!,
        );
      }
      const rows = await transaction
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.transactionDate), desc(transactions.id))
        .limit(query.limit + 1);
      const hasMore = rows.length > query.limit;
      const data = hasMore ? rows.slice(0, query.limit) : rows;
      const last = data.at(-1);
      return {
        data,
        nextCursor: hasMore && last ? { beforeDate: last.transactionDate.toISOString(), beforeId: last.id } : null,
      };
    });
  });

  app.post("/api/transactions", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const input = parseBody(transactionCreateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const [account] = await transaction
        .select({ currency: accounts.currency })
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.tenantId, auth.tenantId), isNull(accounts.archivedAt)))
        .limit(1);
      if (!account) throw notFound();
      if (input.categoryId) {
        const [category] = await transaction
          .select({ type: categories.type })
          .from(categories)
          .where(and(
            eq(categories.id, input.categoryId),
            eq(categories.tenantId, auth.tenantId),
            isNull(categories.archivedAt),
            or(isNull(categories.ownerUserId), eq(categories.ownerUserId, auth.userId)),
          ))
          .limit(1);
        if (!category || category.type !== input.type) throw conflict("CATEGORY_TYPE_MISMATCH");
      }
      if (input.personalDetailId) {
        if (!input.categoryId) throw conflict("PERSONAL_DETAIL_REQUIRES_POST");
        const [detail] = await transaction
          .select({ categoryId: personalCategoryDetails.categoryId })
          .from(personalCategoryDetails)
          .where(and(
            eq(personalCategoryDetails.id, input.personalDetailId),
            eq(personalCategoryDetails.tenantId, auth.tenantId),
            eq(personalCategoryDetails.ownerUserId, auth.userId),
            eq(personalCategoryDetails.categoryId, input.categoryId),
            isNull(personalCategoryDetails.archivedAt),
          ))
          .limit(1);
        if (!detail) throw conflict("PERSONAL_DETAIL_CATEGORY_MISMATCH");
      }
      const [created] = await transaction
        .insert(transactions)
        .values({ tenantId: auth.tenantId, createdById: auth.userId, currency: account.currency, ...input })
        .returning();
      if (!created) throw new Error("Transaction creation failed");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "TRANSACTION_CREATED", "transaction", created.id));
      return reply.code(201).send({ data: created });
    });
  });

  app.patch("/api/transactions/:id", async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = resourceId(request);
    const input = parseBody(transactionUpdateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const { version, ...rawChanges } = input;
      const changes = { ...rawChanges };
      if (changes.categoryId || changes.personalDetailId) {
        const [existing] = await transaction
          .select({ type: transactions.type, categoryId: transactions.categoryId })
          .from(transactions)
          .where(and(eq(transactions.id, id), eq(transactions.tenantId, auth.tenantId), isNull(transactions.deletedAt)))
          .limit(1);
        if (!existing) throw notFound();
        const finalCategoryId = changes.categoryId ?? existing.categoryId;
        if (changes.categoryId) {
          const [category] = await transaction
            .select({ type: categories.type })
            .from(categories)
            .where(and(
              eq(categories.id, changes.categoryId),
              eq(categories.tenantId, auth.tenantId),
              isNull(categories.archivedAt),
              or(isNull(categories.ownerUserId), eq(categories.ownerUserId, auth.userId)),
            ))
            .limit(1);
          if (!category || category.type !== existing.type) throw conflict("CATEGORY_TYPE_MISMATCH");
        }
        if (changes.personalDetailId) {
          if (!finalCategoryId) throw conflict("PERSONAL_DETAIL_REQUIRES_POST");
          const [detail] = await transaction
            .select({ id: personalCategoryDetails.id })
            .from(personalCategoryDetails)
            .where(and(
              eq(personalCategoryDetails.id, changes.personalDetailId),
              eq(personalCategoryDetails.tenantId, auth.tenantId),
              eq(personalCategoryDetails.ownerUserId, auth.userId),
              eq(personalCategoryDetails.categoryId, finalCategoryId),
              isNull(personalCategoryDetails.archivedAt),
            ))
            .limit(1);
          if (!detail) throw conflict("PERSONAL_DETAIL_CATEGORY_MISMATCH");
        }
      }
      if (changes.categoryId && !("personalDetailId" in changes)) changes.personalDetailId = null;
      const [updated] = await transaction
        .update(transactions)
        .set({ ...changes, version: sql`${transactions.version} + 1` })
        .where(and(eq(transactions.id, id), eq(transactions.tenantId, auth.tenantId), eq(transactions.version, version), isNull(transactions.deletedAt)))
        .returning();
      if (!updated) throw conflict("STALE_OR_MISSING_TRANSACTION");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "TRANSACTION_UPDATED", "transaction", id));
      return { data: updated };
    });
  });

  app.delete("/api/transactions/:id", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = resourceId(request);
    await database.withSecurityContext(auth, async (transaction) => {
      const [removed] = await transaction
        .update(transactions)
        .set({ deletedAt: new Date(), version: sql`${transactions.version} + 1` })
        .where(and(eq(transactions.id, id), eq(transactions.tenantId, auth.tenantId), isNull(transactions.deletedAt)))
        .returning({ id: transactions.id });
      if (!removed) throw notFound();
      await transaction.insert(auditLogs).values(auditValues(request, auth, "TRANSACTION_DELETED", "transaction", id));
    });
    return reply.code(204).send();
  });

  app.get("/api/budgets", async (request) => {
    const auth = await authenticate(request);
    const period = parseBody(z.object({ from: z.coerce.date(), to: z.coerce.date() }).strict(), request.query);
    return database.withSecurityContext(auth, async (transaction) => ({
      data: await transaction
        .select()
        .from(budgets)
        .where(and(eq(budgets.tenantId, auth.tenantId), lt(budgets.periodStart, period.to), gt(budgets.periodEnd, period.from)))
        .orderBy(budgets.periodStart),
    }));
  });

  app.post("/api/budgets", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const input = parseBody(budgetCreateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const [category] = await transaction
        .select({ type: categories.type })
        .from(categories)
        .where(and(
          eq(categories.id, input.categoryId),
          eq(categories.tenantId, auth.tenantId),
          isNull(categories.archivedAt),
          or(isNull(categories.ownerUserId), eq(categories.ownerUserId, auth.userId)),
        ))
        .limit(1);
      if (!category || category.type !== "EXPENSE") throw conflict("BUDGET_REQUIRES_EXPENSE_CATEGORY");
      const [created] = await transaction.insert(budgets).values({ tenantId: auth.tenantId, ...input }).returning();
      if (!created) throw new Error("Budget creation failed");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "BUDGET_CREATED", "budget", created.id));
      return reply.code(201).send({ data: created });
    });
  });

  app.patch("/api/budgets/:id", async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = resourceId(request);
    const input = parseBody(budgetUpdateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      const { version, ...changes } = input;
      const [updated] = await transaction
        .update(budgets)
        .set({ ...changes, version: sql`${budgets.version} + 1` })
        .where(and(eq(budgets.id, id), eq(budgets.tenantId, auth.tenantId), eq(budgets.version, version)))
        .returning();
      if (!updated) throw conflict("STALE_OR_MISSING_BUDGET");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "BUDGET_UPDATED", "budget", id));
      return { data: updated };
    });
  });

  app.delete("/api/budgets/:id", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = resourceId(request);
    await database.withSecurityContext(auth, async (transaction) => {
      const [removed] = await transaction
        .delete(budgets)
        .where(and(eq(budgets.id, id), eq(budgets.tenantId, auth.tenantId)))
        .returning({ id: budgets.id });
      if (!removed) throw notFound();
      await transaction.insert(auditLogs).values(auditValues(request, auth, "BUDGET_DELETED", "budget", id));
    });
    return reply.code(204).send();
  });
}
