/**
 * Reglas de negocio de la parición (CLAUDE.md §5).
 *
 * Todo acá es función pura: sin acceso a la base, sin fechas del sistema, sin
 * estado. Es lo único difícil de verificar a mano en el campo, así que es lo
 * que más tests tiene.
 */

export type Sexo = 'macho' | 'hembra';
export type Condicion = 'vivo' | 'muerto';
export type MarcaCollar = 'punto_arriba' | 'cruz_al_medio' | 'punto_abajo';
export type EstadoCordero = 'nacido' | 'senalado' | 'muerto';
export type Entropion = 'ninguno' | 'ojo_derecho' | 'ojo_izquierdo' | 'ambos';

export interface CorderoDelParto {
  id: string;
  condicion: Condicion;
  /** La marca distingue a este cordero de sus hermanos. El NÚMERO es del parto. */
  collar_marca: MarcaCollar | null;
  /**
   * Baja lógica. Un anulado no existió: no cuenta para el tipo de nacimiento,
   * no exige marca y no pasa por la señalada. Distinto de un muerto, que sí
   * existió y por eso sigue contando.
   */
  anulado_en: string | null;
}

/** Lo que las reglas necesitan de un cordero ya guardado en la base. */
export interface CorderoEnFicha {
  id: string;
  estado: EstadoCordero;
  anulado_en: string | null;
}

export type Permiso = { puede: true } | { puede: false; motivo: string };

/** Los cuatro errores de carga que de verdad ocurren, más una salida. */
export const MOTIVOS_ANULACION = [
  { valor: 'duplicado', etiqueta: 'Lo cargué dos veces' },
  { valor: 'otra_oveja', etiqueta: 'Es de otra oveja' },
  { valor: 'otro_parto', etiqueta: 'Me equivoqué de parto' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const;

export type MotivoAnulacion = (typeof MOTIVOS_ANULACION)[number]['valor'];

/** Los corderos que siguen contando: todos menos los anulados. */
function activos<T extends { anulado_en: string | null }>(corderos: readonly T[]): T[] {
  return corderos.filter((c) => c.anulado_en === null);
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
 *
 * Los muertos cuentan —existieron— y los anulados no, que es toda la diferencia
 * entre las dos bajas.
 */
export function tipoNacimiento(corderos: readonly CorderoDelParto[]): number {
  return activos(corderos).length;
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
  const enPie = activos(corderos);
  if (enPie.length < 2) return [];
  return enPie.filter((c) => c.collar_marca === null);
}

/** ¿Este parto necesita número de collar? Solo si es múltiple. */
export function partoRequiereCollar(corderos: readonly CorderoDelParto[]): boolean {
  return tipoNacimiento(corderos) >= 2;
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

/**
 * Marcas ya tomadas por los hermanos, para no ofrecerlas dos veces.
 *
 * La de un anulado se libera, al revés que el número: la marca no es un objeto
 * aparte, es la que lleva ese collar. Si el cordero no existió, ningún animal la
 * lleva puesta.
 */
export function marcasOcupadas(
  corderos: readonly CorderoDelParto[],
  exceptoId?: string,
): MarcaCollar[] {
  return activos(corderos)
    .filter((c) => c.id !== exceptoId && c.collar_marca !== null)
    .map((c) => c.collar_marca as MarcaCollar);
}

// ---------------------------------------------------------------------------
// R3 — Un número de collar, una temporada
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
 * la madre. Y una vez usado en la temporada **no vuelve a circulación**: el
 * collar es un objeto que sigue puesto en la oveja hasta que alguien va y lo
 * saca, y que un cordero muera no lo saca de la oveja.
 *
 * `numeroActual` es el collar del parto que se está editando. Sin él, abrir un
 * parto con collar 12 y guardarlo sin tocar nada avisaría que el 12 está
 * ocupado — por él mismo.
 */
export function collarDisponible(
  numero: string,
  numerosUsados: readonly (string | null)[],
  numeroActual?: string | null,
): boolean {
  const buscado = normalizarNumeroCollar(numero);
  if (buscado === '') return false;
  if (numeroActual != null && normalizarNumeroCollar(numeroActual) === buscado) return true;
  return !numerosUsados.some((n) => n !== null && normalizarNumeroCollar(n) === buscado);
}

// ---------------------------------------------------------------------------
// Anular un cordero ya guardado
// ---------------------------------------------------------------------------

/**
 * ¿Se puede anular este cordero?
 *
 * La anulación es para el error de carga —se cargó de más, o dos veces—, no
 * para lo que le pasó al animal. Por eso deja afuera al señalado, que tiene el
 * tatuaje puesto, y al último que queda: un parto sin corderos no puede existir,
 * porque alguien vio parir a la oveja.
 */
export function puedeAnular(
  corderos: readonly CorderoEnFicha[],
  id: string,
): Permiso {
  const cordero = corderos.find((c) => c.id === id);
  if (cordero === undefined) {
    return { puede: false, motivo: 'Ese cordero no es de este parto.' };
  }
  if (cordero.anulado_en !== null) {
    return { puede: false, motivo: 'Este cordero ya está anulado.' };
  }
  if (cordero.estado === 'senalado') {
    return {
      puede: false,
      motivo: 'Este cordero ya está señalado: tiene el tatuaje puesto y no se puede anular.',
    };
  }
  if (activos(corderos).length <= 1) {
    return {
      puede: false,
      motivo: 'Un parto no puede quedar sin corderos. Si el parto entero está mal, cambiá la madre.',
    };
  }
  return { puede: true };
}

/**
 * ¿El parto queda en único si se anula este cordero?
 *
 * Es lo que decide si hay que preguntar por el collar: al quedar un solo
 * cordero el collar deja de hacer falta para distinguirlos, pero puede seguir
 * puesto en la oveja. Solo lo sabe quien la está mirando.
 */
export function partoQuedaUnico(corderos: readonly CorderoEnFicha[], id: string): boolean {
  return activos(corderos).filter((c) => c.id !== id).length === 1;
}

// ---------------------------------------------------------------------------
// R8 — Muerte entre el nacimiento y la señalada
// ---------------------------------------------------------------------------

/**
 * ¿Se le puede registrar la muerte a este cordero?
 *
 * Solo a los que están sin señalar. La muerte de un cordero ya señalado
 * perdería el hecho de haberlo sido —el estado es uno solo— y eso se resuelve
 * desde la web, no en el campo.
 */
export function puedeRegistrarMuerte(cordero: CorderoEnFicha): Permiso {
  if (cordero.anulado_en !== null) {
    return { puede: false, motivo: 'Este cordero está anulado.' };
  }
  if (cordero.estado === 'muerto') {
    return { puede: false, motivo: 'Este cordero ya figura como muerto.' };
  }
  if (cordero.estado === 'senalado') {
    return {
      puede: false,
      motivo: 'Este cordero ya está señalado. La muerte de un señalado se corrige desde la web.',
    };
  }
  return { puede: true };
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

// ---------------------------------------------------------------------------
// La señalada — el tatuaje
// ---------------------------------------------------------------------------

/**
 * El tatuaje va del 001 al 999, siempre con tres dígitos.
 *
 * El techo no es una restricción de la base —la columna es `text`— sino de la
 * pinza de tatuar, que lleva tres posiciones. En 2025 hubo 468 corderos vivos,
 * así que sobra margen.
 */
export const TATUAJE_DIGITOS = 3;
export const TATUAJE_MAXIMO = 999;

/** El máximo de la escala de pigmentación heredada de Zoho (0–4). */
export const PIGMENTACION_MAXIMA = 4;

export const ENTROPIONES: readonly { valor: Entropion; etiqueta: string }[] = [
  { valor: 'ninguno', etiqueta: 'Ninguno' },
  { valor: 'ojo_derecho', etiqueta: 'Ojo derecho' },
  { valor: 'ojo_izquierdo', etiqueta: 'Ojo izquierdo' },
  { valor: 'ambos', etiqueta: 'Ambos' },
];

/**
 * Lleva lo tipeado a la forma canónica de tres dígitos, o null si no es un
 * tatuaje posible.
 *
 * Existe por el índice único `corderos_tatuaje_unico`, que compara texto: sin
 * normalizar, '7' y '007' serían dos tatuajes distintos para Postgres y el
 * mismo número en la oreja de dos animales. Es el mismo problema que
 * `normalizarNumeroCollar` resuelve para los collares, con una diferencia: acá
 * los ceros se conservan, porque en la oreja van los tres dígitos.
 */
export function normalizarTatuaje(texto: string): string | null {
  const limpio = texto.trim();
  if (!/^\d+$/.test(limpio)) return null;

  const numero = Number(limpio);
  // El 000 no existe: la numeración arranca en 001.
  if (numero < 1 || numero > TATUAJE_MAXIMO) return null;

  return String(numero).padStart(TATUAJE_DIGITOS, '0');
}

/**
 * El siguiente tatuaje libre de la temporada, o null si se agotaron.
 *
 * Es el mayor usado más uno, no el primer hueco: los tatuajes salen
 * correlativos de la pinza y un hueco en el medio casi siempre es un cordero
 * que murió, no un número disponible. Rellenarlo confundiría dos animales
 * distintos en el análisis histórico.
 *
 * Se calcula sobre la réplica local, así que un aparato con días sin
 * sincronizar puede proponer uno ya usado. De ahí el aviso al entrar a la
 * señalada: es la única pantalla de la app que quiere estar al día.
 */
export function siguienteTatuaje(usados: readonly (string | null)[]): string | null {
  let mayor = 0;
  for (const usado of usados) {
    if (usado === null) continue;
    const normalizado = normalizarTatuaje(usado);
    if (normalizado === null) continue;
    mayor = Math.max(mayor, Number(normalizado));
  }

  if (mayor >= TATUAJE_MAXIMO) return null;
  return String(mayor + 1).padStart(TATUAJE_DIGITOS, '0');
}

/**
 * ¿Está libre este tatuaje en la temporada?
 *
 * `tatuajeActual` es el del cordero que se está corrigiendo. Sin él, abrir una
 * señalada con el 042 y guardarla sin tocar nada avisaría que el 042 está
 * ocupado — por él mismo.
 */
export function tatuajeDisponible(
  tatuaje: string,
  usados: readonly (string | null)[],
  tatuajeActual?: string | null,
): boolean {
  const buscado = normalizarTatuaje(tatuaje);
  if (buscado === null) return false;

  if (tatuajeActual != null && normalizarTatuaje(tatuajeActual) === buscado) return true;

  return !usados.some((u) => u !== null && normalizarTatuaje(u) === buscado);
}

// ---------------------------------------------------------------------------
// R11 — Señalada completa o nada
// ---------------------------------------------------------------------------

/**
 * Los cuatro rasgos de canela y lunar: dos rasgos por dos ubicaciones.
 *
 * Van juntos en un solo objeto porque en la pantalla son un solo control (la
 * matriz con «Ninguna de las cuatro») y un solo campo faltante. Que el objeto
 * sea null es lo que distingue «todavía no lo miré» de «no tiene ninguna» —
 * distinción que cuatro booleanos sueltos no pueden expresar, y sin la cual la
 * app estaría inventando ceros que nadie afirmó.
 */
export interface CanelaLunar {
  canela_vellon: 0 | 1;
  canela_no_vellon: 0 | 1;
  lunar_vellon: 0 | 1;
  lunar_no_vellon: 0 | 1;
}

export const SIN_CANELA_NI_LUNAR: CanelaLunar = {
  canela_vellon: 0,
  canela_no_vellon: 0,
  lunar_vellon: 0,
  lunar_no_vellon: 0,
};

/** ¿Están las cuatro en cero? Es el estado que marca «Ninguna de las cuatro». */
export function ningunaCanelaNiLunar(valor: CanelaLunar): boolean {
  return (
    valor.canela_vellon === 0 &&
    valor.canela_no_vellon === 0 &&
    valor.lunar_vellon === 0 &&
    valor.lunar_no_vellon === 0
  );
}

/** Lo que la pantalla de señalada va juntando, antes de poder guardarse. */
export interface BorradorSenalada {
  /** La confirmación de R6, no el sexo del nacimiento. */
  sexo: Sexo | null;
  tatuaje: string | null;
  entropion: Entropion | null;
  canelaLunar: CanelaLunar | null;
  halo_hair: 0 | 1 | null;
  pigmentacion: number | null;
}

export interface CampoFaltante {
  campo: keyof BorradorSenalada;
  etiqueta: string;
}

/**
 * Lo que falta para poder guardar. Vacío significa completa.
 *
 * R11 no admite señaladas a medias y la base tampoco: la restricción
 * `senalada_completa` rechaza cualquier fila en estado `senalado` a la que le
 * falte uno de los campos. Esta función existe para que la app llegue a esa
 * restricción sabiendo que va a pasar, y para poder decir qué falta en vez de
 * mostrar un botón apagado sin explicación —que es la peor pantalla posible,
 * la que se toca tres veces y termina con la app cerrada.
 *
 * El orden es el de la pantalla, para que «tocá para ir» lleve al primero de
 * arriba hacia abajo.
 */
export function camposFaltantes(borrador: BorradorSenalada): CampoFaltante[] {
  const faltan: CampoFaltante[] = [];

  if (borrador.sexo === null) faltan.push({ campo: 'sexo', etiqueta: 'confirmar qué es' });
  if (normalizarTatuaje(borrador.tatuaje ?? '') === null) {
    faltan.push({ campo: 'tatuaje', etiqueta: 'el tatuaje' });
  }
  if (borrador.entropion === null) faltan.push({ campo: 'entropion', etiqueta: 'entropión' });
  if (borrador.canelaLunar === null) {
    faltan.push({ campo: 'canelaLunar', etiqueta: 'canela y lunar' });
  }
  if (borrador.halo_hair === null) faltan.push({ campo: 'halo_hair', etiqueta: 'halo hair' });
  if (
    borrador.pigmentacion === null ||
    !Number.isInteger(borrador.pigmentacion) ||
    borrador.pigmentacion < 0 ||
    borrador.pigmentacion > PIGMENTACION_MAXIMA
  ) {
    faltan.push({ campo: 'pigmentacion', etiqueta: 'pigmentación' });
  }

  return faltan;
}

/**
 * ¿Se puede señalar este cordero?
 *
 * Solo a los que están en `nacido`. Un muerto no pasa por la señalada (R5 y
 * R8) y un señalado ya tiene el tatuaje puesto: lo que corresponde ahí es
 * corregir, no volver a señalar.
 */
export function puedeSenalar(cordero: CorderoEnFicha): Permiso {
  if (cordero.anulado_en !== null) {
    return { puede: false, motivo: 'Este cordero está anulado.' };
  }
  if (cordero.estado === 'muerto') {
    return { puede: false, motivo: 'Este cordero está muerto: no pasa por la señalada.' };
  }
  if (cordero.estado === 'senalado') {
    return { puede: false, motivo: 'Este cordero ya está señalado. Lo que se puede es corregir la señalada.' };
  }
  return { puede: true };
}

/**
 * En un parto múltiple de sexos distintos, decir que el sexo no coincide casi
 * nunca significa que se cargó mal al nacer: significa que en la mano está el
 * otro hermano. Devuelve el hermano con el que se lo puede estar confundiendo,
 * o null si no hay ninguno.
 *
 * Es lo mejor que sale de R6. Sin este aviso el error se descubre meses
 * después, cuando el pedigrí no cierra; con él se resuelve mirando el collar,
 * con el animal todavía sujeto.
 */
export function hermanoDelMismoSexo<T extends { id: string; sexo: Sexo; anulado_en: string | null }>(
  hermanos: readonly T[],
  corderoId: string,
  sexoDeclarado: Sexo,
): T | null {
  return (
    activos(hermanos).find((h) => h.id !== corderoId && h.sexo === sexoDeclarado) ?? null
  );
}

// ---------------------------------------------------------------------------
// Lo que el panel de revisión tiene que poder encontrar
// ---------------------------------------------------------------------------

/**
 * Cuántos días sin señalar hacen que un cordero merezca aparecer en el panel.
 *
 * La señalada normal cae entre los 5 y los 10 días. Quince deja margen para
 * una tanda que se corrió por lluvia sin llenar el panel de falsos atrasos.
 */
// El `: number` no es decorativo: sin él TypeScript fija el tipo en el literal
// 15 y da por muerta la rama del singular en el título del panel. Es un umbral
// que se va a mover cuando el equipo lo pida, no una constante del universo.
export const DIAS_SIN_SENALAR_PARA_REVISAR: number = 15;

/**
 * Una fecha ISO, tantos días antes.
 *
 * Al mediodía para que el cambio de horario no corra un día — el mismo cuidado
 * que `diasDesde` en parto.ts, del otro lado de la resta.
 */
export function restarDias(fecha: string, dias: number): string {
  const base = new Date(`${fecha.slice(0, 10)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
}

/** Un parto, para buscarle el collar repetido. */
export interface PartoConCollar {
  id: string;
  collar_numero: string | null;
}

/**
 * Los grupos de partos que comparten número de collar (R3).
 *
 * El agrupado normaliza, y esa es toda la gracia: «12» y «012» son el mismo
 * objeto físico, así que agrupar por el texto crudo dejaría pasar justo el caso
 * que importa. Es la misma normalización que usa `collarDisponible`, que es lo
 * que impide que la app y el panel discrepen sobre qué es un duplicado.
 *
 * No puede hacerse en SQL porque SQLite no tiene esa función: el panel lo
 * resuelve en memoria sobre las filas que ya bajó.
 */
export function collaresDuplicados<T extends PartoConCollar>(
  partos: readonly T[],
): { numero: string; partos: T[] }[] {
  const porNumero = new Map<string, T[]>();

  for (const parto of partos) {
    if (parto.collar_numero === null) continue;
    const clave = normalizarNumeroCollar(parto.collar_numero);
    if (clave === '') continue;
    const grupo = porNumero.get(clave);
    if (grupo === undefined) porNumero.set(clave, [parto]);
    else grupo.push(parto);
  }

  const duplicados: { numero: string; partos: T[] }[] = [];
  for (const [numero, grupo] of porNumero) {
    if (grupo.length > 1) duplicados.push({ numero, partos: grupo });
  }
  return duplicados;
}

/** Un cordero, para buscarle la marca repetida dentro de su parto. */
export interface CorderoConMarca {
  id: string;
  parto_id: string;
  collar_marca: MarcaCollar | null;
  anulado_en: string | null;
}

/**
 * Las marcas que se repiten dentro de un mismo parto.
 *
 * La app ya lo valida al cargar, así que esto no debería pasar nunca — pero dos
 * aparatos offline pueden agregarle un cordero al mismo parto y elegir los dos
 * la misma marca, y ahí no hay nada que los frene hasta que se juntan.
 *
 * Los anulados no cuentan: su marca vuelve a estar libre, porque no es un
 * objeto aparte sino la que lleva ese collar (R3).
 */
export function marcasDuplicadasEnParto<T extends CorderoConMarca>(
  corderos: readonly T[],
): { partoId: string; marca: MarcaCollar; corderos: T[] }[] {
  const porClave = new Map<string, T[]>();

  for (const cordero of activos(corderos)) {
    if (cordero.collar_marca === null) continue;
    const clave = `${cordero.parto_id}:${cordero.collar_marca}`;
    const grupo = porClave.get(clave);
    if (grupo === undefined) porClave.set(clave, [cordero]);
    else grupo.push(cordero);
  }

  const duplicadas: { partoId: string; marca: MarcaCollar; corderos: T[] }[] = [];
  for (const [clave, grupo] of porClave) {
    if (grupo.length <= 1) continue;
    const corte = clave.lastIndexOf(':');
    duplicadas.push({
      partoId: clave.slice(0, corte),
      marca: clave.slice(corte + 1) as MarcaCollar,
      corderos: grupo,
    });
  }
  return duplicadas;
}

// ---------------------------------------------------------------------------
// Fecha de señalada — la corrección que solo existe en la web
// ---------------------------------------------------------------------------

/**
 * A partir de cuántos días desde el parto conviene mirar una fecha de señalada.
 *
 * Lo habitual son 5 a 10 días. Treinta deja pasar sin ruido el cordero que se
 * encontró tarde o la tanda que se corrió por lluvia, y avisa cuando el número
 * empieza a parecer un error de tipeo.
 */
export const DIAS_SENALADA_PARA_AVISAR = 30;

/**
 * La fecha de señalada, corregida desde la web.
 *
 * **No usa `rangoTemporada`, y esa es la razón de que exista.** La maqueta de la
 * Fase 3 lo dejó anotado antes de que el problema existiera: un cordero nacido
 * el 28 de noviembre se señala en diciembre, fuera de la ventana de parición,
 * así que `validarFechaNacimiento` la rechazaría siendo correcta.
 *
 * Sus reglas son otras tres: no anterior al parto, no futura, y **aviso —no
 * bloqueo—** si pasaron más de treinta días. Devuelve los tres estados de
 * `validarPeso` por lo mismo: hay fechas raras que son ciertas.
 */
export function validarFechaSenalada(
  fecha: string | null,
  fechaParto: string,
  hoy: string,
): ValidacionPeso {
  if (fecha === null || fecha === '') {
    return { estado: 'bloqueo', mensaje: 'Falta la fecha de la señalada.' };
  }

  const dia = aDiasEpoca(fecha);
  if (dia === null) return { estado: 'bloqueo', mensaje: 'La fecha no tiene un formato válido.' };

  const parto = aDiasEpoca(fechaParto);
  const ahora = aDiasEpoca(hoy);
  if (parto === null || ahora === null) {
    return { estado: 'bloqueo', mensaje: 'Las fechas de referencia no son válidas.' };
  }

  if (dia < parto) {
    return {
      estado: 'bloqueo',
      mensaje: `No puede ser anterior al parto, que fue el ${formatearDia(fechaParto)}.`,
    };
  }
  if (dia > ahora) {
    return { estado: 'bloqueo', mensaje: 'No puede ser posterior a hoy.' };
  }

  const dias = dia - parto;
  if (dias > DIAS_SENALADA_PARA_AVISAR) {
    return {
      estado: 'aviso',
      mensaje: `Pasaron ${dias} días desde el parto. Es posible —un cordero puede señalarse tarde— pero conviene mirarlo: lo habitual son 5 a 10 días.`,
    };
  }

  return { estado: 'ok' };
}
