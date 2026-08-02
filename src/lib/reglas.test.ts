import { describe, expect, test } from 'vitest';
import {
  collarDisponible,
  corderosQueRequierenCollar,
  maximoElegible,
  rangoTemporada,
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

  test('el sobreviviente de un parto múltiple lleva collar igual', () => {
    // Confirmado con el equipo: en mellizos se asigna collar siempre, sin
    // importar que uno haya nacido muerto. El parto sigue siendo múltiple y el
    // cordero tiene que quedar identificado hasta la señalada.
    const vivo = cordero();
    const muerto = cordero({ condicion: 'muerto' });
    expect(corderosQueRequierenCollar([vivo, muerto]).map((c) => c.id)).toEqual([vivo.id]);
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

describe('R12 — la fecha cae dentro de la temporada y nunca en el futuro', () => {
  // La parición de la temporada 2026 va del 1 de agosto al 30 de noviembre.
  const TEMPORADA = 2026;
  const valida = (fecha: string, hoy: string) =>
    validarFechaNacimiento(fecha, hoy, TEMPORADA).valida;

  test('hoy es válida', () => {
    expect(valida('2026-08-10', '2026-08-10')).toBe(true);
  });

  test('un parto encontrado tarde, de hace tres semanas, es válido', () => {
    // Antes se bloqueaba más allá de 7 días. Dentro de la temporada no hay
    // motivo: un parto se puede encontrar bastante después.
    expect(valida('2026-08-10', '2026-08-31')).toBe(true);
  });

  test('el primer día de la temporada es válido', () => {
    expect(valida('2026-08-01', '2026-08-05')).toBe(true);
  });

  test('el día anterior al inicio de la temporada no es válido', () => {
    expect(valida('2026-07-31', '2026-08-05')).toBe(false);
  });

  test('el último día de la temporada es válido', () => {
    expect(valida('2026-11-30', '2026-12-15')).toBe(true);
  });

  test('el día siguiente al cierre de la temporada no es válido', () => {
    expect(valida('2026-12-01', '2026-12-15')).toBe(false);
  });

  test('mañana no es válida aunque caiga dentro de la temporada', () => {
    expect(valida('2026-08-11', '2026-08-10')).toBe(false);
  });

  test('una fecha de la temporada anterior no es válida', () => {
    expect(valida('2025-09-15', '2026-08-10')).toBe(false);
  });

  test('la ventana sigue al año de la temporada', () => {
    expect(validarFechaNacimiento('2027-08-01', '2027-08-05', 2027).valida).toBe(true);
    expect(validarFechaNacimiento('2026-08-01', '2027-08-05', 2027).valida).toBe(false);
  });

  test('una fecha con formato inválido no es válida', () => {
    expect(valida('10/08/2026', '2026-08-10')).toBe(false);
  });

  test('una fecha imposible no es válida', () => {
    expect(valida('2026-09-31', '2026-10-05')).toBe(false);
  });

  test('el rango no se corre por zona horaria', () => {
    // Uruguay es UTC-3. Con objetos Date, "2026-08-01" se interpreta como
    // medianoche UTC y al mostrarlo localmente retrocede al 31 de julio, que
    // caería fuera de la temporada. Todo el cálculo trabaja sobre strings ISO
    // justamente para evitar eso.
    expect(valida('2026-08-01', '2026-08-01')).toBe(true);
  });

  test('el motivo distingue el futuro de estar fuera de la temporada', () => {
    const futuro = validarFechaNacimiento('2026-08-11', '2026-08-10', TEMPORADA);
    const fuera = validarFechaNacimiento('2026-07-31', '2026-08-10', TEMPORADA);
    expect(futuro.valida).toBe(false);
    expect(fuera.valida).toBe(false);
    if (!futuro.valida && !fuera.valida) {
      expect(futuro.motivo).not.toBe(fuera.motivo);
    }
  });
});

describe('límites de la temporada', () => {
  test('la temporada 2026 va del 1 de agosto al 30 de noviembre', () => {
    expect(rangoTemporada(2026)).toEqual({ desde: '2026-08-01', hasta: '2026-11-30' });
  });

  test('el máximo elegible nunca pasa de hoy', () => {
    // A mitad de temporada el tope es hoy, no el cierre de noviembre.
    expect(maximoElegible('2026-08-10', 2026)).toBe('2026-08-10');
  });

  test('pasado el cierre, el máximo elegible es el fin de la temporada', () => {
    expect(maximoElegible('2026-12-20', 2026)).toBe('2026-11-30');
  });
});
