-- La curva esperada, sin normalizar: no volver al celo también es un dato.
--
-- La 0014 arregló CUÁNTO pesa cada servicio y la 0015 CÓMO se reparte dentro de
-- su ventana. Faltaba lo de fondo: el modelo usaba la mitad de la evidencia y
-- después reponía por normalización toda la preñez que sus propios parámetros
-- decían que no iba a existir. Medido sobre el archivo real de 2026 (503 ovejas
-- servidas, 899 inseminaciones, 460 encarneradas):
--
--     tramo                    0015     ahora
--     1–14 ago  (1ª tanda)       78       150
--     15 ago–1 set (2ª)          64       136
--     2–12 set  (3ª tanda)       60        64
--     13 set–31 oct (repaso)    300       108
--     TOTAL                     503       460
--
-- Un error de casi el doble en las dos direcciones, que se compensaban en el
-- total y por eso no saltaban a la vista.
--
-- ── 1. El no-retorno al celo es una observación ────────────────────────────
--
-- La 0014 usa que EXISTA una IA posterior como prueba de que la anterior falló.
-- Correcto. Pero que NO exista —habiendo habido una tanda posterior en la que
-- la oveja podía haber entrado y no entró— es la observación simétrica, y
-- prueba lo contrario. En 2026 la última IA de 171 ovejas cae en la tanda 1 y
-- la de 149 en la tanda 2: 320 ovejas a las que se vio no volver al celo. La
-- 0014 les daba 0,381, el mismo peso que a las 167 de la tanda 3, donde no hubo
-- tanda posterior y por lo tanto no hay nada observado.
--
-- Era circular además: `p` se ESTIMÓ contando los retornos y después se volvía
-- a aplicar sobre ovejas cuyo retorno ya se conocía. El descuento se cobraba
-- dos veces.
--
-- ── 2. Y `p` no era lo que el comentario de la 0014 decía ──────────────────
--
-- Ese comentario declara usar «la PRIMERA vuelta porque es la única sin sesgo»
-- y después calcula 313/487 = 64,3 %, que es «volvió alguna vez» — mezcla el
-- segundo retorno, el que ese mismo párrafo declara sesgado. El primer retorno
-- son 248 de las 484 inseminadas en la tanda 1: 51,2 %. La diferencia son 65
-- ovejas cuya segunda IA cayó en la tercera tanda.
--
-- ── 3. La curva se normalizaba hasta el 100 % de preñez ────────────────────
--
-- Tres lugares reponían la masa que tenía que perderse: el `sum(...) over` de
-- la concepción, el `1.0 / greatest(n_ia + n_enc, 1)`, y el propio 0,381, que
-- es una probabilidad CONDICIONADA a parir. El resultado era `sum(esperados) =
-- servidas`, o sea que toda oveja servida iba a parir, con tres valores
-- distintos del mismo parámetro conviviendo: q = 0,90 en la 0014, q = 0,65 por
-- ciclo en la 0015 —que sobre 23 días de exposición da 77 %— y q = 1,0 de hecho
-- después de normalizar.
--
-- Ahora los pesos son probabilidades sin condicionar y la curva suma la preñez
-- esperada, no las servidas. Contesta las dos preguntas: cuándo y cuántos.
--
-- ── 4. La gestación triangular 145–155 daba ceros literales ────────────────
--
-- La tanda 1 cerraba el 14 de agosto (12 mar + 155) y la 2 abría el 16 (24 mar
-- + 145): el 15 de agosto la curva valía exactamente 0,000. En el gráfico eran
-- los tres puntos donde la línea tocaba el eje, que se leen como datos
-- faltantes. La gestación ovina tiene colas más allá de esos once días, y un
-- solo cordero nacido el 15 de agosto falsificaba el modelo.
--
-- ── El modelo, entero ──────────────────────────────────────────────────────
--
-- Un solo número medido y un solo supuesto:
--
--     R = retorno detectado tras la 1ª IA        ← se mide acá abajo (0,512)
--     s = sensibilidad de la detección de celo   ← EL supuesto
--
--     p          = 1 − R/s                       preñez por inseminación
--     w_novolvio = p / (p + (1−p)(1−s))          preñada | no volvió al celo
--
-- `p` y `w_novolvio` salen del mismo número: lo observable es R, y las dos son
-- lecturas de esa misma observación. Ahí estaba la incoherencia de la 0014, que
-- sostenía p = 0,357 y w = 0,381 a la vez — w tiene que ser MAYOR que p siempre,
-- porque haber pasado un ciclo sin volver al celo es información buena.
--
-- Con s = 0,90 ⇒ p = 0,431 y w_novolvio = 0,883. La conclusión no depende del
-- valor: en todo el rango razonable de s la primera quincena sube y el repaso
-- baja.
--
--     s        0,70   0,80   0,90   1,00
--     1–14 ago  101    128    150    167
--     repaso    193    145    108     79
--     total     427    445    460    471
--
-- s es lo único de acá que no sale de los datos, y está en UN solo lugar para
-- poder discutirlo. Si a fin de temporada las paridas no dan ~460, s es lo que
-- hay que recalibrar — y para entonces se va a poder medir de verdad.
--
-- ── Por qué esta ventana no es la de v_paternidad ──────────────────────────
--
-- Acá la gestación va de 140 a 160 y en `v_paternidad` sigue yendo de 145 a
-- 155. No es un descuido: son dos preguntas opuestas. Esta contesta «dónde
-- espero que caigan los partos» y quiere colas, porque sin ellas inventa ceros.
-- Aquella contesta «qué servicio produjo ESTE cordero» y quiere ser angosta,
-- porque ensancharla crea paternidades ambiguas y un padre equivocado en un
-- plantel de cabaña se hereda, mientras que uno sin asignar se investiga.

-- `create or replace` no sirve acá: la columna `inseminadas` pasa a llamarse
-- `servidas` y aparece `esperados_temporada`, y reemplazar una vista no puede
-- cambiarle los nombres ni el orden a las columnas que ya tiene. Se dropea, que
-- es inocuo: ninguna otra vista la referencia, solo la lee la web admin.
drop view if exists v_avance_paricion;

create view v_avance_paricion as
with ia as (
  select s.id, s.oveja_id, o.temporada, s.fecha_inicio
    from servicios s
    join ovejas o on o.id = s.oveja_id
   where s.tipo = 'inseminacion'
),
tandas as (
  -- Las tandas salen de los datos, no de fechas escritas a mano. Un hueco de
  -- más de cinco días abre tanda nueva: en 2026 las tandas duran de 4 a 9 días
  -- y los huecos entre ellas son de 12 a 16 —un ciclo estral—, así que el corte
  -- es holgado por los dos lados.
  select temporada, fecha_inicio,
         1 + sum(nueva) over (partition by temporada order by fecha_inicio) as tanda
    from (
      select distinct temporada, fecha_inicio,
             case when fecha_inicio - lag(fecha_inicio) over (
                    partition by temporada order by fecha_inicio) > 5
                  then 1 else 0 end as nueva
        from ia
    ) x
),
ia_tanda as (
  select i.oveja_id, i.temporada, i.fecha_inicio, i.id, t.tanda,
         max(t.tanda) over (partition by i.temporada) as ultima_tanda
    from ia i
    join tandas t on t.temporada = i.temporada and t.fecha_inicio = i.fecha_inicio
),
retorno as (
  -- EL número medido: de las inseminadas en la primera tanda, cuántas volvieron
  -- al celo y se reinseminaron en la segunda. Se usa la primera vuelta porque
  -- es la única sin sesgo — a las que fallaron la segunda no siempre se les dio
  -- una tercera, se las mandó al repaso, así que el retorno observado ahí
  -- subestima las fallas.
  --
  -- El mínimo de veinte ovejas es para no derivar un parámetro de un puñado de
  -- animales: con una sola oveja en la tanda 1 la tasa sale 0 o 1 y arrastra
  -- toda la curva. En 2026 la tanda 1 son 484 ovejas.
  select temporada,
         count(*) filter (where volvio)::numeric / count(*) as tasa
    from (
      select distinct i.temporada, i.oveja_id,
             exists (select 1 from ia_tanda j
                      where j.oveja_id = i.oveja_id and j.tanda = 2) as volvio
        from ia_tanda i
       where i.tanda = 1 and i.ultima_tanda >= 2
    ) x
   group by temporada
  having count(*) >= 20
),
parametros as (
  select t.temporada,
         0.90::numeric as s,        -- sensibilidad de la detección de celo
         0.65::numeric as q_ciclo,  -- preñez por ciclo estral con el carnero suelto
         -- Sin una segunda tanda no hay retorno que medir. Pasa en una temporada
         -- de sola encarnerada, o en una IA única sin repaso. Un 55 % de retorno
         -- es una inseminación ovina corriente y solo se usa a falta de medición.
         coalesce(r.tasa, 0.55) as retorno
    from (select distinct o.temporada
            from servicios s join ovejas o on o.id = s.oveja_id) t
    left join retorno r on r.temporada = t.temporada
),
derivados as (
  select temporada, s, q_ciclo,
         p,
         -- Con s = 1 la detección es perfecta y no volver al celo prueba la
         -- preñez: la fórmula da 1 sola, sin caso aparte.
         p / (p + (1 - p) * (1 - s)) as w_novolvio
    from (
      select temporada, s, q_ciclo,
             -- De R = (1−p)·s sale p = 1 − R/s. El acotado es para que un `s`
             -- mal elegido degrade en vez de dar una probabilidad negativa.
             least(greatest(1 - retorno / s, 0.05), 0.95) as p
        from parametros
    ) x
),
ultima_ia as (
  -- Exactamente una por oveja, aunque dos IA compartan fecha. `observada` dice
  -- si hubo una tanda posterior en la que la oveja podría haber entrado: si la
  -- hubo y no entró, se la vio no volver al celo.
  select distinct on (i.oveja_id)
         i.oveja_id, i.temporada, i.fecha_inicio,
         i.tanda < i.ultima_tanda as observada
    from ia_tanda i
   order by i.oveja_id, i.fecha_inicio desc, i.id
),
con_repaso as (
  select distinct oveja_id from servicios where tipo = 'encarnerada'
),
peso_ia as (
  select u.oveja_id, u.temporada, u.fecha_inicio,
         case
           -- Inseminada y fuera del lote del repaso: se le diagnosticó preñez y
           -- por eso no se la expuso al carnero. Es la única certeza del modelo.
           when e.oveja_id is null then 1.0
           when u.observada        then d.w_novolvio
           else                         d.p
         end as peso
    from ultima_ia u
    join derivados d on d.temporada = u.temporada
    left join con_repaso e on e.oveja_id = u.oveja_id
),
relevantes as (
  -- La última IA con su peso...
  select oveja_id, temporada, 'inseminacion'::servicio_t as tipo,
         fecha_inicio, fecha_inicio as fecha_fin, peso
    from peso_ia
  union all
  -- ...y el repaso, que se lleva lo que la IA no se llevó. La encarnerada
  -- cuenta SIEMPRE: el carnero anda suelto con el lote y expone a todas,
  -- preñadas o no, así que su presencia no prueba nada sobre la IA (0014).
  select s.oveja_id, o.temporada, s.tipo, s.fecha_inicio, s.fecha_fin,
         (1 - coalesce(u.peso, 0)) / count(*) over (partition by s.oveja_id)
    from servicios s
    join ovejas o on o.id = s.oveja_id
    left join peso_ia u on u.oveja_id = s.oveja_id
   where s.tipo = 'encarnerada'
),
concepcion as (
  -- Un día por día de exposición. Para el repaso el peso diario es el RIESGO de
  -- concebir ese día: la oveja llega sin preñar (la exponencial) y prende (el
  -- factor constante). Sin normalizar, la suma sobre D días da exactamente
  -- 1 − (1−q)^(D/17), que es la preñez real de una exposición de ese largo —
  -- 77 % sobre los 23 días de 2026. El q que gobierna la FORMA y el que gobierna
  -- el TOTAL pasan a ser el mismo número, que era el desacople de la 0015.
  --
  -- En una IA `fecha_inicio = fecha_fin` y el riesgo diario no corresponde: la
  -- fecha es exacta y el peso entero va a ese día.
  select r.oveja_id, r.temporada, r.peso, c::date as dia,
         case when r.tipo = 'encarnerada'
              then power(1 - d.q_ciclo, (c::date - r.fecha_inicio) / 17.0)
                   * (1 - power(1 - d.q_ciclo, 1 / 17.0))
              else 1.0
         end as peso_dia
    from relevantes r
    join derivados d on d.temporada = r.temporada
    cross join lateral generate_series(
      r.fecha_inicio, r.fecha_fin, interval '1 day') c
),
gestacion as (
  -- Normal discreta, media 150 y σ 3, entre 140 y 160. Acá SÍ se normaliza, y
  -- no es una contradicción con lo de arriba: dado que la oveja concibió, que
  -- para es seguro. Lo que no es seguro es concebir.
  select dias, w / sum(w) over () as peso
    from (
      select g as dias, exp(-power((g - 150)::numeric, 2) / 18.0) as w
        from generate_series(140, 160) g
    ) x
),
dias as (
  select cn.oveja_id, cn.temporada,
         cn.dia + g.dias as dia,
         cn.peso * cn.peso_dia * g.peso as fraccion
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
  -- SERVIDAS, no inseminadas: en 2026 hay 16 ovejas que solo fueron al repaso y
  -- nunca se inseminaron. Es el denominador del porcentaje de avance y tiene
  -- que ser «cuántas podían parir», no «cuántas pasaron por la pipeta».
  select o.temporada, count(distinct s.oveja_id) as servidas
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
  coalesce(t.servidas, 0)   as servidas,
  -- El total de la curva, repetido en cada fila: la tarjeta compara contra el
  -- NIVEL además de contra la forma, y ya no puede sacarlo de `servidas`.
  sum(coalesce(e.esperados, 0)) over (partition by cal.temporada)
                            as esperados_temporada
from calendario cal
left join esperado e on e.temporada = cal.temporada and e.dia = cal.dia
left join reales   r on r.temporada = cal.temporada and r.dia = cal.dia
left join totales  t on t.temporada = cal.temporada
window w as (partition by cal.temporada order by cal.dia);

alter view v_avance_paricion set (security_invoker = true);
grant select on v_avance_paricion to authenticated;
grant select on v_avance_paricion to service_role;

comment on view v_avance_paricion is
  'Curva diaria de partos contra la esperada. Los pesos son probabilidades sin condicionar —no volver al celo cuenta como evidencia de preñez, igual que volver cuenta como evidencia de falla— así que la curva suma la preñez esperada y no las servidas. Gestación normal 140–160 con pico en 150.';
