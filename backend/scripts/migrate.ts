import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "dotenv/config";
import postgres from "postgres";

const migrationUrl = process.env.DATABASE_MIGRATION_URL;

if (!migrationUrl) {
  throw new Error("DATABASE_MIGRATION_URL is required");
}

const migrationsDirectory = path.resolve(process.cwd(), "migrations");
const sql = postgres(migrationUrl, { max: 1, onnotice: () => undefined });

try {
  await sql`select pg_advisory_lock(hashtext('yahro_schema_migrations'))`;
  await sql`
    create table if not exists public._yahro_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `;

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const content = await readFile(path.join(migrationsDirectory, file), "utf8");
    const checksum = createHash("sha256").update(content).digest("hex");
    const [existing] = await sql<{ checksum: string }[]>`
      select checksum from public._yahro_migrations where name = ${file}
    `;

    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(`Applied migration checksum changed: ${file}`);
      }
      continue;
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(content);
      await transaction`
        insert into public._yahro_migrations (name, checksum) values (${file}, ${checksum})
      `;
    });
    process.stdout.write(`Applied ${file}\n`);
  }
} finally {
  await sql`select pg_advisory_unlock(hashtext('yahro_schema_migrations'))`.catch(() => undefined);
  await sql.end();
}
