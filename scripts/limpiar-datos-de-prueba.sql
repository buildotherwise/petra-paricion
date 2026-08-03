-- Borra los tres partos de prueba que subí por error el 2 de agosto de 2026.
--
--   Supabase → SQL Editor → pegar y ejecutar.
--
-- Se corre desde el editor de Supabase y no desde la app ni desde un script,
-- porque el borrado físico está revocado para `authenticated` y para
-- `service_role` a propósito (0002_rls.sql y 0005_service_role.sql): las bajas
-- son lógicas para preservar la trazabilidad. El editor corre como dueño de la
-- base y saltea ese revoke — que es exactamente el único lugar donde debería
-- poder hacerse.
--
-- Qué borra, y nada más que eso: los partos de las ovejas 0001, 0013 y 0015 con
-- fecha 2026-08-01 y dispositivo 'prueba', sus 6 corderos y las filas de
-- auditoría que generaron. Los partos reales de las ovejas 2509 y 3633,
-- cargados desde el iPhone el 2 de agosto, NO se tocan.
--
-- Los ids van escritos y no derivados de una condición: una condición mal
-- escrita en producción borra de más, y una lista de ids no puede.

begin;

create temp table a_borrar (parto_id uuid primary key) on commit drop;

insert into a_borrar (parto_id) values
  ('29d9fb00-eb26-4e37-ae8c-bf654e8b37d5'),  -- oveja 0001 · collar 7  · 3 corderos
  ('93c3252f-0e1d-4ec4-906b-84cd7efeda57'),  -- oveja 0013 · sin collar · 1 cordero
  ('15bfa024-414e-4450-961e-120544b46cc8');  -- oveja 0015 · collar 12 · 2 corderos

-- Red de seguridad: si alguno de esos ids no es lo que se cree que es, no se
-- borra nada. Los tres tienen que ser del 1 de agosto y del dispositivo
-- 'prueba'; los reales son del 2 y del iPhone.
do $$
declare
  n int;
begin
  select count(*) into n
    from partos p join a_borrar b on b.parto_id = p.id
   where p.fecha = date '2026-08-01' and p.dispositivo = 'prueba';

  if n <> 3 then
    raise exception 'Se esperaban 3 partos de prueba y coinciden %. No se borra nada.', n;
  end if;
end $$;

-- La auditoría primero: no tiene clave foránea, así que si se borrara después
-- quedarían filas apuntando a registros que ya no existen.
delete from cambios
 where tabla = 'corderos'
   and registro_id in (select id from corderos where parto_id in (select parto_id from a_borrar));

delete from cambios
 where tabla = 'partos' and registro_id in (select parto_id from a_borrar);

delete from corderos where parto_id in (select parto_id from a_borrar);
delete from partos   where id       in (select parto_id from a_borrar);

-- Verificación antes de confirmar. Tiene que quedar 2: las ovejas 2509 y 3633.
do $$
declare
  n int;
begin
  select count(*) into n from partos;
  if n <> 2 then
    raise exception 'Quedaron % partos y deberían quedar 2. Se revierte.', n;
  end if;
end $$;

commit;

select o.caravana, p.fecha, p.collar_numero, p.dispositivo,
       (select count(*) from corderos c where c.parto_id = p.id) as corderos
  from partos p join ovejas o on o.id = p.oveja_id
 order by o.caravana;
