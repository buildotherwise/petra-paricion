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
    // La inseminación y el padre NO viven acá: son hasta cuatro hechos por
    // oveja, con padres distintos, y viven en `servicios` — que no se replica
    // (ver migración 0010). El teléfono no muestra el padre en ningún flujo.
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
    // El collar es del parto: lo llevan todos los hermanos y también la madre.
    // Cada cordero se distingue por su collar_marca.
    collar_numero: column.text,
    // 0 = alguien confirmó que el collar ya no está en los animales. El número
    // queda reservado igual: R3 mira collar_numero, que no se borra nunca.
    collar_puesto: column.integer,
    observaciones: column.text,
    creado_en: column.text,
    creado_por: column.text,
    actualizado_en: column.text,
    actualizado_por: column.text,
    dispositivo: column.text,
  },
  {
    // por_oveja evita duplicar un parto; por_collar sostiene la validación R3.
    indexes: { por_oveja: ['oveja_id'], por_fecha: ['fecha'], por_collar: ['collar_numero'] },
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

    // Baja lógica: un cordero cargado por error no se borra —el delete está
    // revocado en todas las tablas— y deja de contar para el tipo de nacimiento.
    anulado_en: column.text,
    anulado_por: column.text,
    anulado_motivo: column.text,

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
      por_collar: ['temporada', 'collar_marca'],
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
 * Así que se descarta Y se deja constancia acá. Y esta constancia es la ÚLTIMA
 * COPIA que queda del registro: el servidor no lo aceptó, y la réplica local se
 * sincroniza con el servidor, así que cuando el aparato vuelva a bajar datos la
 * fila original también desaparece del teléfono.
 */
const subidas_rechazadas = new Table(
  {
    /**
     * Agrupa las filas de una misma carga. Un parto de mellizos son tres
     * operaciones de algo que la persona hizo una vez, y mostrarlas por
     * separado repetiría el error que ya se corrigió en el contador de
     * pendientes.
     */
    carga_id: column.text,
    tabla: column.text,
    registro_id: column.text,
    operacion: column.text,
    /** SQLSTATE, para poder traducir el motivo sin adivinar (ver rechazos.ts). */
    codigo: column.text,
    motivo: column.text,
    /** La caravana, resuelta al momento del rechazo: después puede no existir. */
    caravana: column.text,
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
