-- La curva esperada, con la forma que tiene una parición de verdad.
--
-- La 0014 arregló CUÁNTO pesa cada servicio. Faltaba CÓMO se reparte ese peso
-- dentro de su ventana, y ahí había dos supuestos planos que juntos producían
-- una meseta de tres semanas al final de la temporada — cuando en octubre es
-- justamente cuando menos corderos nacen.
--
-- ── Lo que estaba plano ────────────────────────────────────────────────────
--
-- 1. **La concepción durante la encarnerada.** Se repartía pareja entre los 23
--    días de exposición. No es así: cuando el carnero se suelta, las ovejas que
--    están por entrar en celo lo hacen en los primeros días, y solo las que no
--    quedaron preñadas repiten un ciclo después — y son menos. La concepción
--    decae, y con ella los partos.
--
-- 2. **La gestación.** Se repartía pareja entre los días 145 y 155, como si
--    parir a los 145 fuera tan probable como a los 150. Es una meseta de once
--    días por servicio; sumadas, las de las tres tandas dan escalones.
--
-- ── El modelo ──────────────────────────────────────────────────────────────
--
-- La curva es la convolución de dos distribuciones, para cada servicio:
--
--   · **Día de concepción.** Para una IA es un solo día. Para la encarnerada,
--     el peso del día t decae como (1-q)^(t/17), con q = 0,65 de preñez por
--     ciclo y 17 días de ciclo estral. A los 17 días de exposición queda el
--     35 % del peso inicial: es la fracción que no quedó preñada en el primer
--     celo y vuelve a intentar en el segundo.
--
--   · **Días de gestación.** Triangular entre 145 y 155 con pico en 150:
--     pesos 1,2,3,4,5,6,5,4,3,2,1 (suman 36). La media de la especie es 150 y
--     los extremos son raros; no hace falta una normal para decir eso.
--
-- Los dos parámetros —q = 0,65 y el pico en 150— son supuestos zootécnicos, no
-- mediciones de esta majada, y están acá para poder discutirlos en un solo
-- lugar. Lo que NO cambia es el total: los pesos de cada oveja siguen sumando
-- 1, así que la curva sigue sumando las servidas. Es una redistribución en el
-- tiempo, no un cambio de magnitud.

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
  -- De las inseminaciones solo la última: que exista una posterior prueba que
  -- la anterior falló. La encarnerada siempre, porque el carnero suelto expone
  -- a todas y su presencia no prueba nada sobre la IA (ver 0014).
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
  select p.id, p.oveja_id, p.temporada, p.fecha_inicio, p.fecha_fin,
         case
           when p.n_ia > 0 and p.n_enc > 0 then
             case when p.tipo = 'inseminacion'
                  then 0.381 / p.n_ia
                  else 0.619 / p.n_enc end
           else 1.0 / greatest(p.n_ia + p.n_enc, 1)
         end as peso
    from pesos p
),
concepcion as (
  -- Un día por día de exposición, con su peso decreciente. Para una IA la
  -- ventana es de un día y el decaimiento no hace nada, que es lo correcto:
  -- la fecha es exacta.
  --
  -- La normalización va ACÁ y no después del cruce con la gestación: sobre las
  -- filas ya multiplicadas por los once días de gestación, la partición tendría
  -- once copias de cada día y dividiría once veces de más.
  select r.id, r.oveja_id, r.temporada, r.peso,
         c::date as dia,
         power(0.35, (c::date - r.fecha_inicio) / 17.0)
           / sum(power(0.35, (c::date - r.fecha_inicio) / 17.0))
               over (partition by r.id) as peso_dia
    from repartidos r
    cross join lateral generate_series(
      r.fecha_inicio, r.fecha_fin, interval '1 day') c
),
gestacion (dias, peso) as (
  select g, (6 - abs(g - 150))::numeric from generate_series(145, 155) g
),
dias as (
  select cn.oveja_id, cn.temporada,
         cn.dia + g.dias as dia,
         cn.peso * cn.peso_dia * (g.peso / 36.0) as fraccion
    from concepcion cn
    cross join gestacion g
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
  -- algún servicio: sin esa distinción una oveja de alta manual (R9) empujaría
  -- el avance arriba del 100 %.
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
  'Curva diaria de partos contra la esperada. Convolución de la concepción (decreciente durante la encarnerada, puntual en la IA) con la gestación (triangular 145–155, pico en 150). Solo cuenta la última IA de cada oveja; cada oveja pesa 1 en total.';
