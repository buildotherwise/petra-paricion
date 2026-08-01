-- Auditoría por triggers.
--
-- Por qué triggers y no escrituras desde la app: nada puede saltearse la
-- auditoría. Ni la web admin, ni un fix manual por SQL, ni un cliente
-- comprometido. La app solo tiene que decir QUIÉN es; el resto lo garantiza
-- la base.

create table cambios (
  id             bigint generated always as identity primary key,
  tabla          text not null,
  registro_id    uuid not null,
  tipo           text not null check (tipo in ('creacion', 'actualizacion')),
  campo          text,              -- null en 'creacion'
  valor_anterior text,
  valor_nuevo    text,
  realizado_por  uuid not null references auth.users(id),
  dispositivo    text,

  -- Doble timestamp. En un flujo offline estos dos valores difieren, y esa
  -- diferencia es información, no ruido: una corrección hecha el lunes sin
  -- señal llega al servidor el miércoles.
  realizado_en   timestamptz not null default now(),  -- reloj del SERVIDOR
  reportado_en   timestamptz,                          -- reloj del DISPOSITIVO

  constraint campo_solo_en_actualizacion check (
    (tipo = 'creacion' and campo is null) or
    (tipo = 'actualizacion' and campo is not null)
  )
);

comment on column cambios.realizado_en is
  'now() del servidor: el momento de la SINCRONIZACIÓN. Es el timestamp confiable.';
comment on column cambios.reportado_en is
  'actualizado_en que reporta el dispositivo: el momento de la EDICIÓN. Informativo — el reloj del aparato puede estar mal.';

create index cambios_registro_idx on cambios (tabla, registro_id, realizado_en desc);
create index cambios_autor_idx    on cambios (realizado_por, realizado_en desc);

-- ---------------------------------------------------------------------------
-- El trigger
-- ---------------------------------------------------------------------------

create or replace function public.auditar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Metadatos de la fila, no contenido: auditarlos generaría una fila de
  -- cambio en cada edición diciendo "cambió la hora de edición".
  ignorados constant text[] :=
    array['creado_en', 'creado_por', 'actualizado_en', 'actualizado_por', 'dispositivo'];

  fila_nueva  jsonb := to_jsonb(new);
  fila_vieja  jsonb;
  autor       uuid;
  aparato     text;
  reportado   timestamptz;
  clave       text;
begin
  autor     := (fila_nueva ->> 'actualizado_por')::uuid;
  aparato   := fila_nueva ->> 'dispositivo';
  reportado := (fila_nueva ->> 'actualizado_en')::timestamptz;

  -- Sin autor solo puede venir de la importación server-side de ovejas, que es
  -- una acción deliberada y acotada. En partos y corderos `actualizado_por` es
  -- not null, así que ahí esta rama es inalcanzable.
  if autor is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into cambios (tabla, registro_id, tipo, campo, valor_anterior, valor_nuevo,
                         realizado_por, dispositivo, reportado_en)
    values (tg_table_name, new.id, 'creacion', null, null, null,
            autor, aparato, reportado);
    return new;
  end if;

  fila_vieja := to_jsonb(old);

  for clave in select jsonb_object_keys(fila_nueva) loop
    continue when clave = any(ignorados);

    if fila_vieja ->> clave is distinct from fila_nueva ->> clave then
      insert into cambios (tabla, registro_id, tipo, campo, valor_anterior, valor_nuevo,
                           realizado_por, dispositivo, reportado_en)
      values (tg_table_name, new.id, 'actualizacion', clave,
              fila_vieja ->> clave, fila_nueva ->> clave,
              autor, aparato, reportado);
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.auditar() is
  'INSERT → una fila resumen. UPDATE → una fila por campo realmente cambiado.';

create trigger auditar_ovejas   after insert or update on ovejas
  for each row execute function public.auditar();
create trigger auditar_partos   after insert or update on partos
  for each row execute function public.auditar();
create trigger auditar_corderos after insert or update on corderos
  for each row execute function public.auditar();

-- ---------------------------------------------------------------------------
-- Blindaje
-- ---------------------------------------------------------------------------

alter table cambios enable row level security;

-- Única política de la tabla: lectura para admin. No hay insert/update/delete
-- para nadie — la única vía de escritura es el trigger, que como SECURITY
-- DEFINER corre con los privilegios del dueño de la tabla.
create policy cambios_lectura_admin on cambios
  for select to authenticated using (es_admin());

revoke all on cambios from authenticated, anon;
grant select on cambios to authenticated;

-- NO usar `force row level security` acá: forzaría RLS también para el dueño y
-- dejaría al trigger sin poder escribir. La ausencia de este comando es
-- deliberada.

comment on table cambios is
  'Auditoría. Solo la escribe el trigger auditar(); solo la lee un admin. Fuera de la publicación de PowerSync: no se replica a los dispositivos.';
