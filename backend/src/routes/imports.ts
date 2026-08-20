import { createHash } from "node:crypto";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { fileTypeFromBuffer } from "file-type";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { accounts, auditLogs, importJobs, transactions } from "../db/schema.js";
import { AppError, conflict, notFound } from "../lib/errors.js";
import type { AuthContext } from "../security/authentication.js";
import { requireRole } from "../security/authorization.js";
import { parseBody, uuidSchema } from "../security/validation.js";

interface ImportDependencies {
  config: AppConfig;
  database: Database;
  authenticate: (request: FastifyRequest) => Promise<AuthContext>;
}

const previewQuerySchema = z.object({ accountId: uuidSchema }).strict();
const commitQuerySchema = z.object({ jobId: uuidSchema }).strict();
const mappingSchema = z
  .object({
    dateColumn: z.string().min(1).max(120),
    descriptionColumn: z.string().min(1).max(120),
    amountColumn: z.string().min(1).max(120),
    merchantColumn: z.string().min(1).max(120).optional(),
    dateFormat: z.enum(["ISO", "DD/MM/YYYY", "MM/DD/YYYY"]).default("ISO"),
    decimalSeparator: z.enum([".", ","]).default("."),
    mode: z.enum(["ATOMIC", "VALID_ONLY"]).default("ATOMIC"),
  })
  .strict();

interface UploadedCsv {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  fields: Record<string, string>;
}

interface ParsedRow {
  row: number;
  date: Date;
  description: string;
  merchant?: string;
  amount: string;
  type: "INCOME" | "EXPENSE";
}

function safeFilename(filename: string) {
  const cleaned = Array.from(path.basename(filename))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  return cleaned.slice(0, 255) || "statement.csv";
}

async function collectCsv(request: FastifyRequest): Promise<UploadedCsv> {
  let file: Omit<UploadedCsv, "fields"> | undefined;
  const fields: Record<string, string> = {};

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (file) throw new AppError(422, "TOO_MANY_FILES", "Only one CSV file is allowed");
      file = {
        buffer: await part.toBuffer(),
        filename: safeFilename(part.filename),
        mimetype: part.mimetype,
      };
    } else if (typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
  }
  if (!file) throw new AppError(422, "FILE_REQUIRED", "A CSV file is required");
  return { ...file, fields };
}

async function validateCsvFile(file: UploadedCsv, maxRows: number) {
  const detected = await fileTypeFromBuffer(file.buffer);
  if (detected) throw new AppError(415, "INVALID_FILE_TYPE", "The uploaded file is not plain CSV text");
  if (file.buffer.includes(0)) throw new AppError(415, "INVALID_FILE_TYPE", "Binary files are not accepted");

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(file.buffer);
  } catch {
    throw new AppError(422, "INVALID_ENCODING", "CSV files must use UTF-8 encoding");
  }
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"] as const;
  const delimiter = candidates
    .map((candidate) => ({ candidate, count: firstLine.split(candidate).length - 1 }))
    .sort((left, right) => right.count - left.count)[0];
  if (!delimiter || delimiter.count < 1) throw new AppError(422, "INVALID_CSV", "Unable to detect CSV columns");

  let rows: Record<string, string>[];
  try {
    rows = parse(source, {
      bom: true,
      columns: true,
      delimiter: delimiter.candidate,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: true,
      to_line: maxRows + 2,
    }) as Record<string, string>[];
  } catch {
    throw new AppError(422, "INVALID_CSV", "The CSV structure is invalid");
  }
  if (rows.length === 0) throw new AppError(422, "EMPTY_CSV", "The CSV file contains no data rows");
  if (rows.length > maxRows) throw new AppError(413, "TOO_MANY_ROWS", "The CSV row limit was exceeded");
  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0 || headers.length > 50 || headers.some((header) => !header || header.length > 120)) {
    throw new AppError(422, "INVALID_CSV_HEADERS", "CSV headers are invalid");
  }
  return { rows, headers, delimiter: delimiter.candidate };
}

function parseDate(value: string, format: z.infer<typeof mappingSchema>["dateFormat"]) {
  let iso: string;
  const clean = value.trim();
  if (format === "ISO") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean);
    if (!match) return null;
    iso = `${match[1]}-${match[2]}-${match[3]}`;
  } else {
    const match = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(clean);
    if (!match) return null;
    iso = format === "DD/MM/YYYY" ? `${match[3]}-${match[2]}-${match[1]}` : `${match[3]}-${match[1]}-${match[2]}`;
  }
  const date = new Date(`${iso}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : date;
}

function mapRows(rows: Record<string, string>[], mapping: z.infer<typeof mappingSchema>) {
  const valid: ParsedRow[] = [];
  const errors: Array<{ row: number; code: string }> = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const date = parseDate(row[mapping.dateColumn] ?? "", mapping.dateFormat);
    const description = (row[mapping.descriptionColumn] ?? "").trim();
    let amount = (row[mapping.amountColumn] ?? "").replace(/\s/g, "");
    if (mapping.decimalSeparator === ",") amount = amount.replace(/\./g, "").replace(",", ".");
    else amount = amount.replace(/,/g, "");
    if (!date) errors.push({ row: rowNumber, code: "INVALID_DATE" });
    else if (!description || description.length > 240) errors.push({ row: rowNumber, code: "INVALID_DESCRIPTION" });
    else if (!/^-?(0|[1-9]\d{0,14})(\.\d{1,4})?$/.test(amount) || Number(amount) === 0) {
      errors.push({ row: rowNumber, code: "INVALID_AMOUNT" });
    } else {
      const negative = amount.startsWith("-");
      valid.push({
        row: rowNumber,
        date,
        description,
        ...(mapping.merchantColumn && row[mapping.merchantColumn]?.trim()
          ? { merchant: row[mapping.merchantColumn]!.trim().slice(0, 160) }
          : {}),
        amount: negative ? amount.slice(1) : amount,
        type: negative ? "EXPENSE" : "INCOME",
      });
    }
  });
  return { valid, errors };
}

export async function registerImportRoutes(app: FastifyInstance, dependencies: ImportDependencies) {
  const { config, database, authenticate } = dependencies;

  app.post("/api/imports/preview", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const query = parseBody(previewQuerySchema, request.query);
    const file = await collectCsv(request);
    const parsed = await validateCsvFile(file, config.maxCsvRows);
    const fileHash = createHash("sha256").update(file.buffer).digest("hex");

    return database.withSecurityContext(auth, async (transaction) => {
      const [account] = await transaction
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, query.accountId), eq(accounts.tenantId, auth.tenantId), isNull(accounts.archivedAt)))
        .limit(1);
      if (!account) throw notFound();
      const [existing] = await transaction
        .select({ id: importJobs.id, status: importJobs.status })
        .from(importJobs)
        .where(and(eq(importJobs.tenantId, auth.tenantId), eq(importJobs.fileHash, fileHash)))
        .limit(1);
      if (existing) throw conflict("IMPORT_ALREADY_EXISTS");

      const [job] = await transaction
        .insert(importJobs)
        .values({
          tenantId: auth.tenantId,
          accountId: account.id,
          createdById: auth.userId,
          originalFilename: file.filename,
          fileHash,
          rowCount: parsed.rows.length,
          mapping: {},
        })
        .returning({ id: importJobs.id });
      if (!job) throw new Error("Import preview creation failed");
      await transaction.insert(auditLogs).values({
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        action: "IMPORT_PREVIEW_CREATED",
        entityType: "import_job",
        entityId: job.id,
        requestId: request.id,
      });
      return reply.code(201).send({
        data: {
          jobId: job.id,
          headers: parsed.headers,
          delimiter: parsed.delimiter === "\t" ? "TAB" : parsed.delimiter,
          rowCount: parsed.rows.length,
          sample: parsed.rows.slice(0, 20),
        },
      });
    });
  });

  app.post("/api/imports/commit", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request) => {
    const auth = await authenticate(request);
    requireRole(auth.role, "MEMBER");
    const query = parseBody(commitQuerySchema, request.query);
    const file = await collectCsv(request);
    const mappingValue = file.fields.mapping;
    if (!mappingValue) throw new AppError(422, "MAPPING_REQUIRED", "A column mapping is required");
    let mappingJson: unknown;
    try {
      mappingJson = JSON.parse(mappingValue);
    } catch {
      throw new AppError(422, "INVALID_MAPPING", "The column mapping is invalid");
    }
    const mapping = parseBody(mappingSchema, mappingJson);
    const parsed = await validateCsvFile(file, config.maxCsvRows);
    const mapped = mapRows(parsed.rows, mapping);
    if (mapping.mode === "ATOMIC" && mapped.errors.length > 0) {
      throw new AppError(422, "IMPORT_ROWS_INVALID", "The import contains invalid rows");
    }
    if (mapped.valid.length === 0) throw new AppError(422, "NO_VALID_ROWS", "The import contains no valid rows");
    const fileHash = createHash("sha256").update(file.buffer).digest("hex");

    return database.withSecurityContext(auth, async (transaction) => {
      const [job] = await transaction
        .select({
          id: importJobs.id,
          accountId: importJobs.accountId,
          fileHash: importJobs.fileHash,
          status: importJobs.status,
        })
        .from(importJobs)
        .where(and(eq(importJobs.id, query.jobId), eq(importJobs.tenantId, auth.tenantId)))
        .limit(1);
      if (!job || job.status !== "PREVIEW" || !safeHashEqual(job.fileHash, fileHash)) throw conflict("IMPORT_PREVIEW_MISMATCH");
      const [account] = await transaction
        .select({ currency: accounts.currency })
        .from(accounts)
        .where(and(eq(accounts.id, job.accountId), eq(accounts.tenantId, auth.tenantId), isNull(accounts.archivedAt)))
        .limit(1);
      if (!account) throw notFound();

      let inserted = 0;
      for (let offset = 0; offset < mapped.valid.length; offset += 250) {
        const chunk = mapped.valid.slice(offset, offset + 250);
        const created = await transaction
          .insert(transactions)
          .values(
            chunk.map((row) => ({
              tenantId: auth.tenantId,
              accountId: job.accountId,
              createdById: auth.userId,
              importJobId: job.id,
              importFingerprint: createHash("sha256")
                .update(`${auth.tenantId}|${job.accountId}|${row.date.toISOString()}|${row.description}|${row.amount}|${row.type}`)
                .digest("hex"),
              type: row.type,
              amount: row.amount,
              currency: account.currency,
              transactionDate: row.date,
              description: row.description,
              ...(row.merchant ? { merchant: row.merchant } : {}),
            })),
          )
          .onConflictDoNothing()
          .returning({ id: transactions.id });
        inserted += created.length;
      }

      await transaction
        .update(importJobs)
        .set({
          status: "COMMITTED",
          mapping: {
            dateColumn: mapping.dateColumn,
            descriptionColumn: mapping.descriptionColumn,
            amountColumn: mapping.amountColumn,
            dateFormat: mapping.dateFormat,
            decimalSeparator: mapping.decimalSeparator,
            mode: mapping.mode,
            ...(mapping.merchantColumn ? { merchantColumn: mapping.merchantColumn } : {}),
          },
          acceptedCount: inserted,
          rejectedCount: mapped.errors.length + (mapped.valid.length - inserted),
          errorReport: mapped.errors.slice(0, 500),
          committedAt: new Date(),
        })
        .where(and(eq(importJobs.id, job.id), eq(importJobs.status, "PREVIEW")));
      await transaction.insert(auditLogs).values({
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        action: "IMPORT_COMMITTED",
        entityType: "import_job",
        entityId: job.id,
        requestId: request.id,
        metadata: { inserted, rejected: mapped.errors.length + (mapped.valid.length - inserted) },
      });
      return { data: { jobId: job.id, inserted, rejected: mapped.errors.length + (mapped.valid.length - inserted) } };
    });
  });
}

function safeHashEqual(left: string, right: string) {
  return left.length === right.length && left === right;
}
