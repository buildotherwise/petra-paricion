-- La paternidad deja de preguntar «¿quién entra en la ventana?» y pasa a
-- preguntar «¿cuál explica mejor esta fecha?».
--
-- EL PROBLEMA. La versión anterior derivaba el padre solo si el parto caía en
-- la ventana [servicio + 145, servicio + 155] de exactamente un servicio. Con
-- los primeros partos cargados se vio la consecuencia: tres de seis quedaron
-- sin padre, y ninguno por falta de datos — sus madres tenían la inseminación
-- cargada. Las gestaciones implicadas eran de 142, 143 y 144 días, y la ventana
-- empieza en 145. Quedaron afuera por uno, dos y tres días.
--
-- Un cordero nacido a los 143 días es un cordero normal. Y una ventana tiene
-- dos maneras de callarse —el parto se cae por un día, o entran dos servicios
-- y hay empate— así que ensancharla no alcanzaba: cambiaba un motivo de
-- silencio por el otro.
--
-- LA REGLA NUEVA. Se ordenan los servicios de la madre por qué tan lejos de
-- 150 días queda la gestación que implican, y gana el primero. Así SIEMPRE hay
-- un candidato, y el silencio queda reservado para lo único que lo merece: que
-- ni el mejor entre en lo biológicamente posible.
--
-- Los 140–160 no son un número nuevo: son exactamente los que `v_avance_paricion`
-- usa para la curva esperada desde la 0015 (normal 140–160, pico en 150). Que
-- haya UNA definición de «gestación posible» en el proyecto vale más que
-- afinar dos por separado.
--
-- QUÉ SE AFIRMA Y QUÉ NO. `padre` ahora viene acompañado de `confianza`:
--   cierto   — gestación en [145, 155]: lo que la versión anterior afirmaba
--   probable — gestación en [140, 160]: lo que antes se callaba
-- y `alternativas` cuenta los OTROS servicios biológicamente posibles con un
-- padre distinto, que es la ambigüedad de verdad. Dos servicios del mismo
-- carnero no son ambiguos, y contarlos como tales mandaba a revisar a mano un
-- caso que no tiene nada que decidir.
--
-- Quien analice el plantel y quiera la exigencia vieja tiene cómo: filtrar por
-- `confianza = 'cierto'` devuelve exactamente lo que devolvía esta vista antes.
--
-- OJO con la 0016: su comentario «acá la gestación va de 140 a 160 y en
-- v_paternidad sigue yendo de 145 a 155» queda desactualizado por esta
-- migración. No se corrige allá —una migración aplicada es un hecho histórico,
-- no un documento vivo— y por eso se deja dicho acá: desde la 0018 las dos
-- vistas usan el mismo 140–160, y lo que las sigue distinguiendo es qué hacen
-- con él.

-- Se recrea en vez de reemplazarse: `create or replace view` exige que las
-- columnas viejas sigan en el mismo orden, y acá entran dos nuevas
-- (`alternativas` y `confianza`) donde se leen mejor. Ninguna otra vista
-- depende de esta —se verificó— así que el drop no arrastra nada.
drop view if exists v_paternidad;

create view v_paternidad as
with candidatos as (
  select
    p.id    as parto_id,
    s.id    as servicio_id,
    s.padre,
    s.cabana,
    s.tipo,
    s.fecha_inicio,
    s.fecha_fin,
    -- La gestación de un servicio con rango es un rango: si concibió el último
    -- día es la más corta, si concibió el primero es la más larga. En una
    -- inseminación los dos extremos coinciden, que es lo que la vuelve exacta.
    (p.fecha - s.fecha_fin)    as gest_min,
    (p.fecha - s.fecha_inicio) as gest_max,
    -- Distancia de 150 al intervalo [gest_min, gest_max]: cero si 150 cae
    -- adentro. El `greatest(..., 0)` es lo que hace que una encarnerada larga
    -- que contiene a 150 sea tan buena candidata como una IA exacta.
    greatest(
      (p.fecha - s.fecha_fin) - 150,
      150 - (p.fecha - s.fecha_inicio),
      0
    ) as distancia
  from partos p
  join servicios s on s.oveja_id = p.oveja_id
),
elegido as (
  -- Ante empate gana el servicio MÁS NUEVO, por el mismo argumento que la
  -- curva esperada usa en la 0016: que la oveja haya vuelto a servirse prueba
  -- que volvió al celo, y por lo tanto que el anterior falló.
  select distinct on (parto_id) *
    from candidatos
   order by parto_id, distancia, fecha_inicio desc
),
posibles as (
  select parto_id,
         count(*)                  as dentro_de_lo_posible,
         count(distinct padre)     as padres_distintos
    from candidatos
   where distancia <= 10
   group by parto_id
)
select
  p.id       as parto_id,
  o.id       as oveja_id,
  o.temporada,
  o.caravana,
  p.fecha    as fecha_parto,

  -- Cuántos servicios de la madre son biológicamente compatibles con esta
  -- fecha. Antes contaba los de la ventana angosta; el nombre se conserva
  -- porque la pregunta es la misma, con el rango de la 0015.
  coalesce(v.dentro_de_lo_posible, 0) as candidatos,

  -- La ambigüedad que importa: otro servicio posible, de OTRO padre.
  greatest(coalesce(v.padres_distintos, 0) - 1, 0) as alternativas,

  case when e.distancia <= 10 then e.padre        end as padre,
  case when e.distancia <= 10 then e.cabana       end as cabana,
  case when e.distancia <= 10 then e.tipo         end as servicio_tipo,
  case when e.distancia <= 10 then e.fecha_inicio end as servicio_inicio,
  case when e.distancia <= 10 then e.fecha_fin    end as servicio_fin,

  -- Acotada a lo posible, por lo mismo que la acotaba la 0012: el rango crudo
  -- de una encarnerada larga informa gestaciones que la propia regla descarta.
  case when e.distancia <= 10 then greatest(e.gest_min, 140) end as gestacion_min,
  case when e.distancia <= 10 then least(e.gest_max, 160)    end as gestacion_max,

  case
    when e.distancia is null   then null
    when e.distancia <= 5      then 'cierto'
    when e.distancia <= 10     then 'probable'
  end as confianza

from partos p
join ovejas o on o.id = p.oveja_id
left join elegido  e on e.parto_id = p.id
left join posibles v on v.parto_id = p.id;

-- Las dos líneas de siempre: sin ellas PostgREST devuelve 42501 y la vista
-- saltea el RLS de quien consulta. Lo verifica supabase/tests/vistas.test.sql,
-- que recorre todas las vistas de public y no perdona ninguna.
alter view v_paternidad set (security_invoker = true);
grant select on v_paternidad to authenticated;
grant select on v_paternidad to service_role;

comment on view v_paternidad is
  'El padre de cada parto: gana el servicio cuya gestación implicada queda más cerca de 150 días. Sin padre solo si ni el mejor entra en 140-160. `confianza` = cierto (145-155) | probable (140-160); `alternativas` cuenta otros servicios posibles de padres distintos.';

-- ---------------------------------------------------------------------------
-- servicios viaja a los aparatos
-- ---------------------------------------------------------------------------
--
-- Para que el padre probable se pueda decir EN EL CORRAL, que es donde sirve:
-- es el único control disponible contra la caravana equivocada, y la caravana
-- se elige sin señal. Un dato que solo aparece con conexión no aparece.
--
-- Son 1.359 filas. Lo que cambia no es el peso sino el alcance: los hechos
-- reproductivos pasan a ser legibles desde los cinco aparatos del campo,
-- cuando la 0010 los había dejado solo para admin. Es una decisión tomada, no
-- un descuido: las políticas RLS de `servicios` NO se tocan —siguen siendo
-- es_admin() para cualquier lectura por PostgREST— y lo que se abre es el
-- canal de replicación, que baja solo las columnas de la sync rule.
alter publication powersync add table public.servicios;
