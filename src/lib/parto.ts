/**
 * Cómo se nombra un parto en pantalla.
 *
 * Vive aparte porque lo dicen cuatro pantallas —el alta, la ficha, la lista de
 * partos registrados y el inicio— y tienen que decirlo igual. Que el resumen de
 * un parto cambie de forma según por dónde se llegue es la clase de detalle que
 * hace dudar de si se está mirando el mismo registro.
 */

import { hoyISO } from './reglas';

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

/**
 * Días cumplidos entre una fecha y hoy.
 *
 * Al mediodía UTC las dos puntas, para que el cambio de horario no corra un
 * día. Es el número que decide qué urge: un cordero sin señalar de 18 días
 * tiene el collar puesto en la madre desde hace 18 días.
 */
export function diasDesde(fecha: string, hoy: string = hoyISO()): number {
  return Math.round(
    (Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${fecha.slice(0, 10)}T12:00:00Z`)) / 86_400_000,
  );
}

/**
 * '2026-08-02' → '8 días', contra hoy.
 *
 * Vivía en `Senalada.tsx`. Se subió acá cuando la tabla de corderos necesitó el
 * mismo cálculo: la antigüedad de un cordero tiene que decir lo mismo en la
 * lista de pendientes, en la tabla y en el panel de revisión.
 */
export function antiguedad(fecha: string, hoy: string = hoyISO()): string {
  const dias = diasDesde(fecha, hoy);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return '1 día';
  return `${dias} días`;
}
