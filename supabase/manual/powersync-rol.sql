-- Rol de replicación para PowerSync.
--
-- NO es una migración numerada a propósito: lleva una contraseña, y las
-- migraciones se versionan en git. Se corre una sola vez, a mano.
--
--   psql "$DIRECT_CONNECTION_STRING" \
--     -v powersync_password="$(openssl rand -base64 24)" \
--     -f supabase/manual/powersync-rol.sql
--
-- Guardá esa contraseña: va en la connection string que se le carga a la
-- instancia de PowerSync y no se puede recuperar después.

-- REPLICATION habilita la lectura del WAL.
-- BYPASSRLS es necesario porque el recorte de datos por usuario lo hacen las
-- sync rules, no RLS; sin bypass PowerSync no vería ninguna fila.
create role powersync_role
  with replication bypassrls login password :'powersync_password';

grant select on all tables in schema public to powersync_role;
alter default privileges in schema public grant select on tables to powersync_role;

-- La auditoría no se replica: fuera de la publicación y sin lectura.
revoke select on public.cambios from powersync_role;
