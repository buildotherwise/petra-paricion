#!/usr/bin/env bash
# Corre las migraciones y los tests de auditoría contra una base desechable.
#
# No es un entorno de desarrollo: se crea, valida y se destruye. Sirve para no
# descubrir un error de sintaxis aplicando una migración contra el proyecto
# real en plena parición.
#
# Usa el Postgres local si hay uno corriendo; si no, levanta uno en Docker.
#
#   ./scripts/verificar-sql.sh

set -euo pipefail

BASE=petra_verificacion_sql
CONTENEDOR=petra-verificacion-sql
PUERTO=55432
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USANDO_DOCKER=0

limpiar() {
  if [ "$USANDO_DOCKER" = 1 ]; then
    docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
  else
    dropdb --if-exists "$BASE" 2>/dev/null || true
  fi
}
trap limpiar EXIT

if psql -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "▸ Usando el Postgres local"
  dropdb --if-exists "$BASE"
  createdb "$BASE"
  PSQL=(psql -d "$BASE" -v ON_ERROR_STOP=1 -q)
elif docker info >/dev/null 2>&1; then
  echo "▸ Levantando Postgres 17 en Docker…"
  USANDO_DOCKER=1
  docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
  docker run -d --name "$CONTENEDOR" -e POSTGRES_PASSWORD=postgres \
    -p "${PUERTO}:5432" postgres:17-alpine >/dev/null
  export PGPASSWORD=postgres
  PSQL=(psql -h localhost -p "$PUERTO" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
  for _ in $(seq 1 60); do
    "${PSQL[@]}" -c 'select 1' >/dev/null 2>&1 && break
    sleep 0.5
  done
else
  echo "✗ No hay Postgres local ni Docker corriendo." >&2
  exit 1
fi

echo "▸ Stub del schema auth de Supabase…"
"${PSQL[@]}" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create schema auth;

-- Subconjunto de auth.users suficiente para las claves foráneas y los tests.
create table auth.users (
  id                 uuid primary key,
  instance_id        uuid,
  aud                text,
  role               text,
  email              text,
  encrypted_password text,
  created_at         timestamptz,
  updated_at         timestamptz
);

-- En el stub no hay JWT: auth.uid() se controla con una GUC de sesión, lo que
-- permite simular distintos usuarios.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Supabase otorga esto por defecto en el schema public. Sin ello los revoke de
-- las migraciones no tendrían nada que revocar y el test de blindaje daría un
-- falso verde.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
SQL

echo "▸ Aplicando migraciones…"
for archivo in "$RAIZ"/supabase/migrations/*.sql; do
  echo "   $(basename "$archivo")"
  "${PSQL[@]}" -f "$archivo"
done

echo "▸ Tests de auditoría…"
"${PSQL[@]}" -f "$RAIZ/supabase/tests/auditoria.test.sql"

echo "▸ OK — esquema, RLS y auditoría validados."
