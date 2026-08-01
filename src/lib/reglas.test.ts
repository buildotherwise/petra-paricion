import { describe, expect, test } from 'vitest';
import {
  collarDisponible,
  corderosQueRequierenCollar,
  tipoNacimiento,
  validarFechaNacimiento,
  validarPeso,
  type CorderoDelParto,
} from './reglas';

/** Constructor breve de corderos para los tests. Por defecto: vivo, sin collar. */
function cordero(sobre: Partial<CorderoDelParto> = {}): CorderoDelParto {
  return {
    id: crypto.randomUUID(),
    condicion: 'vivo',
    collar_numero: null,
    collar_marca: null,
    ...sobre,
  };
}

// ---------------------------------------------------------------------------
// R1 — Tipo de nacimiento derivado
// ---------------------------------------------------------------------------

describe('R1 — el tipo de nacimiento se deriva, nunca se tipea', () => {
  test('un cordero es parto único', () => {
    expect(tipoNacimiento([cordero()])).toBe(1);
  });

  test('dos corderos son mellizos', () => {
    expect(tipoNacimiento([cordero(), cordero()])).toBe(2);
  });

  test('tres corderos son trillizos', () => {
    expect(tipoNacimiento([cordero(), cordero(), cordero()])).toBe(3);
  });

  test('los corderos muertos al nacer cuentan para el tipo de nacimiento', () => {
    // R8: el parto conserva el conteo de nacidos aunque el cordero muera.
    const corderos = [cordero(), cordero({ condicion: 'muerto' })];
    expect(tipoNacimiento(corderos)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// R2 — Collar solo en partos múltiples
// ---------------------------------------------------------------------------

describe('R2 — el collar se exige solo en partos múltiples', () => {
  test('un parto único no exige collar', () => {
    expect(corderosQueRequierenCollar([cordero()])).toEqual([]);
  });

  test('en mellizos, ambos corderos vivos sin collar quedan pendientes', () => {
    const a = cordero();
    const b = cordero();
    expect(corderosQueRequierenCollar([a, b]).map((c) => c.id)).toEqual([a.id, b.id]);
  });

  test('un cordero con número y marca ya no queda pendiente', () => {
    const conCollar = cordero({ collar_numero: '12', collar_marca: 'punto_arriba' });
    const sinCollar = cordero();
    expect(corderosQueRequierenCollar([conCollar, sinCollar]).map((c) => c.id)).toEqual([
      sinCollar.id,
    ]);
  });

  test('el número sin marca no alcanza: el collar queda incompleto', () => {
    const a = cordero({ collar_numero: '12', collar_marca: null });
    const b = cordero({ collar_numero: '13', collar_marca: 'punto_abajo' });
    expect(corderosQueRequierenCollar([a, b]).map((c) => c.id)).toEqual([a.id]);
  });

  test('los corderos muertos al nacer nunca requieren collar', () => {
    // R5: no pasan por señalada, así que no hay nada que identificar.
    const vivo = cordero({ collar_numero: '12', collar_marca: 'punto_arriba' });
    const muerto = cordero({ condicion: 'muerto' });
    expect(corderosQueRequierenCollar([vivo, muerto])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// R3 — Collar activo único
// ---------------------------------------------------------------------------

describe('R3 — un collar activo no puede estar en dos corderos a la vez', () => {
  test('un collar sin uso está disponible', () => {
    expect(collarDisponible('12', 'punto_arriba', [])).toBe(true);
  });

  test('un collar en uso por otro cordero nacido no está disponible', () => {
    const enUso = [{ collar_numero: '12', collar_marca: 'punto_arriba' as const }];
    expect(collarDisponible('12', 'punto_arriba', enUso)).toBe(false);
  });

  test('el mismo número con otra marca es un collar distinto', () => {
    const enUso = [{ collar_numero: '12', collar_marca: 'punto_arriba' as const }];
    expect(collarDisponible('12', 'punto_abajo', enUso)).toBe(true);
  });

  test('distinto número con la misma marca es un collar distinto', () => {
    const enUso = [{ collar_numero: '12', collar_marca: 'punto_arriba' as const }];
    expect(collarDisponible('13', 'punto_arriba', enUso)).toBe(true);
  });

  test('los ceros a la izquierda no crean un collar distinto', () => {
    // "012" y "12" son el mismo collar físico; tratarlos como distintos
    // permitiría asignar el mismo collar dos veces.
    const enUso = [{ collar_numero: '012', collar_marca: 'punto_arriba' as const }];
    expect(collarDisponible('12', 'punto_arriba', enUso)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R7 — Rangos de peso
// ---------------------------------------------------------------------------

describe('R7 — el peso avisa fuera de 2–8 kg y bloquea fuera de 0,5–15 kg', () => {
  test('un peso típico pasa sin observaciones', () => {
    expect(validarPeso(4.11).estado).toBe('ok');
  });

  test('los límites del rango normal no avisan', () => {
    expect(validarPeso(2).estado).toBe('ok');
    expect(validarPeso(8).estado).toBe('ok');
  });

  test('por debajo de 2 kg avisa pero deja guardar', () => {
    expect(validarPeso(1.9).estado).toBe('aviso');
  });

  test('por encima de 8 kg avisa pero deja guardar', () => {
    expect(validarPeso(8.1).estado).toBe('aviso');
  });

  test('los límites del rango de bloqueo todavía dejan guardar', () => {
    expect(validarPeso(0.5).estado).toBe('aviso');
    expect(validarPeso(15).estado).toBe('aviso');
  });

  test('por debajo de 0,5 kg bloquea', () => {
    expect(validarPeso(0.49).estado).toBe('bloqueo');
  });

  test('por encima de 15 kg bloquea', () => {
    expect(validarPeso(15.01).estado).toBe('bloqueo');
  });

  test('cero bloquea: el peso desconocido va como nulo, no como cero', () => {
    // Los históricos de Zoho cargaban 0 en los muertos. Eso destruye
    // cualquier promedio; acá 0 no es un peso válido.
    expect(validarPeso(0).estado).toBe('bloqueo');
  });

  test('el peso ausente es válido: en muertos al nacer es opcional', () => {
    expect(validarPeso(null).estado).toBe('ok');
  });

  test('un valor no numérico bloquea', () => {
    expect(validarPeso(Number.NaN).estado).toBe('bloqueo');
  });
});

// ---------------------------------------------------------------------------
// R12 — Fechas
// ---------------------------------------------------------------------------

describe('R12 — la fecha de nacimiento admite hasta 7 días atrás y nunca el futuro', () => {
  const hoy = '2026-08-10';

  test('hoy es válida', () => {
    expect(validarFechaNacimiento('2026-08-10', hoy).valida).toBe(true);
  });

  test('ayer es válida', () => {
    expect(validarFechaNacimiento('2026-08-09', hoy).valida).toBe(true);
  });

  test('siete días atrás es válida', () => {
    expect(validarFechaNacimiento('2026-08-03', hoy).valida).toBe(true);
  });

  test('ocho días atrás no es válida', () => {
    expect(validarFechaNacimiento('2026-08-02', hoy).valida).toBe(false);
  });

  test('mañana no es válida', () => {
    expect(validarFechaNacimiento('2026-08-11', hoy).valida).toBe(false);
  });

  test('cruza el fin de mes sin equivocarse', () => {
    // 3 de agosto menos 7 días es 27 de julio, no 27 de agosto.
    expect(validarFechaNacimiento('2026-07-27', '2026-08-03').valida).toBe(true);
    expect(validarFechaNacimiento('2026-07-26', '2026-08-03').valida).toBe(false);
  });

  test('una fecha con formato inválido no es válida', () => {
    expect(validarFechaNacimiento('10/08/2026', hoy).valida).toBe(false);
  });

  test('el rango no se corre por zona horaria', () => {
    // Uruguay es UTC-3. Con objetos Date, "2026-08-10" se interpreta como
    // medianoche UTC y al mostrarlo localmente retrocede al día 9. Todo el
    // cálculo trabaja sobre strings ISO justamente para evitar eso.
    expect(validarFechaNacimiento('2026-01-01', '2026-01-01').valida).toBe(true);
    expect(validarFechaNacimiento('2026-01-02', '2026-01-01').valida).toBe(false);
  });
});
