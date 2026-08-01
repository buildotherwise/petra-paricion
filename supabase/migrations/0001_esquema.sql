-- Esquema base — parición y señalada, establecimiento Petra.
--
-- Principio central: el cordero es UNA entidad, creada en la parición y
-- completada en la señalada. No hay dos registros que vincular después.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type sexo_t           as enum ('macho', 'hembra');
create type condicion_t      as enum ('vivo', 'muerto');
create type marca_collar_t   as enum ('punto_arriba', 'cruz_al_medio', 'punto_abajo');
create type entropion_t      as enum ('ninguno', 'ojo_derecho', 'ojo_izquierdo', 'ambos');
create type estado_cordero_t as enum ('nacido', 'senalado', 'muerto');
create type madre_t          as enum ('biologica', 'nodriza');

-- ---------------------------------------------------------------------------
-- Perfiles — rol y estado de cada cuenta
-- ---------------------------------------------------------------------------

create table perfiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  nombre  text not null,
  rol     text not null check (rol in ('operador', 'admin')),
  activo  boolean not null default true
);

-- `on delete restrict` a propósito: dar de baja a alguien es desactivar la
-- cuenta, nunca borrarla, para que la auditoría histórica conserve quién
-- registró qué.
comment on table perfiles is
  'Rol y estado por cuenta. Las bajas se hacen con activo = false, nunca con delete.';

-- ---------------------------------------------------------------------------
-- Ovejas — madres, precargadas antes de la temporada
-- ---------------------------------------------------------------------------

create table ovejas (
  id                 uuid primary key default gen_random_uuid(),
  temporada          int  not null,
  caravana           text not null,
  fecha_inseminacion date,
  padre              text,
  precargada         boolean not null default true,
  observaciones      text,

  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  -- Nullable a propósito: la importación masiva corre server-side, sin usuario
  -- autenticado. Toda alta desde la app SÍ lleva autor (ver política más abajo).
  actualizado_por    uuid references auth.users(id),
  dispositivo        text,

  constraint ovejas_caravana_no_vacia check (btrim(caravana) <> ''),
  unique (temporada, caravana)
);

-- La caravana es TEXTO, no número. En los datos reales aparecen '0178', '0499'
-- y 'PI1164': convertirlas a número pierde los ceros a la izquierda y rompe la
-- búsqueda por prefijo que usa el operador en el campo.
comment on column ovejas.caravana is
  'Identificador visual. Texto siempre: hay caravanas con ceros a la izquierda y alfanuméricas.';
comment on column ovejas.precargada is
  'false = alta manual en campo (R9). Sale en el panel de revisión de la web.';

create index ovejas_temporada_caravana_idx on ovejas (temporada, caravana text_pattern_ops);
create index ovejas_revision_idx on ovejas (temporada) where not precargada;

-- ---------------------------------------------------------------------------
-- Partos — uno por oveja por temporada
-- ---------------------------------------------------------------------------

create table partos (
  id                 uuid primary key,   -- generado en el dispositivo (offline)
  oveja_id           uuid not null references ovejas(id),
  fecha              date not null,

  -- R4 + datos reales: la condición corporal se registra en CUARTOS, no en
  -- enteros. Los 495 registros de 2025 usan 1,75 · 2 · 2,25 · 2,5 · 2,75 · 3 ·
  -- 3,25 · 3,5. Un smallint rompería la comparabilidad entre temporadas.
  condicion_corporal numeric(3,2)
    check (
      condicion_corporal between 1 and 5
      and condicion_corporal * 4 = trunc(condicion_corporal * 4)
    ),

  observaciones      text,

  creado_en          timestamptz not null default now(),
  creado_por         uuid not null references auth.users(id),
  actualizado_en     timestamptz not null default now(),
  actualizado_por    uuid not null references auth.users(id),
  dispositivo        text,

  -- R12: nunca fechas futuras. El límite de 7 días hacia atrás se valida en la
  -- app, porque acá `now()` es la hora de sincronización, no la de registro.
  constraint partos_fecha_no_futura check (fecha <= (now() at time zone 'utc')::date + 1),

  unique (oveja_id)
);

comment on column partos.condicion_corporal is
  'Escala 1–5 en cuartos (1 muy flaca … 5 muy gorda). Atributo del parto, no del cordero (R4).';
comment on constraint partos_fecha_no_futura on partos is
  'Tolera +1 día: un dispositivo en UTC-3 puede sincronizar un parto de hoy que al servidor le llega como mañana.';

create index partos_fecha_idx on partos (fecha);

-- ---------------------------------------------------------------------------
-- Corderos — una entidad, dos etapas
-- ---------------------------------------------------------------------------

create table corderos (
  id                uuid primary key,   -- generado en el dispositivo (offline)
  parto_id          uuid not null references partos(id),
  temporada         int  not null,      -- denormalizado desde la oveja
  estado            estado_cordero_t not null default 'nacido',

  -- Etapa 1: parición
  sexo              sexo_t not null,
  condicion         condicion_t not null,   -- vivo/muerto AL NACER
  -- Nullable: en muertos al nacer el peso es opcional (R5). Peso desconocido va
  -- NULL, nunca 0 — los históricos de Zoho cargaban 0 y arruinaban los promedios.
  peso_kg           numeric(4,2) check (peso_kg > 0 and peso_kg < 15),
  collar_numero     text,
  collar_marca      marca_collar_t,
  madre_tipo        madre_t not null default 'biologica',
  madre_crianza_id  uuid references ovejas(id),

  -- Etapa 2: señalada
  tatuaje           text,
  fecha_senalada    date,
  canela_vellon     smallint check (canela_vellon    in (0, 1)),
  canela_no_vellon  smallint check (canela_no_vellon in (0, 1)),
  lunar_vellon      smallint check (lunar_vellon     in (0, 1)),
  lunar_no_vellon   smallint check (lunar_no_vellon  in (0, 1)),
  entropion         entropion_t,
  halo_hair         smallint check (halo_hair in (0, 1)),
  pigmentacion      smallint check (pigmentacion between 0 and 4),
  sexo_discrepancia boolean not null default false,   -- R6

  -- Muerte posterior al nacimiento (R8)
  fecha_muerte      date,
  causa_muerte      text,

  observaciones     text,

  creado_en         timestamptz not null default now(),
  creado_por        uuid not null references auth.users(id),
  actualizado_en    timestamptz not null default now(),
  actualizado_por   uuid not null references auth.users(id),
  dispositivo       text,

  -- R11: señalada completa o nada. No se admiten señaladas a medias, ni siquiera
  -- por una escritura directa a la base.
  constraint senalada_completa check (
    estado <> 'senalado' or (
      tatuaje          is not null and
      fecha_senalada   is not null and
      canela_vellon    is not null and
      canela_no_vellon is not null and
      lunar_vellon     is not null and
      lunar_no_vellon  is not null and
      entropion        is not null and
      halo_hair        is not null and
      pigmentacion     is not null
    )
  ),

  -- Un cordero muerto al nacer no puede terminar señalado (R5).
  constraint muerto_al_nacer_no_se_senala check (
    condicion <> 'muerto' or estado <> 'senalado'
  ),

  -- El collar necesita número Y marca, o ninguno de los dos.
  constraint collar_completo check (
    (collar_numero is null and collar_marca is null) or
    (collar_numero is not null and collar_marca is not null)
  ),

  -- R10: si se cría con nodriza hay que decir cuál.
  constraint nodriza_identificada check (
    madre_tipo <> 'nodriza' or madre_crianza_id is not null
  )
);

-- El tatuaje es único por temporada, pero admite null mientras el cordero no
-- esté señalado (un índice único común trataría cada null como distinto, que
-- es justo lo que queremos).
create unique index corderos_tatuaje_unico
  on corderos (temporada, tatuaje) where tatuaje is not null;

create index corderos_parto_idx  on corderos (parto_id);
-- Sostiene la lista de pendientes de señalada y la validación R3 de collares.
create index corderos_estado_idx on corderos (temporada, estado);
create index corderos_collar_activo_idx
  on corderos (temporada, collar_numero, collar_marca)
  where estado = 'nacido' and collar_numero is not null;

-- ---------------------------------------------------------------------------
-- Vista de resumen — el tipo de nacimiento SE DERIVA (R1)
-- ---------------------------------------------------------------------------

create view partos_resumen as
select
  p.id,
  p.oveja_id,
  o.caravana,
  o.temporada,
  p.fecha,
  p.condicion_corporal,
  count(c.id)                                       as tipo_nacimiento,
  count(c.id) filter (where c.condicion = 'vivo')    as nacidos_vivos,
  count(c.id) filter (where c.estado = 'senalado')   as senalados,
  count(c.id) filter (where c.estado = 'nacido')     as pendientes_senalada
from partos p
join ovejas o on o.id = p.oveja_id
left join corderos c on c.parto_id = p.id
group by p.id, o.caravana, o.temporada;

comment on view partos_resumen is
  'R1: el tipo de nacimiento nunca se tipea, se cuenta. La vista es la única fuente de ese número.';
