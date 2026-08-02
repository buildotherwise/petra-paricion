/**
 * Reglas de negocio de la parición (CLAUDE.md §5).
 *
 * Todo acá es función pura: sin acceso a la base, sin fechas del sistema, sin
 * estado. Es lo único difícil de verificar a mano en el campo, así que es lo
 * que más tests tiene.
 */

export type Condicion = 'vivo' | 'muerto';
export type MarcaCollar = 'punto_arriba' | 'cruz_al_medio' | 'punto_abajo';

export interface CorderoDelParto {
  id: string;
  condicion: Condicion;
  /** La marca distingue a este cordero de sus hermanos. El NÚMERO es del parto. */
  collar_marca: MarcaCollar | null;
}

/** Las siete causas de muerte de los formularios Zoho, para poder comparar temporadas. */
export const CAUSAS_MUERTE = [
  { valor: 'distocia', etiqueta: 'Distocia' },
  { valor: 'hambre_exposicion', etiqueta: 'Hambre, exposición' },
  { valor: 'depredacion_primaria', etiqueta: 'Depredación primaria' },
  { valor: 'prematuro_intrauterina', etiqueta: 'Prematuro o muerte intrauterina' },
  { valor: 'infeccion', etiqueta: 'Infección' },
  { valor: 'accidente', etiqueta: 'Accidente' },
  { valor: 'sin_diagnostico', etiqueta: 'Sin diagnóstico' },
] as const;

export type CausaMuerte = (typeof CAUSAS_MUERTE)[number]['valor'];

export type ValidacionPeso =
  | { estado: 'ok' }
  | { estado: 'aviso'; mensaje: string }
  | { estado: 'bloqueo'; mensaje: string };

export type ValidacionFecha = { valida: true } | { valida: false; motivo: string };

/**
 * Umbrales de R7, en kg, calibrados contra los 468 corderos vivos de 2025:
 * mediana 4,14 · máximo 6,90.
 *
 * El aviso sobre 6 kg salta en 1 de cada 33 partos — raro pero no invisible.
 * A 5 kg saltaría en 1 de cada 6 y el equipo aprendería a descartarlo, que es
 * la forma de que un aviso deje de servir.
 */
export const PESO_AVISO_MIN = 2.5;
export const PESO_AVISO_MAX = 6;
export const PESO_BLOQUEO_MIN = 0.5;
export const PESO_BLOQUEO_MAX = 8;
/** La balanza da dos decimales; un tercero solo puede ser un dedo de más. */
export const PESO_DECIMALES = 2;

/**
 * R12: la ventana de parición de una temporada.
 *
 * Del 1 de agosto al 30 de noviembre del año de la temporada. Es el rango real
 * de la cabaña, no un margen arbitrario: un parto puede encontrarse bastante
 * después de ocurrido, pero nunca fuera de estos cuatro meses.
 */
export const TEMPORADA_MES_INICIO = 8;
export const TEMPORADA_MES_FIN = 11;

// ---------------------------------------------------------------------------
// R1 — Tipo de nacimiento derivado
// ---------------------------------------------------------------------------

/**
 * Cantidad de corderos del parto (1 único, 2 mellizos, 3 trillizos).
 *
 * Nunca se ingresa a mano: en los datos 2025 el operador tipeaba este número y
 * podía contradecir la cantidad de corderos cargados. Acá es imposible.
 */
export function tipoNacimiento(corderos: readonly CorderoDelParto[]): number {
  return corderos.length;
}

// ---------------------------------------------------------------------------
// R2 — Collar solo en partos múltiples
// ---------------------------------------------------------------------------

/**
 * Corderos del parto a los que todavía les falta la marca del collar.
 *
 * Solo aplica a partos múltiples: en un parto único no hay nada que distinguir
 * y los campos de collar ni se muestran. Los muertos van incluidos — el collar
 * se pone igual, esté vivo o muerto.
 */
export function corderosQueRequierenMarca(
  corderos: readonly CorderoDelParto[],
): CorderoDelParto[] {
  if (corderos.length < 2) return [];
  return corderos.filter((c) => c.collar_marca === null);
}

/** ¿Este parto necesita número de collar? Solo si es múltiple. */
export function partoRequiereCollar(corderos: readonly CorderoDelParto[]): boolean {
  return corderos.length >= 2;
}

/**
 * Devuelve el collar que corresponde después de agregar o quitar un cordero.
 *
 * El caso que resuelve: se carga un cordero, se agrega un segundo por error con
 * su collar, y se lo quita. Si el número quedara pegado al parto único, ese
 * collar quedaría tomado para el resto de la temporada sin que nadie lo lleve
 * puesto.
 */
export function ajustarCollarDelParto<T extends CorderoDelParto>(
  corderos: readonly T[],
  collarNumero: string | null,
): { collarNumero: string | null; corderos: T[] } {
  if (partoRequiereCollar(corderos)) {
    return { collarNumero, corderos: [...corderos] };
  }
  return {
    collarNumero: null,
    corderos: corderos.map((c) => ({ ...c, collar_marca: null })),
  };
}

/** Marcas ya tomadas por los hermanos, para no ofrecerlas dos veces. */
export function marcasOcupadas(
  corderos: readonly CorderoDelParto[],
  exceptoId?: string,
): MarcaCollar[] {
  return corderos
    .filter((c) => c.id !== exceptoId && c.collar_marca !== null)
    .map((c) => c.collar_marca as MarcaCollar);
}

// ---------------------------------------------------------------------------
// R3 — Un número de collar, un parto
// ---------------------------------------------------------------------------

/**
 * Los collares son físicos y se reutilizan, así que "12" y "012" son el mismo.
 * Compararlos como strings crudos permitiría asignar dos veces el mismo collar.
 */
function normalizarNumeroCollar(numero: string): string {
  return numero.trim().replace(/^0+(?=.)/, '');
}

/**
 * ¿Está libre este número de collar?
 *
 * El número identifica al parto entero: lo llevan todos los hermanos y también
 * la madre. Así que no puede estar en dos partos a la vez. Se compara contra
 * los partos que todavía tienen corderos sin señalar; al señalar o al morir
 * (R8) el collar se libera.
 */
export function collarDisponible(
  numero: string,
  numerosEnUso: readonly (string | null)[],
): boolean {
  const buscado = normalizarNumeroCollar(numero);
  if (buscado === '') return false;
  return !numerosEnUso.some(
    (n) => n !== null && normalizarNumeroCollar(n) === buscado,
  );
}

// ---------------------------------------------------------------------------
// R7 — Rangos de peso
// ---------------------------------------------------------------------------

/**
 * Avisa fuera de 2,5–6 kg, bloquea fuera de 0,5–8 kg y con más de dos decimales.
 *
 * `null` es válido: en los muertos al nacer el peso es opcional (R5). Lo que no
 * se admite es 0 — los históricos de Zoho cargaban 0 en los muertos y eso
 * arruina cualquier promedio de peso al nacer.
 */
export function validarPeso(pesoKg: number | null): ValidacionPeso {
  if (pesoKg === null) return { estado: 'ok' };

  if (!Number.isFinite(pesoKg)) {
    return { estado: 'bloqueo', mensaje: 'El peso no es un número válido.' };
  }

  if (Number(pesoKg.toFixed(PESO_DECIMALES)) !== pesoKg) {
    return {
      estado: 'bloqueo',
      mensaje: `El peso admite hasta ${PESO_DECIMALES} decimales.`,
    };
  }

  if (pesoKg < PESO_BLOQUEO_MIN || pesoKg > PESO_BLOQUEO_MAX) {
    return {
      estado: 'bloqueo',
      mensaje: `El peso debe estar entre ${PESO_BLOQUEO_MIN} y ${PESO_BLOQUEO_MAX} kg. Si no lo pesaste, dejalo vacío.`,
    };
  }

  if (pesoKg < PESO_AVISO_MIN || pesoKg > PESO_AVISO_MAX) {
    return {
      estado: 'aviso',
      mensaje: `${pesoKg} kg está fuera de lo habitual (${PESO_AVISO_MIN}–${PESO_AVISO_MAX} kg). Revisá antes de guardar.`,
    };
  }

  return { estado: 'ok' };
}

// ---------------------------------------------------------------------------
// R12 — Fechas
// ---------------------------------------------------------------------------

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte 'YYYY-MM-DD' a días desde la época, o null si no es una fecha real.
 *
 * Trabaja sobre el string y usa Date.UTC a propósito. `new Date('2026-08-10')`
 * se interpreta como medianoche UTC, que en Uruguay (UTC-3) es el 9 a las 21 h:
 * cualquier cálculo local se correría un día.
 */
function aDiasEpoca(fecha: string): number | null {
  const partes = FORMATO_ISO.exec(fecha);
  if (partes === null) return null;

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);

  const ms = Date.UTC(anio, mes - 1, dia);
  const reconstruida = new Date(ms);

  // Descarta fechas imposibles como 2026-02-30, que Date.UTC desborda al mes
  // siguiente en vez de rechazar.
  if (
    reconstruida.getUTCFullYear() !== anio ||
    reconstruida.getUTCMonth() !== mes - 1 ||
    reconstruida.getUTCDate() !== dia
  ) {
    return null;
  }

  return ms / 86_400_000;
}

/** Primer y último día de parición de una temporada, en formato ISO. */
export function rangoTemporada(temporada: number): { desde: string; hasta: string } {
  const mes = (n: number) => String(n).padStart(2, '0');
  const ultimoDia = new Date(Date.UTC(temporada, TEMPORADA_MES_FIN, 0)).getUTCDate();
  return {
    desde: `${temporada}-${mes(TEMPORADA_MES_INICIO)}-01`,
    hasta: `${temporada}-${mes(TEMPORADA_MES_FIN)}-${mes(ultimoDia)}`,
  };
}

/**
 * La fecha más adelantada que se puede elegir: hoy, o el cierre de la
 * temporada si ya pasó. Alimenta el atributo `max` del campo, para que el
 * selector del teléfono no llegue siquiera a ofrecer una fecha inválida.
 */
export function maximoElegible(hoy: string, temporada: number): string {
  const { hasta } = rangoTemporada(temporada);
  return hoy < hasta ? hoy : hasta;
}

/**
 * La fecha del parto tiene que caer dentro de la temporada y nunca en el
 * futuro.
 *
 * No hay límite de días hacia atrás: un parto puede encontrarse bastante
 * después de ocurrido, y mientras caiga dentro de los cuatro meses de parición
 * es un dato legítimo. Lo que no puede es quedar fuera de la temporada — eso
 * sería un error de tipeo o una fecha de otro año.
 *
 * `hoy` se recibe como parámetro en vez de leerlo del sistema: hace la función
 * testeable y deja explícito de quién es el reloj.
 */
export function validarFechaNacimiento(
  fecha: string,
  hoy: string,
  temporada: number,
): ValidacionFecha {
  const diaFecha = aDiasEpoca(fecha);
  if (diaFecha === null) {
    return { valida: false, motivo: 'La fecha no tiene un formato válido.' };
  }

  const diaHoy = aDiasEpoca(hoy);
  if (diaHoy === null) {
    return { valida: false, motivo: 'La fecha de referencia no es válida.' };
  }

  if (diaFecha > diaHoy) {
    return { valida: false, motivo: 'No se puede registrar un parto con fecha futura.' };
  }

  const { desde, hasta } = rangoTemporada(temporada);
  if (fecha < desde || fecha > hasta) {
    return {
      valida: false,
      motivo: `La parición de ${temporada} va del ${formatearDia(desde)} al ${formatearDia(hasta)}.`,
    };
  }

  return { valida: true };
}

/** 'YYYY-MM-DD' → '1 de agosto', para los mensajes de error. */
function formatearDia(iso: string): string {
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'setiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  const [, mes, dia] = iso.split('-');
  const nombre = meses[Number(mes) - 1] ?? mes;
  return `${Number(dia)} de ${nombre}`;
}

/** Fecha de hoy como 'YYYY-MM-DD' en la zona horaria del dispositivo. */
export function hoyISO(ahora: Date = new Date()): string {
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// ---------------------------------------------------------------------------
// Fecha de muerte
// ---------------------------------------------------------------------------

/**
 * La muerte no puede ser anterior al nacimiento ni posterior a hoy.
 *
 * Es obligatoria en todo cordero muerto: sin ella no se puede medir mortalidad
 * entre el nacimiento y la señalada, que es una de las métricas de la temporada.
 */
export function validarFechaMuerte(
  fechaMuerte: string | null,
  fechaNacimiento: string,
  hoy: string,
): ValidacionFecha {
  if (fechaMuerte === null || fechaMuerte === '') {
    return { valida: false, motivo: 'Falta la fecha de muerte.' };
  }

  const dia = aDiasEpoca(fechaMuerte);
  if (dia === null) return { valida: false, motivo: 'La fecha no tiene un formato válido.' };

  const nacio = aDiasEpoca(fechaNacimiento);
  const ahora = aDiasEpoca(hoy);
  if (nacio === null || ahora === null) {
    return { valida: false, motivo: 'Las fechas de referencia no son válidas.' };
  }

  if (dia < nacio) {
    return { valida: false, motivo: 'La muerte no puede ser anterior al nacimiento.' };
  }
  if (dia > ahora) {
    return { valida: false, motivo: 'La muerte no puede ser posterior a hoy.' };
  }

  return { valida: true };
}
