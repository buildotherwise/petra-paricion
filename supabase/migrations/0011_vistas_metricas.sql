-- Las métricas de la temporada, como vistas de Postgres.
--
-- CLAUDE.md §9 lo pide así desde el día uno y conviene recordar por qué: la
-- lógica de cálculo queda en UN lugar, auditable, y un BI externo futuro
-- (Metabase, Looker) lee exactamente lo mismo que el tablero, con un usuario de
-- solo lectura y sin reimplementar nada. Si esto viviera en TypeScript, el BI
-- tendría su propia copia y las dos divergirían sin que nadie se entere.
--
-- Tres reglas que gobiernan todo lo que sigue:
--
--   · TODA vista lleva sus dos líneas —`security_invoker` y el `grant`— o nace
--     muda y encima saltea el RLS. Lo verifica supabase/tests/vistas.test.sql,
--     que recorre las vistas de `public` y no perdona ninguna.
--   · Los anulados no cuentan NUNCA (R13): un muerto existió, un anulado no.
--   · La mortalidad se cuenta con `fecha_muerte is not null`, JAMÁS con
--     `estado = 'muerto'`. Un cordero que muere después de señalado conserva su
--     estado `senalado` (R8), así que contar por estado lo perdería. Está
--     fijado en supabase/tests/senalada.test.sql y en metricas.test.sql.
--
-- Todas exponen `temporada` y ninguna toma parámetros: el cliente filtra con
-- `.eq('temporada', …)` por PostgREST.

-- ---------------------------------------------------------------------------
-- v_paternidad — el padre se deriva de la fecha del parto
-- ---------------------------------------------------------------------------

-- R1 dice que el tipo de nacimiento no se tipea porque se puede contar. El
-- padre es el mismo caso con mejor disfraz: se puede CALCULAR. Un parto cae en
-- la ventana [servicio + 145, servicio + 155] de a lo sumo un servicio, y ese
-- es el padre.
--
-- Se midió contra el archivo real de 2026, sobre las 1.149 comparaciones entre
-- padres distintos: ninguna oveja tiene dos ventanas solapadas. El margen es más
-- ajustado de lo que parece —el par más cercano queda a UN día, la mediana a
-- 22—, pero un margen chico acá no produce un padre equivocado sino un parto que
-- no cae en ninguna ventana y queda sin padre, que es el modo de falla seguro.
--
-- Aun así la vista cuenta los candidatos en vez de asumir: con 0 o con 2+ el
-- padre es null y el caso se mira a mano. Un cordero con padre equivocado en un
-- plantel de cabaña es peor que uno sin padre asignado — el segundo se
-- investiga, el primero se hereda.
--
-- Los 145 y 155 viven acá y en v_avance_paricion, en ningún otro lado.
create view v_paternidad as
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
  greatest(p.fecha - s.fecha_fin,    145) as gestacion_min,
  least(   p.fecha - s.fecha_inicio, 155) as gestacion_max

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

alter view v_paternidad set (security_invoker = true);
grant select on v_paternidad to authenticated;
grant select on v_paternidad to service_role;

comment on view v_paternidad is
  'El padre de cada parto, derivado de la fecha y de los servicios de la madre. candidatos <> 1 ⇒ padre null: nunca se adivina.';

-- ---------------------------------------------------------------------------
-- v_avance_paricion — lo real contra lo esperado, día por día
-- ---------------------------------------------------------------------------

-- La trampa de esta vista es contar ovejas de más. Una oveja con tres servicios
-- va a parir UNA vez, no tres, así que cada oveja pesa exactamente 1 en toda la
-- temporada, repartido en partes iguales entre el conjunto DEDUPLICADO de sus
-- días posibles. La consecuencia es verificable y está como aserción en
-- metricas.test.sql: sum(esperados) = inseminadas, salvo milésimas del
-- redondeo por día (que es a lo que apunta la tolerancia del test).
--
-- El calendario es continuo a propósito: un día sin partos es un dato, y una
-- serie que se saltea los días vacíos dibuja una curva que comprime el tiempo —
-- las tandas de la inseminación, que son la estructura real del manejo,
-- desaparecerían.
create view v_avance_paricion as
with dias_posibles as (
  -- Una fila por (oveja, día posible). El distinct es la clave: dos servicios
  -- de la misma oveja que compartan un día lo aportan una sola vez.
  select distinct s.oveja_id, o.temporada, d::date as dia
    from servicios s
    join ovejas o on o.id = s.oveja_id
    cross join lateral generate_series(
      s.fecha_inicio + 145, s.fecha_fin + 155, interval '1 day') d
),
reparto as (
  select temporada, dia,
         1.0 / count(*) over (partition by oveja_id) as fraccion
    from dias_posibles
),
esperado as (
  select temporada, dia,
         round(sum(fraccion), 4) as esperados,
         count(*)                as en_ventana   -- cuántas ovejas podrían parir hoy
    from reparto
   group by temporada, dia
),
reales as (
  -- `partos` cuenta todos los partos del día; `paridas` solo los de ovejas con
  -- algún servicio. Son dos preguntas distintas: la barra dice cuántos partos
  -- hubo, el porcentaje dice cuántas inseminadas ya parieron — y sin esa
  -- distinción una oveja de alta manual (R9) empujaría el avance arriba del
  -- 100 %.
  select temporada, fecha as dia,
         count(*)                          as partos,
         count(*) filter (where servida)   as paridas
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
  coalesce(r.partos, 0)    as partos,
  coalesce(e.esperados, 0) as esperados,
  coalesce(e.en_ventana, 0) as en_ventana,
  sum(coalesce(r.partos, 0))    over w as partos_acumulados,
  sum(coalesce(e.esperados, 0)) over w as esperados_acumulados,
  sum(coalesce(r.paridas, 0))   over w as paridas_acumuladas,
  -- Left join y no join: antes de que se carguen los servicios, la temporada
  -- todavía tiene que poder mostrar su curva real.
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
  'Curva diaria de partos contra la esperada por gestación 145–155. Cada oveja pesa 1 repartido en sus días posibles, así que sum(esperados) = inseminadas a menos del redondeo diario.';

-- ---------------------------------------------------------------------------
-- v_tipo_nacimiento — únicos, mellizos, trillizos
-- ---------------------------------------------------------------------------

-- Sobre partos_resumen, que desde 0007 ya excluye los anulados. El filtro
-- `> 0` deja afuera los partos sin corderos: son una anomalía de carga y ya
-- tienen su pregunta en el panel de revisión, no una categoría de mellicería.
create view v_tipo_nacimiento as
select temporada,
       tipo_nacimiento,
       count(*)             as partos,
       sum(tipo_nacimiento) as corderos
  from partos_resumen
 where tipo_nacimiento > 0
 group by temporada, tipo_nacimiento;

alter view v_tipo_nacimiento set (security_invoker = true);
grant select on v_tipo_nacimiento to authenticated;
grant select on v_tipo_nacimiento to service_role;

-- ---------------------------------------------------------------------------
-- v_mortalidad — al nacer y después
-- ---------------------------------------------------------------------------

-- Las tres muertes son distintas y se cuentan aparte porque significan cosas
-- distintas: la de al nacer habla del parto, la de antes de señalar habla de la
-- crianza, y la de después habla del rodeo. `condicion` dice cómo NACIÓ y no
-- cambia nunca; `fecha_muerte` dice si murió.
create view v_mortalidad as
select temporada,
       count(*)                                   as nacidos,
       count(*) filter (where condicion = 'vivo') as nacidos_vivos,
       count(*) filter (where condicion = 'muerto') as muertos_al_nacer,
       count(*) filter (
         where condicion = 'vivo'
           and fecha_muerte is not null
           and fecha_senalada is null
       ) as muertos_antes_de_senalar,
       count(*) filter (
         where condicion = 'vivo'
           and fecha_muerte is not null
           and fecha_senalada is not null
       ) as muertos_despues_de_senalar
  from corderos
 where anulado_en is null
 group by temporada;

alter view v_mortalidad set (security_invoker = true);
grant select on v_mortalidad to authenticated;
grant select on v_mortalidad to service_role;

comment on view v_mortalidad is
  'Mortalidad por fecha_muerte, NUNCA por estado: un cordero que muere después de señalado sigue siendo senalado (R8) y contarlo por estado lo perdería.';

-- ---------------------------------------------------------------------------
-- v_peso_promedio — por sexo y tipo de nacimiento
-- ---------------------------------------------------------------------------

-- Solo vivos con peso: es la población con la que se calibraron los umbrales de
-- R7 contra los 468 corderos de 2025, y la única comparable entre temporadas.
create view v_peso_promedio as
select c.temporada,
       c.sexo,
       pr.tipo_nacimiento,
       count(*)                as con_peso,
       round(avg(c.peso_kg), 2) as promedio_kg,
       min(c.peso_kg)          as minimo_kg,
       max(c.peso_kg)          as maximo_kg
  from corderos c
  join partos_resumen pr on pr.id = c.parto_id
 where c.anulado_en is null
   and c.condicion = 'vivo'
   and c.peso_kg is not null
 group by c.temporada, c.sexo, pr.tipo_nacimiento;

alter view v_peso_promedio set (security_invoker = true);
grant select on v_peso_promedio to authenticated;
grant select on v_peso_promedio to service_role;

-- ---------------------------------------------------------------------------
-- v_senaladas_pendientes — cuántos faltan y desde cuándo
-- ---------------------------------------------------------------------------

-- Por fecha de parto, no por antigüedad: la antigüedad depende de qué día es
-- hoy, y eso lo sabe el cliente, no la vista. Una vista que calcula «días desde»
-- devuelve un número que envejece mal si alguien la cachea.
create view v_senaladas_pendientes as
select c.temporada,
       p.fecha  as fecha_parto,
       count(*) as pendientes
  from corderos c
  join partos p on p.id = c.parto_id
 where c.anulado_en is null
   and c.estado = 'nacido'
   and c.fecha_muerte is null
 group by c.temporada, p.fecha;

alter view v_senaladas_pendientes set (security_invoker = true);
grant select on v_senaladas_pendientes to authenticated;
grant select on v_senaladas_pendientes to service_role;

-- ---------------------------------------------------------------------------
-- v_prevalencias_fenotipicas — en formato largo, con los ceros puestos
-- ---------------------------------------------------------------------------

-- Formato largo (temporada, rasgo, valor) y no una columna por rasgo: así el
-- cliente arma la matriz de canela y lunar sin que la vista sepa nada de la
-- interfaz, y agregar un rasgo el año que viene no cambia la forma de la tabla.
--
-- El andamiaje de ceros es la parte que importa: la lista de casillas posibles
-- es fija y se cruza con los conteos. Sin eso, un rasgo que nadie tuvo
-- FALTARÍA, y en la pantalla un hueco no se distingue de «todavía no lo miré» —
-- exactamente la ambigüedad que la barra «ninguna de las cuatro» resuelve en el
-- campo.
create view v_prevalencias_fenotipicas as
with temporadas as (
  select distinct temporada from corderos where anulado_en is null
),
senalados as (
  select * from corderos where estado = 'senalado' and anulado_en is null
),
casillas (rasgo, valor) as (
  values
    ('entropion', 'ninguno'), ('entropion', 'ojo_derecho'),
    ('entropion', 'ojo_izquierdo'), ('entropion', 'ambos'),
    ('pigmentacion', '0'), ('pigmentacion', '1'), ('pigmentacion', '2'),
    ('pigmentacion', '3'), ('pigmentacion', '4'),
    ('halo_hair', '0'), ('halo_hair', '1'),
    ('canela_vellon', '0'), ('canela_vellon', '1'),
    ('canela_no_vellon', '0'), ('canela_no_vellon', '1'),
    ('lunar_vellon', '0'), ('lunar_vellon', '1'),
    ('lunar_no_vellon', '0'), ('lunar_no_vellon', '1')
),
observado as (
  select temporada, rasgo, valor, count(*) as corderos
    from (
      select temporada, 'entropion'        as rasgo, entropion::text        as valor from senalados
      union all select temporada, 'pigmentacion',     pigmentacion::text     from senalados
      union all select temporada, 'halo_hair',        halo_hair::text        from senalados
      union all select temporada, 'canela_vellon',    canela_vellon::text    from senalados
      union all select temporada, 'canela_no_vellon', canela_no_vellon::text from senalados
      union all select temporada, 'lunar_vellon',     lunar_vellon::text     from senalados
      union all select temporada, 'lunar_no_vellon',  lunar_no_vellon::text  from senalados
    ) x
   group by temporada, rasgo, valor
),
denominador as (
  select temporada, count(*) as senalados from senalados group by temporada
)
select t.temporada,
       k.rasgo,
       k.valor,
       coalesce(ob.corderos, 0)  as corderos,
       coalesce(d.senalados, 0)  as senalados
  from temporadas t
  cross join casillas k
  left join observado ob
    on ob.temporada = t.temporada and ob.rasgo = k.rasgo and ob.valor = k.valor
  left join denominador d on d.temporada = t.temporada;

alter view v_prevalencias_fenotipicas set (security_invoker = true);
grant select on v_prevalencias_fenotipicas to authenticated;
grant select on v_prevalencias_fenotipicas to service_role;

comment on view v_prevalencias_fenotipicas is
  'Formato largo con andamiaje de ceros: un rasgo que nadie tuvo aparece con cero, no falta. `senalados` es el denominador.';

-- ---------------------------------------------------------------------------
-- v_condicion_corporal — cómo llegaron las madres
-- ---------------------------------------------------------------------------

-- El null sale como fila propia y no se descarta: «no se midió» es información
-- sobre la carga, y esconderlo haría que el histograma sume menos partos de los
-- que hubo sin decir por qué.
create view v_condicion_corporal as
select o.temporada,
       p.condicion_corporal,
       count(*) as partos
  from partos p
  join ovejas o on o.id = p.oveja_id
 group by o.temporada, p.condicion_corporal;

alter view v_condicion_corporal set (security_invoker = true);
grant select on v_condicion_corporal to authenticated;
grant select on v_condicion_corporal to service_role;
