-- La curva esperada, corregida: una IA repetida prueba que la anterior falló.
--
-- El modelo anterior repartía el peso de cada oveja uniformemente entre TODAS
-- las ventanas de todos sus servicios. Con datos reales se vio el problema: 313
-- de las 487 ovejas inseminadas tienen más de una IA, y **una oveja se
-- reinsemina porque volvió al celo** — o sea, porque la anterior no prendió. El
-- modelo estaba poniendo probabilidad de parto en marzo justo donde hay
-- evidencia observada de que la oveja NO quedó preñada.
--
-- Cuánto pesaba el error, medido sobre la temporada 2026:
--
--     tramo                    antes    ahora
--     1–14 ago  (1ª tanda)      127       59
--     15 ago–1 set (2ª)          53       46
--     2–12 set  (3ª tanda)       29       45
--     13 set–15 oct (repaso)    294      353
--
-- La primera quincena de agosto —la que se está mirando ahora— predecía más del
-- doble de partos de los que corresponde.
--
-- ── El modelo ──────────────────────────────────────────────────────────────
--
-- 1. De las inseminaciones de una oveja cuenta SOLO LA ÚLTIMA. Que exista una
--    posterior es evidencia observada de que la anterior falló.
--
-- 2. La encarnerada cuenta SIEMPRE, y esto es lo que la hace distinta: el
--    carnero anda suelto con el lote y expone a todas, preñadas o no. Que una
--    oveja figure en la encarnerada NO prueba que su IA falló.
--
-- 3. Entre la última IA y la encarnerada el peso se reparte según la
--    probabilidad de que la IA haya prendido:
--
--      p = preñez por inseminación   = 0,357
--      q = preñez en la encarnerada  = 0,90
--
--      peso(IA)  = p / (p + (1-p)·q) = 0,357 / 0,936 = 0,381
--      peso(enc) = 1 - 0,381                         = 0,619
--
--    **De dónde sale p:** de los retornos al celo de esta misma temporada. De
--    las 487 ovejas con al menos una IA, 313 volvieron al celo y se
--    reinseminaron: 64,3 % de fallas ⇒ 35,7 % de preñez. Se usa la PRIMERA
--    vuelta porque es la única sin sesgo — a las que fallaron la segunda no
--    siempre se les dio una tercera, se las mandó al repaso, así que el retorno
--    observado ahí subestima las fallas. Las tres tandas están separadas 15–17
--    días (9–12 mar, 24–31 mar, 8–16 abr), o sea un ciclo estral, lo que
--    confirma que los retornos se recogieron sistemáticamente.
--
--    **De dónde sale q:** no se puede estimar de estos datos —no hay retorno
--    que observar después del repaso—. La encarnerada de 2026 dura 23 días y el
--    ciclo estral son 17, así que cada oveja tiene una o dos oportunidades con
--    el carnero; 0,90 es una monta natural razonable sobre esa ventana. Es el
--    único número de todo el cálculo que es un supuesto y no una medición, y
--    afecta solo el reparto entre IA y repaso, nunca el total.
--
-- 4. Los pesos de cada oveja suman 1, así que la curva sigue sumando el total
--    de servidas. La curva contesta CUÁNDO se esperan los partos, no cuántas
--    ovejas van a parir — la preñez total no se puede saber hasta que paran.

create or replace view v_avance_paricion as
with ultima_ia as (
  -- Exactamente una por oveja, aunque dos IA compartan fecha.
  select id from (
    select s.id,
           row_number() over (partition by s.oveja_id
                              order by s.fecha_inicio desc, s.id) as n
      from servicios s
     where s.tipo = 'inseminacion'
  ) x where x.n = 1
),
relevantes as (
  select s.id, s.oveja_id, o.temporada, s.tipo, s.fecha_inicio, s.fecha_fin
    from servicios s
    join ovejas o on o.id = s.oveja_id
   where s.tipo = 'encarnerada'
      or s.id in (select id from ultima_ia)
),
pesos as (
  select r.*,
         count(*) filter (where r.tipo = 'inseminacion')
           over (partition by r.oveja_id) as n_ia,
         count(*) filter (where r.tipo = 'encarnerada')
           over (partition by r.oveja_id) as n_enc
    from relevantes r
),
repartidos as (
  select p.oveja_id, p.temporada, p.fecha_inicio, p.fecha_fin,
         case
           when p.n_ia > 0 and p.n_enc > 0 then
             case when p.tipo = 'inseminacion'
                  then 0.381 / p.n_ia
                  else 0.619 / p.n_enc end
           -- Con un solo tipo de servicio, ese se lleva todo.
           else 1.0 / greatest(p.n_ia + p.n_enc, 1)
         end as peso
    from pesos p
),
dias as (
  -- El peso de cada servicio, repartido uniformemente entre los días de SU
  -- ventana. Si la ventana de la última IA y la del repaso se solapan, el día
  -- recibe las dos porciones, que es lo correcto: ese día puede parir por
  -- cualquiera de los dos.
  select r.oveja_id, r.temporada, d::date as dia,
         r.peso / ((r.fecha_fin + 155) - (r.fecha_inicio + 145) + 1)::numeric as fraccion
    from repartidos r
    cross join lateral generate_series(
      r.fecha_inicio + 145, r.fecha_fin + 155, interval '1 day') d
),
esperado as (
  select temporada, dia,
         round(sum(fraccion), 4)  as esperados,
         count(distinct oveja_id) as en_ventana
    from dias
   group by temporada, dia
),
reales as (
  -- `partos` cuenta todos los partos del día; `paridas` solo los de ovejas con
  -- algún servicio. Son dos preguntas distintas: la barra dice cuántos partos
  -- hubo, el porcentaje dice cuántas inseminadas ya parieron — y sin esa
  -- distinción una oveja de alta manual (R9) empujaría el avance arriba del
  -- 100 %.
  select temporada, fecha as dia,
         count(*)                        as partos,
         count(*) filter (where servida) as paridas
    from (
      select o.temporada, p.fecha,
             exists (select 1 from servicios s where s.oveja_id = o.id) as servida
        from partos p
        join ovejas o on o.id = p.oveja_id
    ) x
   group by temporada, fecha
),
calendario as (
  select temporada,
         generate_series(min(dia), max(dia), interval '1 day')::date as dia
    from (select temporada, dia from esperado
          union all
          select temporada, dia from reales) u
   group by temporada
),
totales as (
  select o.temporada, count(distinct s.oveja_id) as inseminadas
    from servicios s
    join ovejas o on o.id = s.oveja_id
   group by o.temporada
)
select
  cal.temporada,
  cal.dia,
  coalesce(r.partos, 0)     as partos,
  coalesce(e.esperados, 0)  as esperados,
  coalesce(e.en_ventana, 0) as en_ventana,
  sum(coalesce(r.partos, 0))    over w as partos_acumulados,
  sum(coalesce(e.esperados, 0)) over w as esperados_acumulados,
  sum(coalesce(r.paridas, 0))   over w as paridas_acumuladas,
  coalesce(t.inseminadas, 0) as inseminadas
from calendario cal
left join esperado e on e.temporada = cal.temporada and e.dia = cal.dia
left join reales   r on r.temporada = cal.temporada and r.dia = cal.dia
left join totales  t on t.temporada = cal.temporada
window w as (partition by cal.temporada order by cal.dia);

alter view v_avance_paricion set (security_invoker = true);
grant select on v_avance_paricion to authenticated;
grant select on v_avance_paricion to service_role;

comment on view v_avance_paricion is
  'Curva diaria de partos contra la esperada. Solo cuenta la ÚLTIMA inseminación de cada oveja —la repetición prueba que la anterior falló— y reparte 38/62 entre esa IA y el repaso con carnero. Cada oveja pesa 1 en total.';
