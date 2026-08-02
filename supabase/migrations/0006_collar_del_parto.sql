-- El collar pasa a ser del parto, y la muerte se documenta.
--
-- Motivo del primer cambio: todos los hermanos de un parto llevan el MISMO
-- número de collar, y la madre también. Guardarlo repetido en cada cordero
-- permitía que quedaran distintos entre sí por un error de tipeo, y obligaba a
-- pedir el número una vez por cordero. Como atributo del parto eso es
-- imposible por construcción. Lo que distingue a cada hermano es la MARCA.

-- ---------------------------------------------------------------------------
-- El número de collar se muda a partos
-- ---------------------------------------------------------------------------

alter table partos add column collar_numero text;

comment on column partos.collar_numero is
  'Solo en partos múltiples. Lo llevan todos los corderos del parto y también la madre, sin marca. Cada cordero se distingue por corderos.collar_marca.';

drop index corderos_collar_activo_idx;
alter table corderos drop constraint collar_completo;
alter table corderos drop column collar_numero;

-- Sostiene R3: qué números están tomados por un parto con corderos sin señalar.
create index partos_collar_idx on partos (collar_numero) where collar_numero is not null;

-- ---------------------------------------------------------------------------
-- La causa de muerte pasa a lista cerrada
-- ---------------------------------------------------------------------------

-- Los siete motivos de los formularios Zoho, para que las temporadas sigan
-- siendo comparables. Como texto libre cada operador escribía distinto y no se
-- podía agrupar nada.
create type causa_muerte_t as enum (
  'distocia',
  'hambre_exposicion',
  'depredacion_primaria',
  'prematuro_intrauterina',
  'infeccion',
  'accidente',
  'sin_diagnostico'
);

alter table corderos drop column causa_muerte;
alter table corderos add column causa_muerte causa_muerte_t;

-- Todo cordero muerto —al nacer o después (R8)— tiene que decir de qué y
-- cuándo. Sin la fecha no se puede medir la mortalidad entre el nacimiento y la
-- señalada, que es una de las métricas de la temporada.
alter table corderos add constraint muerte_documentada check (
  (condicion = 'vivo' and estado <> 'muerto')
  or (causa_muerte is not null and fecha_muerte is not null)
);

-- La muerte nunca antes del parto. Va como trigger y no como CHECK porque
-- Postgres no admite subconsultas en una restricción, y la fecha del parto está
-- en otra tabla.
--
-- El otro extremo —no posterior a hoy— lo valida la app: acá `now()` es la hora
-- de sincronización, no la del registro, y un dispositivo que estuvo tres días
-- sin señal daría un falso positivo.
create or replace function public.validar_fecha_muerte()
returns trigger
language plpgsql
as $$
declare
  fecha_del_parto date;
begin
  if new.fecha_muerte is null then
    return new;
  end if;

  select fecha into fecha_del_parto from partos where id = new.parto_id;

  if fecha_del_parto is not null and new.fecha_muerte < fecha_del_parto then
    -- errcode de violación de check: el cliente lo clasifica como error de dato
    -- y descarta la operación en vez de reintentarla para siempre.
    raise exception 'La fecha de muerte (%) es anterior a la del parto (%)',
      new.fecha_muerte, fecha_del_parto
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validar_fecha_muerte_corderos
  before insert or update of fecha_muerte, parto_id on corderos
  for each row execute function public.validar_fecha_muerte();

-- ---------------------------------------------------------------------------
-- Peso: tope de 8 kg
-- ---------------------------------------------------------------------------

-- El máximo real de 2025 fue 6,90 kg. Arriba de 8 solo puede ser un tipeo.
alter table corderos drop constraint corderos_peso_kg_check;
alter table corderos add constraint peso_en_rango check (peso_kg > 0 and peso_kg <= 8);
