import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { auditLogs, customExchangeRates, officialExchangeRates } from "../db/schema.js";
import { AppError, conflict, notFound } from "../lib/errors.js";
import type { AuthContext } from "../security/authentication.js";
import { requireRole } from "../security/authorization.js";
import { currencySchema, parseBody, uuidSchema } from "../security/validation.js";

interface CurrencyDependencies {
  database: Database;
  authenticate: (request: FastifyRequest) => Promise<AuthContext>;
}

const rateSchema = z.string().regex(/^(0|[1-9]\d{0,14})(\.\d{1,10})?$/).refine((value) => Number(value) > 0);
const amountSchema = z.string().regex(/^-?(0|[1-9]\d{0,14})(\.\d{1,4})?$/);
const pairSchema = z.object({ base: currencySchema, quote: currencySchema, amount: amountSchema.default("1") }).strict();
const customRateSchema = z
  .object({
    baseCurrency: currencySchema,
    quoteCurrency: currencySchema,
    rate: rateSchema,
    label: z.string().trim().min(1).max(120).optional(),
    validFrom: z.coerce.date().default(() => new Date()),
    validUntil: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine((value) => value.baseCurrency !== value.quoteCurrency, { path: ["quoteCurrency"] })
  .refine((value) => !value.validUntil || value.validUntil > value.validFrom, { path: ["validUntil"] });
const customRateUpdateSchema = z
  .object({
    rate: rateSchema.optional(),
    label: z.string().trim().min(1).max(120).nullable().optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    active: z.boolean().optional(),
    version: z.number().int().positive(),
  })
  .strict();

type EcbRow = { CURRENCY?: string; OBS_VALUE?: string; TIME_PERIOD?: string };
const ECB_RATES_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=csvdata";
const MAX_ECB_RESPONSE_BYTES = 2_000_000;
const REFERENCE_CURRENCIES = new Set(["XOF", "XAF", "EUR", "USD", "GBP", "CAD", "CHF", "GHS", "NGN", "GNF", "CDF", "MAD", "TND", "JPY", "CNY"]);
let ratesRefreshInFlight: Promise<void> | null = null;
let lastRatesRefreshAttempt = 0;

function rateId(request: FastifyRequest) {
  return parseBody(z.object({ id: uuidSchema }).strict(), request.params).id;
}

function auditValues(request: FastifyRequest, auth: AuthContext, action: string, entityId: string) {
  return { tenantId: auth.tenantId, actorUserId: auth.userId, action, entityType: "custom_exchange_rate", entityId, requestId: request.id } as const;
}

async function readLimitedText(response: Response, maximumBytes: number) {
  if (!response.body) throw new Error("ECB response body is missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new Error("ECB response is too large");
    }
    chunks.push(value);
  }
  const content = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(content);
}

async function performOfficialRatesRefresh(database: Database) {
  const response = await fetch(ECB_RATES_URL, {
    headers: { Accept: "text/csv", "User-Agent": "Yahro/0.1 exchange-rate-service" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`ECB returned HTTP ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_ECB_RESPONSE_BYTES) throw new Error("ECB response is too large");
  const content = await readLimitedText(response, MAX_ECB_RESPONSE_BYTES);
  const rows = parse(content, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true }) as EcbRow[];
  const fetchedAt = new Date();
  const values = rows.flatMap((row) => {
    if (!row.CURRENCY || !/^[A-Z]{3}$/.test(row.CURRENCY) || !row.OBS_VALUE || !row.TIME_PERIOD) return [];
    if (!/^\d+(\.\d+)?$/.test(row.OBS_VALUE) || Number(row.OBS_VALUE) <= 0) return [];
    const rateDate = new Date(`${row.TIME_PERIOD}T00:00:00.000Z`);
    if (Number.isNaN(rateDate.getTime())) return [];
    return [{ baseCurrency: "EUR", quoteCurrency: row.CURRENCY, rate: row.OBS_VALUE, rateDate, source: "ECB_REFERENCE", fetchedAt }];
  });
  const date = values.reduce((latest, value) => value.rateDate > latest ? value.rateDate : latest, new Date("1970-01-01T00:00:00.000Z"));
  values.push(
    { baseCurrency: "EUR", quoteCurrency: "XOF", rate: "655.957", rateDate: date, source: "BCEAO_FIXED_PARITY", fetchedAt },
    { baseCurrency: "EUR", quoteCurrency: "XAF", rate: "655.957", rateDate: date, source: "BEAC_FIXED_PARITY", fetchedAt },
  );
  if (values.length < 5) throw new Error("ECB response did not contain enough valid rates");

  await database.db
    .insert(officialExchangeRates)
    .values(values)
    .onConflictDoUpdate({
      target: [officialExchangeRates.baseCurrency, officialExchangeRates.quoteCurrency, officialExchangeRates.rateDate, officialExchangeRates.source],
      set: { rate: sql`excluded.rate`, fetchedAt: sql`excluded.fetched_at` },
    });
}

async function refreshOfficialRates(database: Database) {
  if (ratesRefreshInFlight) return ratesRefreshInFlight;
  if (Date.now() - lastRatesRefreshAttempt < 60_000) throw new Error("ECB refresh cooldown is active");
  lastRatesRefreshAttempt = Date.now();
  ratesRefreshInFlight = performOfficialRatesRefresh(database).finally(() => {
    ratesRefreshInFlight = null;
  });
  return ratesRefreshInFlight;
}

async function latestOfficialRate(database: Database, currency: string) {
  if (currency === "EUR") return { rate: "1", rateDate: new Date(), source: "ECB_REFERENCE", fetchedAt: new Date() };
  const [row] = await database.db
    .select({ rate: officialExchangeRates.rate, rateDate: officialExchangeRates.rateDate, source: officialExchangeRates.source, fetchedAt: officialExchangeRates.fetchedAt })
    .from(officialExchangeRates)
    .where(and(eq(officialExchangeRates.baseCurrency, "EUR"), eq(officialExchangeRates.quoteCurrency, currency)))
    .orderBy(desc(officialExchangeRates.rateDate), desc(officialExchangeRates.fetchedAt))
    .limit(1);
  return row;
}

async function officialPair(database: Database, base: string, quote: string) {
  if (!REFERENCE_CURRENCIES.has(base) || !REFERENCE_CURRENCIES.has(quote)) {
    throw new AppError(422, "RATE_UNAVAILABLE", "No reference rate is available for this currency pair");
  }
  let baseRate = await latestOfficialRate(database, base);
  let quoteRate = await latestOfficialRate(database, quote);
  const staleCutoff = Date.now() - 18 * 60 * 60 * 1000;
  const isStale = [baseRate, quoteRate].some((record) => record && record.fetchedAt.getTime() < staleCutoff);
  if (!baseRate || !quoteRate || isStale) {
    try {
      await refreshOfficialRates(database);
      baseRate = await latestOfficialRate(database, base);
      quoteRate = await latestOfficialRate(database, quote);
    } catch {
      if (!baseRate || !quoteRate) throw new AppError(503, "RATE_PROVIDER_UNAVAILABLE", "Exchange rates are temporarily unavailable");
    }
  }
  if (!baseRate || !quoteRate) throw new AppError(422, "RATE_UNAVAILABLE", "No reference rate is available for this currency pair");
  const [calculated] = await database.client<{ rate: string }[]>`
    select (${quoteRate.rate}::numeric / ${baseRate.rate}::numeric)::text as rate
  `;
  if (!calculated) throw new AppError(503, "RATE_PROVIDER_UNAVAILABLE", "Exchange rates are temporarily unavailable");
  return {
    rate: calculated.rate,
    rateDate: baseRate.rateDate < quoteRate.rateDate ? baseRate.rateDate : quoteRate.rateDate,
    source: baseRate.source === quoteRate.source ? baseRate.source : `${baseRate.source}+${quoteRate.source}`,
  };
}

export async function registerCurrencyRoutes(app: FastifyInstance, dependencies: CurrencyDependencies) {
  const { database, authenticate } = dependencies;

  app.get("/api/currencies/convert", async (request) => {
    const auth = await authenticate(request);
    const query = parseBody(pairSchema, request.query);
    if (query.base === query.quote) return { ...query, rate: "1", convertedAmount: query.amount, source: "IDENTITY", rateDate: new Date().toISOString(), custom: false };

    const custom = await database.withSecurityContext(auth, async (transaction) => {
      const [row] = await transaction
        .select()
        .from(customExchangeRates)
        .where(and(
          eq(customExchangeRates.tenantId, auth.tenantId),
          eq(customExchangeRates.ownerUserId, auth.userId),
          eq(customExchangeRates.baseCurrency, query.base),
          eq(customExchangeRates.quoteCurrency, query.quote),
          eq(customExchangeRates.active, true),
          isNull(customExchangeRates.archivedAt),
          lte(customExchangeRates.validFrom, new Date()),
          or(isNull(customExchangeRates.validUntil), gt(customExchangeRates.validUntil, new Date())),
        ))
        .orderBy(desc(customExchangeRates.validFrom))
        .limit(1);
      return row;
    });
    const selected = custom
      ? { rate: custom.rate, rateDate: custom.validFrom, source: custom.label || "CUSTOM", custom: true }
      : { ...(await officialPair(database, query.base, query.quote)), custom: false };
    const [conversion] = await database.client<{ amount: string }[]>`
      select round(${query.amount}::numeric * ${selected.rate}::numeric, 4)::text as amount
    `;
    if (!conversion) throw new AppError(500, "CONVERSION_FAILED", "Currency conversion failed");
    return { ...query, rate: selected.rate, convertedAmount: conversion.amount, source: selected.source, rateDate: selected.rateDate.toISOString(), custom: selected.custom };
  });

  app.get("/api/currencies/custom-rates", async (request) => {
    const auth = await authenticate(request);
    return database.withSecurityContext(auth, async (transaction) => ({
      data: await transaction
        .select()
        .from(customExchangeRates)
        .where(and(eq(customExchangeRates.tenantId, auth.tenantId), eq(customExchangeRates.ownerUserId, auth.userId), isNull(customExchangeRates.archivedAt)))
        .orderBy(desc(customExchangeRates.active), desc(customExchangeRates.updatedAt)),
    }));
  });

  app.post("/api/currencies/custom-rates", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const input = parseBody(customRateSchema, request.body);
    return database.withSecurityContext(auth, async (transaction) => {
      await transaction
        .update(customExchangeRates)
        .set({ active: false, version: sql`${customExchangeRates.version} + 1` })
        .where(and(
          eq(customExchangeRates.ownerUserId, auth.userId),
          eq(customExchangeRates.baseCurrency, input.baseCurrency),
          eq(customExchangeRates.quoteCurrency, input.quoteCurrency),
          eq(customExchangeRates.active, true),
          isNull(customExchangeRates.archivedAt),
        ));
      const [created] = await transaction.insert(customExchangeRates).values({ tenantId: auth.tenantId, ownerUserId: auth.userId, ...input }).returning();
      if (!created) throw new Error("Custom exchange rate creation failed");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "CUSTOM_EXCHANGE_RATE_CREATED", created.id));
      return reply.code(201).send(created);
    });
  });

  app.patch("/api/currencies/custom-rates/:id", async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = rateId(request);
    const input = parseBody(customRateUpdateSchema, request.body);
    const { version, ...changes } = input;
    return database.withSecurityContext(auth, async (transaction) => {
      const [updated] = await transaction
        .update(customExchangeRates)
        .set({ ...changes, version: sql`${customExchangeRates.version} + 1` })
        .where(and(eq(customExchangeRates.id, id), eq(customExchangeRates.ownerUserId, auth.userId), eq(customExchangeRates.version, version), isNull(customExchangeRates.archivedAt)))
        .returning();
      if (!updated) throw conflict("VERSION_CONFLICT");
      await transaction.insert(auditLogs).values(auditValues(request, auth, "CUSTOM_EXCHANGE_RATE_UPDATED", id));
      return updated;
    });
  });

  app.delete("/api/currencies/custom-rates/:id", async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const id = rateId(request);
    await database.withSecurityContext(auth, async (transaction) => {
      const [archived] = await transaction
        .update(customExchangeRates)
        .set({ active: false, archivedAt: new Date(), version: sql`${customExchangeRates.version} + 1` })
        .where(and(eq(customExchangeRates.id, id), eq(customExchangeRates.ownerUserId, auth.userId), isNull(customExchangeRates.archivedAt)))
        .returning({ id: customExchangeRates.id });
      if (!archived) throw notFound();
      await transaction.insert(auditLogs).values(auditValues(request, auth, "CUSTOM_EXCHANGE_RATE_ARCHIVED", id));
    });
    return reply.code(204).send();
  });
}
