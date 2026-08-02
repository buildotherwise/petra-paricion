/**
 * Cómo se nombra un parto en pantalla.
 *
 * Vive aparte porque lo dicen cuatro pantallas —el alta, la ficha, la lista de
 * partos registrados y el inicio— y tienen que decirlo igual. Que el resumen de
 * un parto cambie de forma según por dónde se llegue es la clase de detalle que
 * hace dudar de si se está mirando el mismo registro.
 */

export const NOMBRE_TIPO: Record<number, string> = {
  0: 'Sin corderos',
  1: 'Único',
  2: 'Mellizos',
  3: 'Trillizos',
};

/** 1 → 'Único', 2 → 'Mellizos', 4 → '4 corderos'. */
export function nombreTipo(tipo: number): string {
  return NOMBRE_TIPO[tipo] ?? `${tipo} corderos`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

/** '2026-08-02' → '2 ago'. Lo justo para reconocer si es de hoy. */
export function diaCorto(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${Number(dia)} ${MESES[Number(mes) - 1] ?? ''}`;
}

/** '2026-08-02' → '2 de agosto de 2026'. */
export function fechaLarga(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-UY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
