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

/** El SQLSTATE del error, si el servidor llegó a contestar. */
export function codigoDe(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === 'string' && codigo !== '' ? codigo : null;
}

export function clasificarErrorSubida(error: unknown): AccionSubida {
  const codigo = codigoDe(error);

  // Sin código no hay respuesta del servidor: es red, DNS o el aparato sin
  // señal. Ante la duda se reintenta — descartar acá perdería un parto.
  if (codigo === null) return 'reintentar';

  // Códigos de PostgREST. No todos son un problema del dato:
  //  - PGRST0xx: PostgREST no llega a la base (arrancando, recargando el
  //    schema cache, timeout de conexión). Se resuelve solo — reintentar.
  //  - PGRST3xx: el JWT vencido o inválido. El token se renueva solo al
  //    reconectar; descartar acá convertiría una sesión vencida en una
  //    jornada entera de rechazos para retipear.
  //  - El resto (PGRST1xx/2xx y los centinelas PGRST-LOCAL-*): el request en
  //    sí está mal, y reintentarlo da exactamente lo mismo.
  if (codigo.startsWith('PGRST')) {
    const grupo = codigo.charAt(5);
    return grupo === '0' || grupo === '3' ? 'reintentar' : 'descartar';
  }

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
  partos: ['collar_puesto'],
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
