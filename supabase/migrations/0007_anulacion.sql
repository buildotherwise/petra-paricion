-- Anulación de corderos, y el collar que no vuelve a circulación.
--
-- El caso real: se cargó un cordero de más, o se cargó dos veces. Hasta ahora no
-- había remedio en el campo — el borrado está revocado en todas las tablas
-- (0002_rls.sql) para preservar la trazabilidad, así que quitar un cordero solo
-- puede ser una baja lógica.
--
-- La alternativa que había era registrarle una muerte falsa, que ensucia la
-- mortalidad de la temporada: el número que más se mira al cerrar.

-- ---------------------------------------------------------------------------
-- El motivo, de lista cerrada
-- ---------------------------------------------------------------------------

-- Como la causa de muerte: texto libre en el campo, con guantes y al sol,
-- termina vacío o con una letra. Los cuatro motivos salen de los errores que de
-- verdad ocurren al cargar, y ser lista cerrada permite ver al cerrar la
-- temporada si las anulaciones fueron un problema de método o descuidos sueltos.
create type motivo_anulacion_t as enum (
  'duplicado',    -- lo cargué dos veces
  'otra_oveja',   -- es de otra oveja
  'otro_parto',   -- me equivoqué de parto
  'otro'
);

-- ---------------------------------------------------------------------------
-- Las columnas
-- ---------------------------------------------------------------------------

alter table corderos
  add column anulado_en     timestamptz,
  add column anulado_por    uuid references auth.users(id),
  add column anulado_motivo motivo_anulacion_t;

comment on column corderos.anulado_en is
  'Baja lógica. El cordero sigue existiendo y se muestra tachado: no cuenta para el tipo de nacimiento (R1) ni para la señalada.';

-- Los tres van juntos o ninguno. Una anulación sin autor no se puede auditar, y
-- una sin fecha no se puede ordenar contra el resto de la historia del registro.
alter table corderos add constraint anulacion_completa check (
  (anulado_en is null and anulado_por is null and anulado_motivo is null) or
  (anulado_en is not null and anulado_por is not null and anulado_motivo is not null)
);

-- Un cordero señalado es un animal con tatuaje puesto: existe, se lo vio y se lo
-- midió. Anularlo sería negar un hecho, no corregir un error de carga.
alter table corderos add constraint senalado_no_se_anula check (
  anulado_en is null or estado <> 'senalado'
);

-- ---------------------------------------------------------------------------
-- Los conteos dejan de ver a los anulados
-- ---------------------------------------------------------------------------

-- R1 otra vez: el tipo de nacimiento se cuenta, nunca se tipea. Si un cordero
-- anulado siguiera contando, un parto único cargado por error como mellizos
-- seguiría figurando como mellizos para siempre — y la mellicería es una de las
-- métricas de la temporada.
-- `create or replace` no admite agregar una columna en el medio: hay que
-- recrear. La vista no tiene dependientes todavía.
drop view partos_resumen;

create view partos_resumen as
select
  p.id,
  p.oveja_id,
  o.caravana,
  o.temporada,
  p.fecha,
  p.condicion_corporal,
  p.collar_numero,
  count(c.id) filter (where c.anulado_en is null)                            as tipo_nacimiento,
  count(c.id) filter (where c.anulado_en is null and c.condicion = 'vivo')   as nacidos_vivos,
  count(c.id) filter (where c.anulado_en is null and c.estado = 'senalado')  as senalados,
  count(c.id) filter (where c.anulado_en is null and c.estado = 'nacido')    as pendientes_senalada,
  count(c.id) filter (where c.anulado_en is not null)                        as anulados
from partos p
join ovejas o on o.id = p.oveja_id
left join corderos c on c.parto_id = p.id
group by p.id, o.caravana, o.temporada;

comment on view partos_resumen is
  'R1: el tipo de nacimiento nunca se tipea, se cuenta. Los anulados no cuentan; se exponen aparte para que la web pueda revisarlos.';

-- ---------------------------------------------------------------------------
-- El collar queda tomado toda la temporada
-- ---------------------------------------------------------------------------

-- Cambio de regla respecto de R3 tal como estaba escrita. El collar es un objeto
-- físico que sigue puesto en la madre y en los hermanos hasta que alguien va y
-- lo saca; que un cordero muera no lo saca de la oveja. Así que un número usado
-- no vuelve a circulación hasta la temporada siguiente.
--
-- La validación sigue siendo del cliente, contra la réplica local, y NO se
-- agrega un unique acá a propósito: dos dispositivos offline que asignaran el
-- mismo número harían que el servidor rechace un parto real y el clasificador lo
-- descarte. La spec resuelve ese caso con el panel de duplicados de la web (§5
-- R3) — perder la validación temprana es mejor que perder un parto.
comment on column partos.collar_numero is
  'Solo en partos múltiples. Lo llevan todos los corderos del parto y también la madre, sin marca; cada cordero se distingue por corderos.collar_marca. Un número usado queda tomado toda la temporada: no lo liberan la muerte (R8) ni la señalada.';

-- Sin índices nuevos: son ~500 partos y unos pocos miles de corderos por
-- temporada, y la app consulta su réplica local, no esta base. Un índice parcial
-- para la lista de pendientes tiene sentido recién con la web de la Fase 4, y
-- ahí se sabrá qué consulta hay que sostener.
