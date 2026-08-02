/**
 * Lo que el servidor rechazó, contado en castellano.
 *
 * Un rechazo no es «algo que quedó pendiente»: el servidor no lo aceptó y la
 * réplica local se sincroniza con el servidor, así que ese registro también va a
 * desaparecer del teléfono. Lo único que sobrevive es la copia que la app guardó
 * al descartarlo — la que estas funciones convierten en algo legible.
 *
 * Todo acá es puro: entra el error crudo de Postgres y sale una frase.
 */

import { CAUSAS_MUERTE } from './reglas';

/** Un dato de la carga, listo para mostrar. */
export interface CampoLegible {
  etiqueta: string;
  valor: string;
}

// ---------------------------------------------------------------------------
// El motivo
// ---------------------------------------------------------------------------

/**
 * Por restricción concreta. La clave se busca dentro del mensaje de Postgres,
 * que trae el nombre de la restricción violada — es lo único que distingue «esta
 * oveja ya parió» de «esta caravana ya está en la lista».
 */
const POR_RESTRICCION: readonly (readonly [string, string])[] = [
  ['partos_oveja_id_key', 'Esa oveja ya tenía un parto registrado desde otro dispositivo.'],
  ['ovejas_temporada_caravana_key', 'Esa caravana ya estaba en la lista de la temporada.'],
  ['corderos_tatuaje_unico', 'Ese tatuaje ya está usado en otro cordero de la temporada.'],
  ['peso_en_rango', 'El peso quedó fuera del rango que acepta el sistema.'],
  ['muerte_documentada', 'Un cordero muerto necesita causa y fecha de muerte.'],
  ['senalada_completa', 'La señalada quedó a medias: falta algún dato del fenotipo.'],
  ['muerto_al_nacer_no_se_senala', 'Un cordero que nació muerto no puede señalarse.'],
  ['nodriza_identificada', 'Se marcó nodriza pero no quedó registrada cuál.'],
  ['anulacion_completa', 'La anulación quedó incompleta: faltó el autor o el motivo.'],
  ['senalado_no_se_anula', 'Un cordero ya señalado no se puede anular.'],
  ['partos_fecha_no_futura', 'La fecha del parto quedó en el futuro.'],
  ['condicion_corporal', 'La condición corporal quedó fuera de la escala de 1 a 5.'],
  ['ovejas_caravana_no_vacia', 'La caravana quedó vacía.'],
  ['corderos_parto_id_fkey', 'El parto de este cordero no llegó a guardarse en el servidor.'],
  ['madre_crianza_id_fkey', 'La oveja elegida como nodriza no existe en el servidor.'],
  ['oveja_id_fkey', 'La oveja de este parto no existe en el servidor.'],
];

/**
 * Mensajes que la propia base escribe en castellano y con los datos concretos
 * adentro — el trigger de fecha de muerte de 0006, por ejemplo, dice qué dos
 * fechas chocaron. Reescribirlos perdería justamente esa información.
 */
const YA_ESTA_EN_CASTELLANO: readonly string[] = ['anterior a la del parto'];

/** Por clase de SQLSTATE, cuando no se reconoce la restricción. */
const POR_CODIGO: Readonly<Record<string, string>> = {
  '23505': 'Ese registro ya existía en el servidor.',
  '23503': 'Este registro depende de otro que no está en el servidor.',
  '23514': 'Un dato quedó fuera de lo que el sistema acepta.',
  '23502': 'Faltaba un dato obligatorio.',
  '42501': 'El servidor no aceptó el cambio: la cuenta no tiene permiso o está desactivada.',
};

/**
 * Traduce el rechazo a una frase que sirva en el campo.
 *
 * Si no se reconoce nada, devuelve el mensaje crudo: es feo, pero es infinitamente
 * mejor que «ocurrió un error» — con el texto original alguien puede averiguar
 * qué pasó, y sin él el dato se pierde sin dejar pista.
 */
export function motivoLegible(codigo: string | null, mensaje: string): string {
  const texto = mensaje ?? '';

  for (const marca of YA_ESTA_EN_CASTELLANO) {
    if (texto.includes(marca)) return texto;
  }

  for (const [clave, frase] of POR_RESTRICCION) {
    if (texto.includes(clave)) return frase;
  }

  if (codigo !== null) {
    const porCodigo = POR_CODIGO[codigo];
    if (porCodigo !== undefined) return porCodigo;
    if (codigo.startsWith('PGRST')) {
      return `El servidor no entendió lo que mandó la app. ${texto}`.trim();
    }
  }

  return texto.trim() === '' ? 'El servidor rechazó la carga sin explicar por qué.' : texto;
}

// ---------------------------------------------------------------------------
// El título
// ---------------------------------------------------------------------------

const NOMBRE_TABLA: Readonly<Record<string, { con: string; solo: string }>> = {
  partos: { con: 'Parto de', solo: 'Un parto' },
  corderos: { con: 'Cordero de', solo: 'Un cordero' },
  ovejas: { con: 'Oveja', solo: 'Un alta de oveja' },
};

/** «Parto de 1740». La caravana es lo único que identifica algo en el campo. */
export function tituloDeLaCarga(tabla: string, caravana: string | null): string {
  const nombre = NOMBRE_TABLA[tabla];
  if (nombre === undefined) return 'Una carga';
  return caravana === null || caravana.trim() === ''
    ? nombre.solo
    : `${nombre.con} ${caravana}`;
}

// ---------------------------------------------------------------------------
// Los datos
// ---------------------------------------------------------------------------

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

/** '2026-08-01' → '1 ago 2026'. */
function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${Number(dia)} ${MESES[Number(mes) - 1] ?? mes} ${anio}`;
}

function decimal(valor: number, sufijo = ''): string {
  return `${valor.toFixed(2).replace('.', ',')}${sufijo}`;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const MARCAS: Readonly<Record<string, string>> = {
  punto_arriba: 'Punto arriba',
  cruz_al_medio: 'Cruz al medio',
  punto_abajo: 'Punto abajo',
};

const ENTROPION: Readonly<Record<string, string>> = {
  ninguno: 'Ninguno',
  ojo_derecho: 'Ojo derecho',
  ojo_izquierdo: 'Ojo izquierdo',
  ambos: 'Ambos',
};

type Formateador = (valor: unknown) => string;

const texto: Formateador = (v) => String(v);
const fecha: Formateador = (v) => fechaCorta(String(v));
const kilos: Formateador = (v) => decimal(Number(v), ' kg');
const cifra: Formateador = (v) => decimal(Number(v));
const titulo: Formateador = (v) => capitalizar(String(v));
const desde =
  (mapa: Readonly<Record<string, string>>): Formateador =>
  (v) =>
    mapa[String(v)] ?? String(v);

const causa: Formateador = (v) =>
  CAUSAS_MUERTE.find((c) => c.valor === v)?.etiqueta ?? String(v);

/**
 * Qué campos se muestran de cada tabla, en qué orden y cómo.
 *
 * Lo que no está en esta lista no se muestra: identificadores, temporada y
 * metadatos de auditoría. Un uuid en pantalla no le dice nada a nadie en el
 * campo, y ocupa el lugar del dato que sí importa.
 */
const CAMPOS: Readonly<Record<string, readonly (readonly [string, string, Formateador])[]>> = {
  partos: [
    ['fecha', 'Fecha', fecha],
    ['condicion_corporal', 'Condición corporal', cifra],
    ['collar_numero', 'Collar del parto', texto],
    ['observaciones', 'Observaciones', texto],
  ],
  corderos: [
    ['sexo', 'Sexo', titulo],
    ['condicion', 'Al nacer', titulo],
    ['peso_kg', 'Peso', kilos],
    ['collar_marca', 'Marca del collar', desde(MARCAS)],
    ['estado', 'Estado', titulo],
    ['causa_muerte', 'Causa de muerte', causa],
    ['fecha_muerte', 'Fecha de muerte', fecha],
    ['tatuaje', 'Tatuaje', texto],
    ['fecha_senalada', 'Fecha de señalada', fecha],
    ['entropion', 'Entropión', desde(ENTROPION)],
    ['observaciones', 'Observaciones', texto],
  ],
  ovejas: [
    ['caravana', 'Caravana', texto],
    ['fecha_inseminacion', 'Inseminación', fecha],
    ['padre', 'Padre', texto],
    ['observaciones', 'Observaciones', texto],
  ],
};

/** Los datos de la carga rechazada, listos para poner en pantalla. */
export function camposDeLaCarga(
  tabla: string,
  datos: Record<string, unknown>,
): CampoLegible[] {
  const definicion = CAMPOS[tabla];
  if (definicion === undefined) return [];

  const campos: CampoLegible[] = [];
  for (const [clave, etiqueta, formatear] of definicion) {
    const valor = datos[clave];
    if (valor === null || valor === undefined || valor === '') continue;
    campos.push({ etiqueta, valor: formatear(valor) });
  }
  return campos;
}
