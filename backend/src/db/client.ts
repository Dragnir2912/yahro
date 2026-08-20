import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import type { AppConfig } from "../config.js";
import * as schema from "./schema.js";

export function createDatabase(config: AppConfig) {
  const client = postgres(config.databaseUrl, {
    max: config.nodeEnv === "test" ? 2 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    prepare: true,
    transform: postgres.camel,
    onnotice: () => undefined,
  });
  const db = drizzle(client, { schema });

  type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

  async function withSecurityContext<T>(
    context: { userId: string; tenantId: string },
    work: (transaction: Transaction) => Promise<T>,
  ) {
    return db.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('app.user_id', ${context.userId}, true)`);
      await transaction.execute(sql`select set_config('app.tenant_id', ${context.tenantId}, true)`);
      return work(transaction);
    });
  }

  async function withUserContext<T>(userId: string, work: (transaction: Transaction) => Promise<T>) {
    return db.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      return work(transaction);
    });
  }

  return {
    client,
    db,
    withSecurityContext,
    withUserContext,
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDatabase>;
export type DatabaseTransaction = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];
