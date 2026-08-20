#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$YAHRO_APP_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE yahro_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yahro_app')
\gexec

ALTER ROLE yahro_app SET statement_timeout = '10s';
ALTER ROLE yahro_app SET idle_in_transaction_session_timeout = '10s';
SQL
