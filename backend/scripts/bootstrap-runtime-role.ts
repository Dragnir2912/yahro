import "dotenv/config";
import postgres from "postgres";

const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const applicationPassword = process.env.YAHRO_APP_PASSWORD;

if (!migrationUrl) throw new Error("DATABASE_MIGRATION_URL is required");
if (!applicationPassword || applicationPassword.length < 32) {
  throw new Error("YAHRO_APP_PASSWORD must contain at least 32 characters");
}

const sql = postgres(migrationUrl, { max: 1, prepare: false, onnotice: () => undefined });

try {
  await sql`select pg_advisory_lock(hashtext('yahro_runtime_role_bootstrap'))`;
  const [role] = await sql<{ exists: boolean }[]>`
    select exists(select 1 from pg_roles where rolname = 'yahro_app') as exists
  `;
  const commandTemplate = role?.exists
    ? "alter role yahro_app login password %L nosuperuser nocreatedb nocreaterole noinherit nobypassrls"
    : "create role yahro_app login password %L nosuperuser nocreatedb nocreaterole noinherit nobypassrls";
  const [formatted] = await sql<{ command: string }[]>`
    select format(${commandTemplate}::text, ${applicationPassword}::text) as command
  `;
  if (!formatted?.command) throw new Error("Unable to prepare the runtime role command");
  await sql.unsafe(formatted.command);
  await sql.unsafe("alter role yahro_app set statement_timeout = '10s'");
  await sql.unsafe("alter role yahro_app set lock_timeout = '3s'");
  await sql.unsafe("alter role yahro_app set idle_in_transaction_session_timeout = '10s'");

  const [verified] = await sql<{
    canLogin: boolean;
    superuser: boolean;
    createDatabase: boolean;
    createRole: boolean;
    inherit: boolean;
    bypassRls: boolean;
  }[]>`
    select rolcanlogin as "canLogin", rolsuper as superuser, rolcreatedb as "createDatabase",
      rolcreaterole as "createRole", rolinherit as inherit, rolbypassrls as "bypassRls"
    from pg_roles where rolname = 'yahro_app'
  `;
  if (
    !verified?.canLogin || verified.superuser || verified.createDatabase ||
    verified.createRole || verified.inherit || verified.bypassRls
  ) {
    throw new Error("The yahro_app role does not satisfy the required security restrictions");
  }
  process.stdout.write("Runtime PostgreSQL role yahro_app is ready.\n");
} finally {
  await sql`select pg_advisory_unlock(hashtext('yahro_runtime_role_bootstrap'))`.catch(() => undefined);
  await sql.end();
}
