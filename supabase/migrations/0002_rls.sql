-- Row Level Security.
--
-- Los permisos se cumplen en el servidor aunque el cliente esté comprometido.
-- PowerSync NO pasa por acá para leer: replica con un rol BYPASSRLS y el
-- recorte de datos lo hacen las sync rules. RLS gobierna las ESCRITURAS (que
-- suben por PostgREST con el JWT del usuario) y las lecturas de la web admin.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- security definer para no recursar: estas funciones consultan `perfiles`, que
-- a su vez tiene RLS. Sin definer, evaluar la política dispararía la política.
create or replace function public.perfil_activo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = auth.uid() and p.activo
  );
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = auth.uid() and p.activo and p.rol = 'admin'
  );
$$;

comment on function public.perfil_activo() is
  'Usuario autenticado con perfil activo. Desactivar la cuenta corta el acceso al instante.';

-- ---------------------------------------------------------------------------
-- perfiles
-- ---------------------------------------------------------------------------

alter table perfiles enable row level security;

-- Todos leen todos los perfiles: la app necesita resolver "registrado por" a un
-- nombre, y son 4–6 filas sin datos sensibles.
create policy perfiles_lectura on perfiles
  for select to authenticated using (perfil_activo());

create policy perfiles_alta_admin on perfiles
  for insert to authenticated with check (es_admin());

create policy perfiles_edicion_admin on perfiles
  for update to authenticated using (es_admin()) with check (es_admin());

-- ---------------------------------------------------------------------------
-- ovejas
-- ---------------------------------------------------------------------------

alter table ovejas enable row level security;

create policy ovejas_lectura on ovejas
  for select to authenticated using (perfil_activo());

-- R9: alta manual en campo. El autor queda clavado al usuario autenticado; no
-- se puede registrar en nombre de otro.
create policy ovejas_alta on ovejas
  for insert to authenticated
  with check (perfil_activo() and actualizado_por = auth.uid());

create policy ovejas_edicion on ovejas
  for update to authenticated
  using (perfil_activo())
  with check (actualizado_por = auth.uid());

-- ---------------------------------------------------------------------------
-- partos
-- ---------------------------------------------------------------------------

alter table partos enable row level security;

create policy partos_lectura on partos
  for select to authenticated using (perfil_activo());

create policy partos_alta on partos
  for insert to authenticated
  with check (
    perfil_activo()
    and creado_por = auth.uid()
    and actualizado_por = auth.uid()
  );

create policy partos_edicion on partos
  for update to authenticated
  using (perfil_activo())
  with check (actualizado_por = auth.uid());

-- ---------------------------------------------------------------------------
-- corderos
-- ---------------------------------------------------------------------------

alter table corderos enable row level security;

create policy corderos_lectura on corderos
  for select to authenticated using (perfil_activo());

create policy corderos_alta on corderos
  for insert to authenticated
  with check (
    perfil_activo()
    and creado_por = auth.uid()
    and actualizado_por = auth.uid()
  );

create policy corderos_edicion on corderos
  for update to authenticated
  using (perfil_activo())
  with check (actualizado_por = auth.uid());

-- ---------------------------------------------------------------------------
-- Privilegios explícitos
-- ---------------------------------------------------------------------------

-- Supabase tiene una opción "Automatically expose new tables" que otorga estos
-- privilegios sola. Declararlos acá hace que el esquema funcione con esa opción
-- prendida o apagada, y deja escrito qué puede hacer cada rol en vez de
-- heredarlo de una casilla del panel.
--
-- Sin estos grants, PowerSync sube por PostgREST y recibe 42501: mi clasificador
-- lo trataría como error de dato y descartaría el parto.
grant select, insert, update on ovejas, partos, corderos to authenticated;
grant select, insert, update on perfiles to authenticated;

-- ---------------------------------------------------------------------------
-- Sin borrado físico, en ninguna tabla
-- ---------------------------------------------------------------------------

-- No hay políticas de delete, así que RLS ya lo impide. El revoke lo hace
-- explícito y sobrevive a que alguien agregue una política por descuido.
revoke delete on perfiles, ovejas, partos, corderos from authenticated, anon;
revoke all on perfiles, ovejas, partos, corderos from anon;
