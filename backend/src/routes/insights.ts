import { and, asc, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { accounts, auditLogs, budgets, categories, notifications, transactions } from "../db/schema.js";
import { AppError, notFound } from "../lib/errors.js";
import type { AuthContext } from "../security/authentication.js";
import { requireRole } from "../security/authorization.js";
import { parseBody, uuidSchema } from "../security/validation.js";

interface InsightDependencies {
  database: Database;
  authenticate: (request: FastifyRequest) => Promise<AuthContext>;
}

const rangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict()
  .transform((value) => {
    const now = new Date();
    const from = value.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = value.to ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { from, to };
  })
  .refine((value) => value.to > value.from, "The end date must be after the start date")
  .refine((value) => value.to.getTime() - value.from.getTime() <= 370 * 24 * 60 * 60 * 1000, "The range cannot exceed 370 days");

const notificationQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).strict();
const auditQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();

function idParam(request: FastifyRequest) {
  return parseBody(z.object({ id: uuidSchema }).strict(), request.params).id;
}

function previousRange(from: Date, to: Date) {
  const duration = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - duration), to: from };
}

function csvCell(value: unknown) {
  let text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function registerInsightRoutes(app: FastifyInstance, dependencies: InsightDependencies) {
  const { database, authenticate } = dependencies;

  app.get("/api/dashboard", async (request) => {
    const auth = await authenticate(request);
    const range = parseBody(rangeSchema, request.query);
    const previous = previousRange(range.from, range.to);

    return database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const totals = await transaction
        .select({
          currency: transactions.currency,
          type: transactions.type,
          amount: sql<string>`coalesce(sum(${transactions.amount}), 0)::text`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.tenantId, auth.tenantId),
            isNull(transactions.deletedAt),
            gte(transactions.transactionDate, range.from),
            lt(transactions.transactionDate, range.to),
          ),
        )
        .groupBy(transactions.currency, transactions.type)
        .orderBy(asc(transactions.currency));

      const previousTotals = await transaction
        .select({
          currency: transactions.currency,
          type: transactions.type,
          amount: sql<string>`coalesce(sum(${transactions.amount}), 0)::text`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.tenantId, auth.tenantId),
            isNull(transactions.deletedAt),
            gte(transactions.transactionDate, previous.from),
            lt(transactions.transactionDate, previous.to),
          ),
        )
        .groupBy(transactions.currency, transactions.type)
        .orderBy(asc(transactions.currency));

      const accountBalances = await transaction
        .select({
          id: accounts.id,
          name: accounts.name,
          type: accounts.type,
          currency: accounts.currency,
          includeInNetWorth: accounts.includeInNetWorth,
          balance: sql<string>`(
            ${accounts.openingBalance}
            + coalesce(sum(case when ${transactions.type} = 'INCOME' then ${transactions.amount} else 0 end), 0)
            - coalesce(sum(case when ${transactions.type} = 'EXPENSE' then ${transactions.amount} else 0 end), 0)
          )::text`,
        })
        .from(accounts)
        .leftJoin(
          transactions,
          and(
            eq(transactions.accountId, accounts.id),
            eq(transactions.tenantId, auth.tenantId),
            isNull(transactions.deletedAt),
            lt(transactions.transactionDate, range.to),
          ),
        )
        .where(and(eq(accounts.tenantId, auth.tenantId), isNull(accounts.archivedAt)))
        .groupBy(accounts.id)
        .orderBy(asc(accounts.name));

      const byCategory = await transaction
        .select({
          categoryId: categories.id,
          name: categories.name,
          color: categories.color,
          currency: transactions.currency,
          amount: sql<string>`coalesce(sum(${transactions.amount}), 0)::text`,
        })
        .from(transactions)
        .innerJoin(categories, and(eq(categories.id, transactions.categoryId), eq(categories.tenantId, auth.tenantId)))
        .where(
          and(
            eq(transactions.tenantId, auth.tenantId),
            eq(transactions.type, "EXPENSE"),
            isNull(transactions.deletedAt),
            gte(transactions.transactionDate, range.from),
            lt(transactions.transactionDate, range.to),
          ),
        )
        .groupBy(categories.id, transactions.currency)
        .orderBy(desc(sql`sum(${transactions.amount})`))
        .limit(12);

      const budgetProgress = await transaction
        .select({
          id: budgets.id,
          categoryId: budgets.categoryId,
          categoryName: categories.name,
          color: categories.color,
          amount: budgets.amount,
          currency: budgets.currency,
          warningThreshold: budgets.warningThreshold,
          spent: sql<string>`coalesce(sum(${transactions.amount}), 0)::text`,
        })
        .from(budgets)
        .innerJoin(categories, and(eq(categories.id, budgets.categoryId), eq(categories.tenantId, auth.tenantId)))
        .leftJoin(
          transactions,
          and(
            or(
              eq(transactions.categoryId, budgets.categoryId),
              sql`${transactions.categoryId} in (
                select child.id
                from public.categories child
                where child.parent_id = ${budgets.categoryId}
                  and child.tenant_id = ${auth.tenantId}::uuid
                  and child.archived_at is null
              )`,
            ),
            eq(transactions.tenantId, auth.tenantId),
            eq(transactions.type, "EXPENSE"),
            isNull(transactions.deletedAt),
            gte(transactions.transactionDate, budgets.periodStart),
            lt(transactions.transactionDate, budgets.periodEnd),
          ),
        )
        .where(
          and(
            eq(budgets.tenantId, auth.tenantId),
            isNull(budgets.archivedAt),
            lte(budgets.periodStart, range.to),
            gte(budgets.periodEnd, range.from),
          ),
        )
        .groupBy(budgets.id, categories.id)
        .orderBy(asc(categories.name));

      const cashflow = await transaction
        .select({
          day: sql<string>`date_trunc('day', ${transactions.transactionDate})::date::text`,
          currency: transactions.currency,
          income: sql<string>`coalesce(sum(case when ${transactions.type} = 'INCOME' then ${transactions.amount} else 0 end), 0)::text`,
          expense: sql<string>`coalesce(sum(case when ${transactions.type} = 'EXPENSE' then ${transactions.amount} else 0 end), 0)::text`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.tenantId, auth.tenantId),
            isNull(transactions.deletedAt),
            gte(transactions.transactionDate, range.from),
            lt(transactions.transactionDate, range.to),
          ),
        )
        .groupBy(sql`date_trunc('day', ${transactions.transactionDate})::date`, transactions.currency)
        .orderBy(asc(sql`date_trunc('day', ${transactions.transactionDate})::date`));

      return {
        range,
        totals,
        previousTotals,
        accountBalances,
        spendingByCategory: byCategory,
        budgetProgress,
        cashflow,
      };
    });
  });

  app.get("/api/notifications", async (request) => {
    const auth = await authenticate(request);
    const query = parseBody(notificationQuerySchema, request.query);
    return database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const data = await transaction
        .select()
        .from(notifications)
        .where(and(eq(notifications.tenantId, auth.tenantId), eq(notifications.userId, auth.userId), isNull(notifications.archivedAt)))
        .orderBy(desc(notifications.createdAt))
        .limit(query.limit);
      return { data };
    });
  });

  app.patch("/api/notifications/:id/read", async (request) => {
    const auth = await authenticate(request);
    const id = idParam(request);
    return database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const [item] = await transaction
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.tenantId, auth.tenantId), eq(notifications.userId, auth.userId)))
        .returning();
      if (!item) throw notFound();
      return { data: item };
    });
  });

  app.delete("/api/notifications/:id", async (request, reply) => {
    const auth = await authenticate(request);
    const id = idParam(request);
    const archived = await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) =>
      transaction
        .update(notifications)
        .set({ archivedAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.tenantId, auth.tenantId), eq(notifications.userId, auth.userId)))
        .returning({ id: notifications.id }),
    );
    if (archived.length !== 1) throw notFound();
    return reply.code(204).send();
  });

  app.get("/api/audit-log", async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "ADMIN");
    const query = parseBody(auditQuerySchema, request.query);
    return database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) => {
      const data = await transaction
        .select({
          id: auditLogs.id,
          actorUserId: auditLogs.actorUserId,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, auth.tenantId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(query.limit);
      return { data };
    });
  });

  app.get("/api/exports/transactions.csv", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
    const auth = await authenticate(request);
    if (Math.floor(Date.now() / 1000) - auth.authTime > 10 * 60) {
      throw new AppError(403, "REAUTHENTICATION_REQUIRED", "Recent authentication is required for this export");
    }
    const range = parseBody(rangeSchema, request.query);
    const rows = await database.withSecurityContext({ userId: auth.userId, tenantId: auth.tenantId }, async (transaction) =>
      transaction
        .select({
          date: transactions.transactionDate,
          type: transactions.type,
          amount: transactions.amount,
          currency: transactions.currency,
          account: accounts.name,
          category: categories.name,
          merchant: transactions.merchant,
          description: transactions.description,
          notes: transactions.notes,
          verified: transactions.isVerified,
        })
        .from(transactions)
        .innerJoin(accounts, and(eq(accounts.id, transactions.accountId), eq(accounts.tenantId, auth.tenantId)))
        .leftJoin(categories, and(eq(categories.id, transactions.categoryId), eq(categories.tenantId, auth.tenantId)))
        .where(
          and(
            eq(transactions.tenantId, auth.tenantId),
            isNull(transactions.deletedAt),
            gte(transactions.transactionDate, range.from),
            lt(transactions.transactionDate, range.to),
          ),
        )
        .orderBy(desc(transactions.transactionDate))
        .limit(50_001),
    );
    if (rows.length > 50_000) {
      throw new AppError(413, "EXPORT_TOO_LARGE", "Narrow the date range before exporting");
    }
    const header = ["date", "type", "amount", "currency", "account", "category", "merchant", "description", "notes", "verified"];
    const csv = [header, ...rows.map((row) => Object.values(row))].map((row) => row.map(csvCell).join(",")).join("\r\n");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="yahro-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
    return `\uFEFF${csv}\r\n`;
  });
}
