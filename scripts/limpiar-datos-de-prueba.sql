-- Deja la base como el día 1: las 503 madres y sus servicios, y nada más.
--
--   Supabase → SQL Editor → ajustar `corte` (abajo) → ejecutar.
--
-- Se corre desde el editor de Supabase y no desde la app, porque el borrado
-- físico está revocado para `authenticated` y para `service_role` a propósito
-- (0002_rls.sql y 0005_service_role.sql): las bajas son lógicas para preservar
-- la trazabilidad. El editor corre como dueño de la base y saltea ese revoke.
--
-- La Management API sirve igual y por el mismo motivo: se comprobó que corre
-- como `postgres`, con DELETE sobre las tres tablas, y que acepta `begin` /
-- `commit` explícitos y temp tables. O sea que esto también funciona:
--
--     python3 -c "import importlib.util, pathlib; \
--       s=importlib.util.spec_from_file_location('m','scripts/aplicar-migraciones.py'); \
--       m=importlib.util.module_from_spec(s); s.loader.exec_module(m); \
--       print(m.sql(pathlib.Path('scripts/limpiar-datos-de-prueba.sql').read_text()))"
--
-- Se corrió así el 5 de agosto de 2026: borró 11 partos, 19 corderos y 100
-- filas de auditoría, y dejó la base en el estado del día 1.
--
-- QUÉ BORRA: todos los partos y corderos creados hasta `corte`, sus filas de
-- auditoría, y las ovejas de alta manual (R9) que se hayan creado al probar.
-- NO toca las 503 madres precargadas ni los 1.359 servicios.
--
-- Por qué «todos» y no una lista de ids. La versión anterior enumeraba tres
-- UUID y afirmaba que debían quedar dos partos; quedaron seis —los tres del
-- dispositivo `prueba` MÁS los tres del iPhone, que también eran de prueba— así
-- que su red de seguridad se disparaba y el script ya no corría. Una lista de
-- ids envejece cada vez que alguien prueba algo; un corte temporal, no.
--
-- La seguridad la da `corte`: si apareció un parto REAL después de ese momento,
-- el script se niega a hacer nada. O sea que sirve mientras no haya llegado el
-- primer parto de verdad — que es exactamente cuando corresponde usarlo.

begin;

-- ───────────────────────────────────────────────────────────────────────
-- EL CORTE — ajustar antes de ejecutar.
--
-- Un momento posterior a la última carga de prueba y anterior a cualquier
-- carga real. El `-03` es la hora de Uruguay; la base guarda en UTC y la
-- conversión la hace Postgres.
-- ───────────────────────────────────────────────────────────────────────
create temp table corte on commit drop as
  select timestamptz '2026-08-04 23:59:00-03' as momento;

-- Red de seguridad 1: nada creado después del corte. Si esto falla es porque
-- llegó un parto real, y entonces este script no es la herramienta correcta.
do $$
declare
  n int;
  m timestamptz;
begin
  select momento into m from corte;

  select count(*) into n from partos where creado_en > m;
  if n > 0 then
    raise exception
      'Hay % parto(s) creados después del corte (%). Pueden ser reales: no se borra nada.', n, m;
  end if;

  select count(*) into n from corderos where creado_en > m;
  if n > 0 then
    raise exception
      'Hay % cordero(s) creados después del corte (%). Pueden ser reales: no se borra nada.', n, m;
  end if;
end $$;

-- Qué se va a borrar, para que quede en la consola antes de desaparecer.
select 'a borrar' as que,
       (select count(*) from partos)                           as partos,
       (select count(*) from corderos)                         as corderos,
       (select count(*) from ovejas where precargada = false)   as ovejas_alta_manual,
       (select count(*) from cambios)                          as filas_de_auditoria;

-- ───────────────────────────────────────────────────────────────────────
-- El borrado. La auditoría primero: `cambios` no tiene clave foránea, así que
-- borrarla después dejaría filas apuntando a registros que ya no existen.
-- ───────────────────────────────────────────────────────────────────────

delete from cambios
 where (tabla = 'corderos' and registro_id in (select id from corderos))
    or (tabla = 'partos'   and registro_id in (select id from partos))
    or (tabla = 'ovejas'   and registro_id in (select id from ovejas where precargada = false));

delete from corderos;
delete from partos;

-- Las ovejas de alta manual que se hayan cargado al probar. Las 503
-- precargadas no se tocan: `precargada = true` es lo que las distingue, y es
-- lo que escribe el importador.
delete from ovejas where precargada = false;

-- Red de seguridad 2: el estado final es exactamente el del día 1.
do $$
declare
  o int; s int; p int; c int;
begin
  select count(*) into o from ovejas;
  select count(*) into s from servicios;
  select count(*) into p from partos;
  select count(*) into c from corderos;

  if o <> 503 then
    raise exception 'Quedaron % ovejas y deberían quedar 503. Se revierte.', o;
  end if;
  if s <> 1359 then
    raise exception 'Quedaron % servicios y deberían quedar 1359. Se revierte.', s;
  end if;
  if p <> 0 or c <> 0 then
    raise exception 'Quedaron % partos y % corderos. Se revierte.', p, c;
  end if;
end $$;

commit;

-- Cómo queda. Los collares y los tatuajes vuelven a estar libres: el 001 lo va
-- a llevar el primer cordero señalado de verdad.
select
  (select count(*) from ovejas)                             as ovejas,
  (select count(*) from servicios)                          as servicios,
  (select count(*) from partos)                             as partos,
  (select count(*) from corderos)                           as corderos,
  (select count(*) from cambios)                            as auditoria,
  (select count(*) from corderos where tatuaje is not null) as tatuajes_usados;
