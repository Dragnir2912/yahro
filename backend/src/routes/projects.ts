import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { auditLogs, projectExpenses, projects } from "../db/schema.js";
import { conflict, notFound } from "../lib/errors.js";
import type { AuthContext } from "../security/authentication.js";
import { requireRole } from "../security/authorization.js";
import { currencySchema, parseBody, uuidSchema } from "../security/validation.js";

interface ProjectDependencies {
  database: Database;
  authenticate: (request: FastifyRequest) => Promise<AuthContext>;
}

const positiveMoneySchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,14})(\.\d{1,4})?$/)
  .refine((value) => Number(value) > 0, "Amount must be positive");
const projectKindSchema = z.enum(["PROJECT", "ACTIVITY"]);
const projectStatusSchema = z.enum(["PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]);
const budgetFrequencySchema = z.enum(["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"]);
const paymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER", "BANK_CARD", "MOBILE_MONEY", "DIGITAL_WALLET", "DIRECT_DEBIT", "CHECK", "OTHER"]);
const projectColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const projectCreateSchema = z
  .object({
    kind: projectKindSchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
    status: projectStatusSchema.default("PLANNED"),
    totalBudget: positiveMoneySchema,
    currency: currencySchema,
    budgetFrequency: budgetFrequencySchema.default("ONE_TIME"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    warningThreshold: z.number().int().min(1).max(100).default(80),
    color: projectColorSchema.default("#769450"),
  })
  .strict()
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "End date must not precede start date",
  });

const projectUpdateSchema = z
  .object({
    kind: projectKindSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: projectStatusSchema.optional(),
    totalBudget: positiveMoneySchema.optional(),
    budgetFrequency: budgetFrequencySchema.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().nullable().optional(),
    warningThreshold: z.number().int().min(1).max(100).optional(),
    color: projectColorSchema.optional(),
    version: z.number().int().positive(),
  })
  .strict();

const expenseCreateSchema = z
  .object({
    description: z.string().trim().min(1).max(160),
    amount: positiveMoneySchema,
    paymentMethod: paymentMethodSchema,
    spentAt: z.coerce.date(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const expenseUpdateSchema = expenseCreateSchema
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict();

function projectId(request: FastifyRequest) {
  return parseBody(z.object({ id: uuidSchema }).strict(), request.params).id;
}

function expenseIds(request: FastifyRequest) {
  return parseBody(z.object({ projectId: uuidSchema, expenseId: uuidSchema }).strict(), request.params);
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

export async function registerProjectRoutes(app: FastifyInstance, dependencies: ProjectDependencies) {
  const { database, authenticate } = dependencies;

  app.get("/api/projects", async (request) => {
    const auth = await authenticate(request);
    const query = parseBody(z.object({ status: projectStatusSchema.optional() }).strict(), request.query);

    return database.withSecurityContext(auth, async (transaction) => {
      const conditions = [
        eq(projects.tenantId, auth.tenantId),
        eq(projects.ownerUserId, auth.userId),
        isNull(projects.archivedAt),
      ];
      if (query.status) conditions.push(eq(projects.status, query.status));

      const rows = await transaction
        .select({
          id: projects.id,
          kind: projects.kind,
          name: projects.name,
          description: projects.description,
          status: projects.status,
          totalBudget: projects.totalBudget,
          currency: projects.currency,
          budgetFrequency: projects.budgetFrequency,
          startDate: projects.startDate,
          endDate: projects.endDate,
          warningThreshold: projects.warningThreshold,
          color: projects.color,
          version: projects.version,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(and(...conditions))
        .orderBy(desc(projects.updatedAt));

      const currentPeriod = sql<boolean>`(
        ${projects.budgetFrequency} = 'ONE_TIME'
        or (
          ${projectExpenses.spentAt} >= private.project_budget_period_start(${projects.budgetFrequency}, ${projects.startDate}, now())
          and ${projectExpenses.spentAt} < private.project_budget_period_end(${projects.budgetFrequency}, ${projects.startDate}, ${projects.endDate}, now())
        )
      )`;
      const aggregates = await transaction
        .select({
          projectId: projectExpenses.projectId,
          spentAmount: sql<string>`coalesce(sum(case when ${currentPeriod} then ${projectExpenses.amount} else 0 end), 0)::text`,
          lifetimeSpentAmount: sql<string>`coalesce(sum(${projectExpenses.amount}), 0)::text`,
          cashSpentAmount: sql<string>`coalesce(sum(case when ${currentPeriod} and ${projectExpenses.paymentMethod} = 'CASH' then ${projectExpenses.amount} else 0 end), 0)::text`,
          electronicSpentAmount: sql<string>`coalesce(sum(case when ${currentPeriod} and ${projectExpenses.paymentMethod} <> 'CASH' then ${projectExpenses.amount} else 0 end), 0)::text`,
          expenseCount: sql<number>`count(*)::integer`,
        })
        .from(projectExpenses)
        .innerJoin(projects, and(
          eq(projects.id, projectExpenses.projectId),
          eq(projects.tenantId, auth.tenantId),
          eq(projects.ownerUserId, auth.userId),
          isNull(projects.archivedAt),
        ))
        .where(and(
          eq(projectExpenses.tenantId, auth.tenantId),
          eq(projectExpenses.ownerUserId, auth.userId),
          isNull(projectExpenses.deletedAt),
        ))
        .groupBy(projectExpenses.projectId);
      const totals = new Map(aggregates.map((aggregate) => [aggregate.projectId, aggregate]));
      return {
        data: rows.map((project) => ({
          ...project,
          ...(totals.get(project.id) ?? { spentAmount: "0", lifetimeSpentAmount: "0", cashSpentAmount: "0", electronicSpentAmount: "0", expenseCount: 0 }),
        })),
      };
    });
  });

  app.post("/api/projects", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const input = parseBody(projectCreateSchema, request.body);

    return database.withSecurityContext(auth, async (transaction) => {
      const [created] = await transaction
        .insert(projects)
        .values({ tenantId: auth.tenantId, ownerUserId: auth.userId, ...input })
        .returning();
      if (!created) throw new Error("Project creation failed");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "PROJECT_CREATED", "project", created.id));
      return reply.code(201).send({ ...created, spentAmount: "0", lifetimeSpentAmount: "0", cashSpentAmount: "0", electronicSpentAmount: "0", expenseCount: 0 });
    });
  });

  app.patch("/api/projects/:id", async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = projectId(request);
    const input = parseBody(projectUpdateSchema, request.body);
    const { version, ...changes } = input;

    return database.withSecurityContext(auth, async (transaction) => {
      const [existing] = await transaction
        .select({ startDate: projects.startDate, endDate: projects.endDate })
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.tenantId, auth.tenantId), eq(projects.ownerUserId, auth.userId), isNull(projects.archivedAt)))
        .limit(1);
      if (!existing) throw notFound();
      const nextStart = changes.startDate ?? existing.startDate;
      const nextEnd = changes.endDate === undefined ? existing.endDate : changes.endDate;
      if (nextEnd && nextEnd < nextStart) {
        const error = new Error("Invalid request data") as Error & { statusCode?: number; code?: string };
        error.statusCode = 422;
        error.code = "VALIDATION_ERROR";
        throw error;
      }

      const [updated] = await transaction
        .update(projects)
        .set({ ...changes, version: sql`${projects.version} + 1` })
        .where(and(
          eq(projects.id, id),
          eq(projects.tenantId, auth.tenantId),
          eq(projects.ownerUserId, auth.userId),
          eq(projects.version, version),
          isNull(projects.archivedAt),
        ))
        .returning();
      if (!updated) throw conflict("VERSION_CONFLICT");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "PROJECT_UPDATED", "project", id));
      return updated;
    });
  });

  app.delete("/api/projects/:id", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = projectId(request);

    await database.withSecurityContext(auth, async (transaction) => {
      const [archived] = await transaction
        .update(projects)
        .set({ archivedAt: new Date(), version: sql`${projects.version} + 1` })
        .where(and(eq(projects.id, id), eq(projects.tenantId, auth.tenantId), eq(projects.ownerUserId, auth.userId), isNull(projects.archivedAt)))
        .returning({ id: projects.id });
      if (!archived) throw notFound();
      await transaction.insert(auditLogs).values(auditValues(request, auth, "PROJECT_ARCHIVED", "project", id));
    });
    return reply.code(204).send();
  });

  app.get("/api/projects/:id/expenses", async (request) => {
    const auth = await authenticate(request);
    const id = projectId(request);

    return database.withSecurityContext(auth, async (transaction) => {
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.tenantId, auth.tenantId), eq(projects.ownerUserId, auth.userId), isNull(projects.archivedAt)))
        .limit(1);
      if (!project) throw notFound();
      return {
        data: await transaction
          .select({
            id: projectExpenses.id,
            description: projectExpenses.description,
            amount: projectExpenses.amount,
            paymentMethod: projectExpenses.paymentMethod,
            spentAt: projectExpenses.spentAt,
            notes: projectExpenses.notes,
            version: projectExpenses.version,
            createdAt: projectExpenses.createdAt,
          })
          .from(projectExpenses)
          .where(and(
            eq(projectExpenses.projectId, id),
            eq(projectExpenses.tenantId, auth.tenantId),
            eq(projectExpenses.ownerUserId, auth.userId),
            isNull(projectExpenses.deletedAt),
          ))
          .orderBy(desc(projectExpenses.spentAt), desc(projectExpenses.createdAt)),
      };
    });
  });

  app.post("/api/projects/:id/expenses", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = projectId(request);
    const input = parseBody(expenseCreateSchema, request.body);

    return database.withSecurityContext(auth, async (transaction) => {
      const [project] = await transaction
        .select({ id: projects.id, startDate: projects.startDate, endDate: projects.endDate })
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.tenantId, auth.tenantId), eq(projects.ownerUserId, auth.userId), isNull(projects.archivedAt)))
        .limit(1);
      if (!project) throw notFound();
      if (input.spentAt < project.startDate || (project.endDate && input.spentAt > project.endDate)) {
        const error = new Error("Invalid request data") as Error & { statusCode?: number; code?: string };
        error.statusCode = 422;
        error.code = "VALIDATION_ERROR";
        throw error;
      }
      const [created] = await transaction
        .insert(projectExpenses)
        .values({ tenantId: auth.tenantId, projectId: id, ownerUserId: auth.userId, ...input })
        .returning();
      if (!created) throw new Error("Project expense creation failed");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "PROJECT_EXPENSE_CREATED", "project_expense", created.id));
      return reply.code(201).send(created);
    });
  });

  app.patch("/api/projects/:projectId/expenses/:expenseId", async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const { projectId: id, expenseId } = expenseIds(request);
    const input = parseBody(expenseUpdateSchema, request.body);
    const { version, ...changes } = input;

    return database.withSecurityContext(auth, async (transaction) => {
      const [updated] = await transaction
        .update(projectExpenses)
        .set({ ...changes, version: sql`${projectExpenses.version} + 1` })
        .where(and(
          eq(projectExpenses.id, expenseId),
          eq(projectExpenses.projectId, id),
          eq(projectExpenses.tenantId, auth.tenantId),
          eq(projectExpenses.ownerUserId, auth.userId),
          eq(projectExpenses.version, version),
          isNull(projectExpenses.deletedAt),
        ))
        .returning();
      if (!updated) throw conflict("VERSION_CONFLICT");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "PROJECT_EXPENSE_UPDATED", "project_expense", expenseId));
      return updated;
    });
  });

  app.delete("/api/projects/:projectId/expenses/:expenseId", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const { projectId: id, expenseId } = expenseIds(request);

    await database.withSecurityContext(auth, async (transaction) => {
      const [removed] = await transaction
        .update(projectExpenses)
        .set({ deletedAt: new Date(), version: sql`${projectExpenses.version} + 1` })
        .where(and(
          eq(projectExpenses.id, expenseId),
          eq(projectExpenses.projectId, id),
          eq(projectExpenses.tenantId, auth.tenantId),
          eq(projectExpenses.ownerUserId, auth.userId),
          isNull(projectExpenses.deletedAt),
        ))
        .returning({ id: projectExpenses.id });
      if (!removed) throw notFound();
      await transaction.insert(auditLogs).values(auditValues(request, auth, "PROJECT_EXPENSE_DELETED", "project_expense", expenseId));
    });
    return reply.code(204).send();
  });
}
