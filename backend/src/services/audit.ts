import type { InferInsertModel } from "drizzle-orm";
import type { DatabaseTransaction } from "../db/client.js";
import { auditLogs } from "../db/schema.js";

type AuditInsert = InferInsertModel<typeof auditLogs>;

export function writeAudit(
  transaction: DatabaseTransaction,
  event: Omit<AuditInsert, "id" | "createdAt">,
) {
  return transaction.insert(auditLogs).values(event);
}
