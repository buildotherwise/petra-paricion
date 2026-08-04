/**
 * El padre probable de un parto, calculado en el aparato.
 *
 * Es la MISMA regla que `v_paternidad` (migración 0018), escrita dos veces a
 * propósito: la vista la calcula para el tablero y las exportaciones, y esto la
 * calcula en el corral, donde no hay señal para preguntarle al servidor. Las
 * dos tienen que dar lo mismo, y por eso los umbrales están acá arriba, con
 * nombre, en vez de sueltos entre las cuentas.
 *
 * La regla: gana el servicio cuya gestación implicada queda más cerca de 150
 * días. Sin padre solo si ni el mejor entra en 140–160 — el mismo rango que
 * `v_avance_paricion` usa para la curva esperada, para que el proyecto tenga
 * UNA definición de «gestación posible».
 *
 * Para qué sirve en el campo: es el único control contra la caravana
 * equivocada, que es el error más caro del sistema. Que ningún servicio de esa
 * madre explique la fecha es la señal de que quizá la madre no es esa.
 */

/** Gestación típica del Merino Australiano. El centro de todo el cálculo. */
export const GESTACION_TIPICA = 150;

/** Lo que se afirma sin reservas: la ventana de la versión anterior. */
export const GESTACION_CIERTA = 5;

/** Lo biológicamente posible. Más lejos que esto, no se afirma nada. */
export const GESTACION_POSIBLE = 10;

export type Confianza = 'cierto' | 'probable';

/** Un servicio, como llega de la réplica local. */
export interface ServicioDeLaMadre {
  tipo: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  padre: string | null;
  cabana: string | null;
}

export interface PadreProbable {
  padre: string;
  cabana: string | null;
  tipo: string | null;
  /** Días de gestación que implica el servicio elegido. */
  gestacionMin: number;
  gestacionMax: number;
  confianza: Confianza;
  fechaInicio: string;
  fechaFin: string;
  /** Otros servicios posibles de un padre distinto: la ambigüedad de verdad. */
  alternativas: number;
}

/** Por qué no hay padre. Los dos casos se explican distinto en pantalla. */
export type SinPadre =
  | { motivo: 'sin-servicios' }
  | {
      motivo: 'fuera-de-rango';
      /** El más cercano igual, para poder decir cuánto erró. */
      padre: string;
      gestacionMin: number;
      gestacionMax: number;
      fechaInicio: string;
    };

/** Días enteros entre dos fechas ISO. Las dos son fechas puras, sin hora. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Qué tan lejos de 150 queda el intervalo de gestación posible del servicio.
 *
 * Cero si 150 cae adentro: una encarnerada cuyo rango contiene al día típico
 * explica la fecha tan bien como una inseminación exacta, y no hay motivo para
 * castigarla por ser un rango.
 */
function distanciaA150(gestacionMin: number, gestacionMax: number): number {
  return Math.max(gestacionMin - GESTACION_TIPICA, GESTACION_TIPICA - gestacionMax, 0);
}

interface Evaluado {
  servicio: ServicioDeLaMadre;
  gestacionMin: number;
  gestacionMax: number;
  distancia: number;
}

function evaluar(
  servicios: readonly ServicioDeLaMadre[],
  fechaParto: string,
): Evaluado[] {
  const salida: Evaluado[] = [];
  for (const servicio of servicios) {
    const { fecha_inicio, fecha_fin, padre } = servicio;
    // Sin fecha o sin padre no hay nada que derivar. No debería pasar —las tres
    // columnas son NOT NULL en Postgres— pero la réplica local no tiene
    // constraints y un null acá saldría como «NaN días».
    if (fecha_inicio === null || fecha_fin === null || padre === null) continue;

    // Concebido el último día del servicio ⇒ la gestación más corta.
    const gestacionMin = diasEntre(fecha_fin, fechaParto);
    const gestacionMax = diasEntre(fecha_inicio, fechaParto);
    if (!Number.isFinite(gestacionMin) || !Number.isFinite(gestacionMax)) continue;

    salida.push({
      servicio,
      gestacionMin,
      gestacionMax,
      distancia: distanciaA150(gestacionMin, gestacionMax),
    });
  }
  return salida;
}

/**
 * El padre probable, o el motivo por el que no hay.
 *
 * Ante empate gana el servicio más nuevo, por el mismo argumento que usa la
 * curva esperada (migración 0016): que la oveja se haya vuelto a servir prueba
 * que volvió al celo, y por lo tanto que el anterior falló.
 */
export function padreProbable(
  servicios: readonly ServicioDeLaMadre[],
  fechaParto: string,
): PadreProbable | SinPadre {
  const evaluados = evaluar(servicios, fechaParto);
  if (evaluados.length === 0) return { motivo: 'sin-servicios' };

  const ordenados = [...evaluados].sort(
    (a, b) =>
      a.distancia - b.distancia ||
      (b.servicio.fecha_inicio ?? '').localeCompare(a.servicio.fecha_inicio ?? ''),
  );
  const mejor = ordenados[0];
  if (mejor === undefined) return { motivo: 'sin-servicios' };

  if (mejor.distancia > GESTACION_POSIBLE) {
    return {
      motivo: 'fuera-de-rango',
      padre: mejor.servicio.padre ?? '',
      gestacionMin: mejor.gestacionMin,
      gestacionMax: mejor.gestacionMax,
      fechaInicio: mejor.servicio.fecha_inicio ?? '',
    };
  }

  // Los otros servicios que también explican la fecha, de OTRO padre. Dos
  // servicios del mismo carnero no son una ambigüedad y contarlos como tal
  // mandaría a revisar un caso que no tiene nada que decidir.
  const posibles = evaluados.filter((e) => e.distancia <= GESTACION_POSIBLE);
  const padres = new Set(posibles.map((e) => e.servicio.padre));
  const alternativas = Math.max(padres.size - 1, 0);

  return {
    padre: mejor.servicio.padre ?? '',
    cabana: mejor.servicio.cabana,
    tipo: mejor.servicio.tipo,
    // Acotada a lo posible, igual que en la vista: el rango crudo de una
    // encarnerada larga informa gestaciones que la propia regla descarta.
    gestacionMin: Math.max(mejor.gestacionMin, GESTACION_TIPICA - GESTACION_POSIBLE),
    gestacionMax: Math.min(mejor.gestacionMax, GESTACION_TIPICA + GESTACION_POSIBLE),
    confianza: mejor.distancia <= GESTACION_CIERTA ? 'cierto' : 'probable',
    fechaInicio: mejor.servicio.fecha_inicio ?? '',
    fechaFin: mejor.servicio.fecha_fin ?? '',
    alternativas,
  };
}

/** ¿Salió con padre? Estrecha el tipo para las pantallas. */
export function tienePadre(
  resultado: PadreProbable | SinPadre,
): resultado is PadreProbable {
  return !('motivo' in resultado);
}

/** «146 días» · «entre 140 y 153 días» — una encarnerada es un rango. */
export function gestacionLegible(min: number, max: number): string {
  return min === max ? `${min} días` : `entre ${min} y ${max} días`;
}
