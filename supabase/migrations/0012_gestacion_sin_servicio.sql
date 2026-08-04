-- Sin servicio no hay gestación que informar.
--
-- `greatest` y `least` **ignoran los NULL** en Postgres, a diferencia de casi
-- todo lo demás: `greatest(null, 145)` no da null, da 145. Como el `left join`
-- de v_paternidad deja `s.fecha_fin` en null cuando no hay un único servicio
-- compatible, las dos columnas de gestación salían con los extremos de la
-- constante — [145, 155] — para todo parto sin padre derivable.
--
-- O sea: la única vista cuyo propósito es no inventar nada estaba informando
-- una gestación inventada, y con la peor cara posible, la de un dato medido.
-- Se vio recién con datos reales: de los seis partos de la temporada, tres
-- caen fuera de toda ventana (son partos de prueba sobre ovejas cuyas ventanas
-- abren unos días después) y los tres mostraban «gestación 145 a 155».
--
-- El arreglo es explicitar lo que el left join ya dice: si no hay servicio, no
-- hay nada que calcular. Lo fija supabase/tests/metricas.test.sql, que ahora
-- exige null en los tres casos sin padre: sin servicios, fuera de ventana y
-- ambiguo.

create or replace view v_paternidad as
select
  p.id    as parto_id,
  o.id    as oveja_id,
  o.temporada,
  o.caravana,
  p.fecha as fecha_parto,

  -- 0 = ningún servicio compatible; 1 = derivado; 2+ = ambiguo, no se afirma.
  cand.candidatos,

  s.padre,
  s.cabana,
  s.tipo         as servicio_tipo,
  s.fecha_inicio as servicio_inicio,
  s.fecha_fin    as servicio_fin,

  -- La gestación posible, acotada a lo biológicamente admitido. Sin el
  -- greatest/least una encarnerada larga informaría gestaciones de 139 días,
  -- que es justamente lo que la ventana descarta. En una IA los dos valores
  -- coinciden: la fecha es exacta.
  case when s.id is not null
       then greatest(p.fecha - s.fecha_fin, 145) end as gestacion_min,
  case when s.id is not null
       then least(p.fecha - s.fecha_inicio, 155) end as gestacion_max

from partos p
join ovejas o on o.id = p.oveja_id
cross join lateral (
  select count(*) as candidatos
    from servicios x
   where x.oveja_id = o.id
     and p.fecha between x.fecha_inicio + 145 and x.fecha_fin + 155
) cand
left join servicios s
  on cand.candidatos = 1
 and s.oveja_id = o.id
 and p.fecha between s.fecha_inicio + 145 and s.fecha_fin + 155;

-- `create or replace view` conserva permisos y opciones, pero repetirlas es
-- barato y las deja escritas donde alguien las va a buscar. La barrera de
-- vistas.test.sql no distingue entre una vista nueva y una reemplazada.
alter view v_paternidad set (security_invoker = true);
grant select on v_paternidad to authenticated;
grant select on v_paternidad to service_role;

comment on view v_paternidad is
  'El padre de cada parto, derivado de la fecha y de los servicios de la madre. candidatos <> 1 ⇒ padre y gestación null: nunca se adivina.';
