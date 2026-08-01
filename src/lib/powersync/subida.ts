/**
 * Decisiones puras del camino de subida a Supabase.
 *
 * Están separadas del conector para poder testearlas sin base ni red: son la
 * diferencia entre una cola que se destraba sola y una que se traba para
 * siempre sin que nadie se entere.
 */

export type AccionSubida = 'reintentar' | 'descartar';

/**
 * Clases de SQLSTATE que sí valen la pena reintentar. Todo lo demás que traiga
 * código de Postgres es un problema del dato, y ningún reintento lo arregla.
 */
const CLASES_TRANSITORIAS = new Set(['08', '40', '53', '57', '58']);

function codigoDe(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === 'string' && codigo !== '' ? codigo : null;
}

export function clasificarErrorSubida(error: unknown): AccionSubida {
  const codigo = codigoDe(error);

  // Sin código no hay respuesta del servidor: es red, DNS o el aparato sin
  // señal. Ante la duda se reintenta — descartar acá perdería un parto.
  if (codigo === null) return 'reintentar';

  // PostgREST rechazó el request antes de llegar a Postgres (columna que no
  // existe, filtro mal armado). Reintentarlo da exactamente lo mismo.
  if (codigo.startsWith('PGRST')) return 'descartar';

  if (/^[0-9A-Z]{5}$/.test(codigo)) {
    return CLASES_TRANSITORIAS.has(codigo.slice(0, 2)) ? 'reintentar' : 'descartar';
  }

  return 'reintentar';
}

/**
 * Columnas boolean en Postgres. SQLite no tiene ese tipo, así que PowerSync las
 * guarda como 1/0 y PostgREST no puede meter un número JSON en una columna
 * boolean.
 *
 * Deliberadamente NO incluye halo_hair, canela_*, lunar_* ni pigmentacion:
 * también son 0/1 pero son smallint, la codificación histórica de los
 * formularios Zoho. Convertirlos rompería la comparabilidad entre temporadas.
 */
const COLUMNAS_BOOLEANAS: Record<string, readonly string[]> = {
  ovejas: ['precargada'],
  corderos: ['sexo_discrepancia'],
  perfiles: ['activo'],
};

export function normalizarParaPostgres(
  tabla: string,
  datos: Record<string, unknown>,
): Record<string, unknown> {
  const booleanas = COLUMNAS_BOOLEANAS[tabla];
  if (booleanas === undefined) return datos;

  const salida: Record<string, unknown> = { ...datos };
  for (const columna of booleanas) {
    const valor = salida[columna];
    if (typeof valor === 'number') {
      salida[columna] = valor !== 0;
    }
  }
  return salida;
}
