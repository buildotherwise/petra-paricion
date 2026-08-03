-- Los servicios de la temporada: hechos reproductivos, no atributos de la oveja.
--
-- El modelo tenía dos columnas para esto desde 0001 —`ovejas.fecha_inseminacion`
-- (un date) y `ovejas.padre` (un text)— y el archivo real de la temporada 2026
-- mostró que no alcanzan ni de lejos: son 1.359 hechos sobre 503 ovejas, hasta
-- CUATRO por oveja, y 446 de ellas fueron servidas por más de un padre.
--
-- El vocabulario, que el Excel trae mezclado en dos hojas:
--
--   · SERVICIO (inseminacion): la inseminación artificial. Fecha puntual, padre
--     cierto en ese acto. Hasta tres por oveja, separadas ~15 días — son las que
--     volvieron a entrar en celo.
--   · ENCARNERADA: el repaso. El carnero suelto con el lote para levantar las
--     que no quedaron preñadas. Va con RANGO de fechas, no con fecha.
--
-- Por qué UNA tabla con rango y no dos tablas con la forma «natural» de cada
-- tipo: la pregunta que se le hace a estos datos es siempre «los servicios de
-- esta oveja», nunca «sus inseminaciones». Dos tablas obligarían a un union all
-- en la primera línea de cada consulta. Con la inseminación modelada como un
-- rango de un día, la ventana de parto esperado es UNA fórmula sin ramas:
--
--   [fecha_inicio + 145, fecha_fin + 155]
--
-- La cabaña (PETRA / PETRA POLL) es del PADRE, no de la madre.

create type servicio_t as enum ('inseminacion', 'encarnerada');

create table servicios (
  id           uuid primary key default gen_random_uuid(),
  oveja_id     uuid not null references ovejas(id),
  tipo         servicio_t not null,
  fecha_inicio date not null,
  fecha_fin    date not null,

  -- text y no numérico, por lo mismo que la caravana: '32' y '0032' pueden ser
  -- dos carneros distintos, y un int borraría la diferencia en silencio.
  padre        text not null,
  cabana       text,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Nullable, igual que en `ovejas` y por la misma razón: la carga de referencia
  -- de la temporada corre server-side, sin usuario. El trigger auditar() ya
  -- tiene la rama para eso, y es la correcta acá — auditar 1.359 filas de un
  -- archivo que nadie tipeó sería ruido, no trazabilidad. Una corrección hecha
  -- después desde la web sí viaja firmada.
  actualizado_por uuid references auth.users(id),
  dispositivo     text,

  constraint servicio_bien_ordenado check (fecha_fin >= fecha_inicio),

  -- Si una inseminación trae rango, el archivo se leyó mal: son dos columnas
  -- distintas del Excel que terminaron en la misma fila.
  constraint inseminacion_puntual check (
    tipo <> 'inseminacion' or fecha_fin = fecha_inicio
  ),

  constraint padre_no_vacio check (btrim(padre) <> ''),

  -- La clave de idempotencia. Es lo que hace que reejecutar la importación sea
  -- inocuo: el `on conflict do nothing` del script apunta acá, así que el no-op
  -- lo garantiza el servidor y no la prolijidad de quien corre el script.
  constraint servicios_idempotencia unique (oveja_id, tipo, fecha_inicio, padre)
);

comment on table servicios is
  'Inseminaciones y encarneradas de la temporada. La IA es un rango de un día: la ventana de parto esperado es siempre [fecha_inicio+145, fecha_fin+155]. No se replica a los dispositivos.';
comment on column servicios.cabana is
  'PETRA / PETRA POLL. Es del padre, no de la madre.';

-- ---------------------------------------------------------------------------
-- Quién puede: es dato de administración, como `cambios`
-- ---------------------------------------------------------------------------

-- La app de campo no muestra el padre en ningún flujo, así que esta tabla no
-- entra en la publicación de PowerSync ni en las sync rules: no se replica. La
-- lee la web admin, online, a través de las vistas de métricas.
--
-- Y a diferencia de ovejas/partos/corderos —donde ninguna política distingue
-- admin de operador— acá el rol sí manda. Es la segunda tabla del esquema que
-- el servidor protege de verdad por rol.
alter table servicios enable row level security;

create policy servicios_lectura_admin on servicios
  for select to authenticated using (es_admin());

create policy servicios_alta_admin on servicios
  for insert to authenticated
  with check (es_admin() and actualizado_por = auth.uid());

create policy servicios_edicion_admin on servicios
  for update to authenticated
  using (es_admin())
  with check (actualizado_por = auth.uid());

grant select, insert, update on servicios to authenticated;
grant select, insert, update on servicios to service_role;

revoke delete on servicios from authenticated, anon, service_role;
revoke all on servicios from anon;

create trigger auditar_servicios after insert or update on servicios
  for each row execute function public.auditar();

-- ---------------------------------------------------------------------------
-- El entierro de las dos columnas que nunca pudieron decir la verdad
-- ---------------------------------------------------------------------------

-- Están en null en las 503 filas de la temporada: ningún script las escribió
-- nunca y ninguna pantalla las mostró. Dejarlas «por las dudas» crearía la
-- única pregunta que un modelo no debe permitir — ¿la verdad está en la columna
-- o en la tabla?
--
-- El drop es seguro para los clientes con el bundle viejo: ningún flujo de la
-- app escribe esas columnas. El alta manual de R9 inserta una lista explícita
-- que no las incluye, y las ediciones suben UPDATEs de los campos tocados.
alter table ovejas
  drop column fecha_inseminacion,
  drop column padre;
