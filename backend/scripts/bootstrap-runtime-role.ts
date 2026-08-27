import "dotenv/config";
import postgres from "postgres";

const configuredMigrationUrl = process.env.DATABASE_MIGRATION_URL;
const configuredApplicationPassword = process.env.YAHRO_APP_PASSWORD;

if (!configuredMigrationUrl) throw new Error("DATABASE_MIGRATION_URL is required");
if (!configuredApplicationPassword || configuredApplicationPassword.length < 32) {
  throw new Error("YAHRO_APP_PASSWORD must contain at least 32 characters");
}
const migrationUrl: string = configuredMigrationUrl;
const applicationPassword: string = configuredApplicationPassword;

const sql = postgres(migrationUrl, { max: 1, prepare: false, onnotice: () => undefined });

function isInsufficientPrivilege(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42501";
}

async function configureRuntimeRole() {
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

  try {
    await sql.unsafe(formatted.command);
    await sql.unsafe("alter role yahro_app set statement_timeout = '10s'");
    await sql.unsafe("alter role yahro_app set lock_timeout = '3s'");
    await sql.unsafe("alter role yahro_app set idle_in_transaction_session_timeout = '10s'");
  } catch (error) {
    // Managed providers can allow role creation while denying later ALTER ROLE
    // commands. Reuse an existing role only when it already passes every check.
    if (!role?.exists || !isInsufficientPrivilege(error)) throw error;
  }
}

async function verifyRuntimeCredentials() {
  const runtimeUrl = new URL(migrationUrl);
  runtimeUrl.username = "yahro_app";
  runtimeUrl.password = applicationPassword;
  const runtimeSql = postgres(runtimeUrl.toString(), {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    onnotice: () => undefined,
  });
  try {
    const [identity] = await runtimeSql<{ user: string }[]>`select current_user as "user"`;
    if (identity?.user !== "yahro_app") throw new Error("Unexpected PostgreSQL runtime identity");
  } catch {
    throw new Error(
      "The existing yahro_app role cannot authenticate with YAHRO_APP_PASSWORD. " +
      "Restore the password used when the role was created or recreate the database before deploying.",
    );
  } finally {
    await runtimeSql.end().catch(() => undefined);
  }
}

try {
  await sql`select pg_advisory_lock(hashtext('yahro_runtime_role_bootstrap'))`;
  await configureRuntimeRole();

  const [verified] = await sql<{
    canLogin: boolean;
    superuser: boolean;
    createDatabase: boolean;
    createRole: boolean;
    inherit: boolean;
    bypassRls: boolean;
    configuration: string[] | null;
  }[]>`
    select rolcanlogin as "canLogin", rolsuper as superuser, rolcreatedb as "createDatabase",
      rolcreaterole as "createRole", rolinherit as inherit, rolbypassrls as "bypassRls",
      rolconfig as configuration
    from pg_roles where rolname = 'yahro_app'
  `;
  if (
    !verified?.canLogin || verified.superuser || verified.createDatabase ||
    verified.createRole || verified.inherit || verified.bypassRls
  ) {
    throw new Error("The yahro_app role does not satisfy the required security restrictions");
  }
  const requiredConfiguration = [
    "statement_timeout=10s",
    "lock_timeout=3s",
    "idle_in_transaction_session_timeout=10s",
  ];
  if (!requiredConfiguration.every((setting) => verified.configuration?.includes(setting))) {
    throw new Error("The yahro_app role does not have the required PostgreSQL safety timeouts");
  }
  await verifyRuntimeCredentials();
  process.stdout.write("Runtime PostgreSQL role yahro_app is ready.\n");
} finally {
  await sql`select pg_advisory_unlock(hashtext('yahro_runtime_role_bootstrap'))`.catch(() => undefined);
  await sql.end();
}
