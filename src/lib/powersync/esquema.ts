import { column, Schema, Table } from '@powersync/web';

/**
 * Esquema de la réplica local (SQLite).
 *
 * Espeja las tablas de Postgres, con dos diferencias que son de diseño de
 * PowerSync y no se pueden evitar:
 *
 *  - Toda tabla tiene una PK `id` de tipo texto, implícita. No se declara.
 *  - No hay NOT NULL, defaults ni constraints. La validación vive en la app
 *    (src/lib/reglas.ts) y en Postgres; acá todo es nullable.
 *
 * Los tipos también se aplanan: SQLite solo tiene integer, real y text. Las
 * fechas viajan como texto ISO y los booleanos como 1/0 (ver subida.ts).
 */

const ovejas = new Table(
  {
    temporada: column.integer,
    caravana: column.text,
    fecha_inseminacion: column.text,
    padre: column.text,
    precargada: column.integer,
    observaciones: column.text,
    creado_en: column.text,
    actualizado_en: column.text,
    actualizado_por: column.text,
    dispositivo: column.text,
  },
  {
    // Sostiene el buscador de caravana, que es lo que más se usa en el campo.
    indexes: { por_caravana: ['temporada', 'caravana'] },
  },
);

const partos = new Table(
  {
    oveja_id: column.text,
    fecha: column.text,
    condicion_corporal: column.real,
    observaciones: column.text,
    creado_en: column.text,
    creado_por: column.text,
    actualizado_en: column.text,
    actualizado_por: column.text,
    dispositivo: column.text,
  },
  {
    // Evita duplicar un parto: al elegir la madre se consulta si ya tiene uno.
    indexes: { por_oveja: ['oveja_id'], por_fecha: ['fecha'] },
  },
);

const corderos = new Table(
  {
    parto_id: column.text,
    temporada: column.integer,
    estado: column.text,

    // Etapa 1: parición
    sexo: column.text,
    condicion: column.text,
    peso_kg: column.real,
    collar_numero: column.text,
    collar_marca: column.text,
    madre_tipo: column.text,
    madre_crianza_id: column.text,

    // Etapa 2: señalada
    tatuaje: column.text,
    fecha_senalada: column.text,
    canela_vellon: column.integer,
    canela_no_vellon: column.integer,
    lunar_vellon: column.integer,
    lunar_no_vellon: column.integer,
    entropion: column.text,
    halo_hair: column.integer,
    pigmentacion: column.integer,
    sexo_discrepancia: column.integer,

    fecha_muerte: column.text,
    causa_muerte: column.text,

    observaciones: column.text,
    creado_en: column.text,
    creado_por: column.text,
    actualizado_en: column.text,
    actualizado_por: column.text,
    dispositivo: column.text,
  },
  {
    indexes: {
      por_parto: ['parto_id'],
      // Lista de pendientes de señalada.
      por_estado: ['temporada', 'estado'],
      // Validación R3: collar activo único, consultada en cada alta múltiple.
      por_collar: ['temporada', 'collar_numero', 'collar_marca'],
    },
  },
);

const perfiles = new Table({
  nombre: column.text,
  rol: column.text,
  activo: column.integer,
});

/**
 * Tabla local, fuera del sync.
 *
 * Cuando el servidor rechaza una subida por un problema del dato (constraint,
 * RLS), reintentar no sirve: hay que descartar la operación o la cola se traba
 * para siempre. Pero descartar en silencio perdería un parto sin que nadie se
 * entere — que es el peor final posible para esta app.
 *
 * Así que se descarta Y se deja constancia acá, para que la app pueda avisar.
 */
const subidas_rechazadas = new Table(
  {
    tabla: column.text,
    registro_id: column.text,
    operacion: column.text,
    motivo: column.text,
    datos: column.text,
    ocurrido_en: column.text,
  },
  { localOnly: true },
);

export const EsquemaApp = new Schema({
  ovejas,
  partos,
  corderos,
  perfiles,
  subidas_rechazadas,
});

export type BaseDatos = (typeof EsquemaApp)['types'];
export type Oveja = BaseDatos['ovejas'];
export type Parto = BaseDatos['partos'];
export type Cordero = BaseDatos['corderos'];
export type Perfil = BaseDatos['perfiles'];
export type SubidaRechazada = BaseDatos['subidas_rechazadas'];
