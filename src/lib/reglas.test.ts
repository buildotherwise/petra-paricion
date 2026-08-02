import { describe, expect, test } from 'vitest';
import {
  ajustarCollarDelParto,
  collarDisponible,
  corderosQueRequierenMarca,
  marcasOcupadas,
  maximoElegible,
  partoQuedaUnico,
  partoRequiereCollar,
  puedeAnular,
  puedeRegistrarMuerte,
  rangoTemporada,
  tipoNacimiento,
  validarFechaMuerte,
  validarFechaNacimiento,
  validarPeso,
  type CorderoDelParto,
  type CorderoEnFicha,
} from './reglas';

/** Constructor breve de corderos para los tests. Por defecto: vivo, sin marca. */
function cordero(sobre: Partial<CorderoDelParto> = {}): CorderoDelParto {
  return {
    id: crypto.randomUUID(),
    condicion: 'vivo',
    collar_marca: null,
    anulado_en: null,
    ...sobre,
  };
}

/** Lo que las reglas necesitan de un cordero ya guardado. */
function guardado(sobre: Partial<CorderoEnFicha> = {}): CorderoEnFicha {
  return {
    id: crypto.randomUUID(),
    estado: 'nacido',
    anulado_en: null,
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

  test('un cordero anulado NO cuenta', () => {
    // La diferencia con el muerto: el muerto existió, el anulado nunca existió.
    // Si contara, un parto único cargado por error como mellizos figuraría como
    // mellizos para siempre, y la mellicería es una métrica de la temporada.
    const corderos = [cordero(), cordero({ anulado_en: '2026-08-02T16:42:00Z' })];
    expect(tipoNacimiento(corderos)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// R2 — Collar solo en partos múltiples
// ---------------------------------------------------------------------------

describe('R2 — el collar se exige solo en partos múltiples', () => {
  test('un parto único no exige collar', () => {
    expect(corderosQueRequierenMarca([cordero()])).toEqual([]);
    expect(partoRequiereCollar([cordero()])).toBe(false);
  });

  test('en mellizos, los dos corderos sin marca quedan pendientes', () => {
    const a = cordero();
    const b = cordero();
    expect(corderosQueRequierenMarca([a, b]).map((c) => c.id)).toEqual([a.id, b.id]);
    expect(partoRequiereCollar([a, b])).toBe(true);
  });

  test('un cordero con marca ya no queda pendiente', () => {
    const conMarca = cordero({ collar_marca: 'punto_arriba' });
    const sinMarca = cordero();
    expect(corderosQueRequierenMarca([conMarca, sinMarca]).map((c) => c.id)).toEqual([sinMarca.id]);
  });

  test('los corderos muertos también llevan marca', () => {
    // Confirmado con el equipo: en un parto múltiple el collar se pone igual,
    // esté vivo o muerto.
    const vivo = cordero({ collar_marca: 'punto_arriba' });
    const muerto = cordero({ condicion: 'muerto' });
    expect(corderosQueRequierenMarca([vivo, muerto]).map((c) => c.id)).toEqual([muerto.id]);
  });

  test('un anulado no exige marca, y deja al parto en único', () => {
    const vivo = cordero();
    const anulado = cordero({ anulado_en: '2026-08-02T16:42:00Z' });
    expect(corderosQueRequierenMarca([vivo, anulado])).toEqual([]);
    expect(partoRequiereCollar([vivo, anulado])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El collar es del parto: al volver a parto único hay que soltarlo
// ---------------------------------------------------------------------------

describe('el collar se suelta cuando el parto deja de ser múltiple', () => {
  test('quitando un cordero de mellizos, el collar del parto se borra', () => {
    // Caso real: se carga un cordero, se agrega un segundo por error con su
    // collar, y se lo quita. El número no puede quedar tomado por un parto
    // único — bloquearía ese collar para el resto de la temporada.
    const unico = [cordero({ collar_marca: 'punto_arriba' })];
    const ajustado = ajustarCollarDelParto(unico, '12');
    expect(ajustado.collarNumero).toBeNull();
    expect(ajustado.corderos[0]?.collar_marca).toBeNull();
  });

  test('mientras siga siendo múltiple, el collar se mantiene', () => {
    const dos = [cordero({ collar_marca: 'punto_arriba' }), cordero({ collar_marca: 'punto_abajo' })];
    const ajustado = ajustarCollarDelParto(dos, '12');
    expect(ajustado.collarNumero).toBe('12');
    expect(ajustado.corderos.map((c) => c.collar_marca)).toEqual(['punto_arriba', 'punto_abajo']);
  });

  test('un parto sin corderos tampoco conserva collar', () => {
    expect(ajustarCollarDelParto([], '12').collarNumero).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// R3 — Collar activo único
// ---------------------------------------------------------------------------

describe('R3 — un número usado queda tomado toda la temporada', () => {
  test('un número sin uso está disponible', () => {
    expect(collarDisponible('12', [])).toBe(true);
  });

  test('un número ya usado en la temporada no está disponible', () => {
    expect(collarDisponible('12', ['12'])).toBe(false);
  });

  test('otro número sí está disponible', () => {
    expect(collarDisponible('13', ['12'])).toBe(true);
  });

  test('los ceros a la izquierda no crean un collar distinto', () => {
    // "012" y "12" son el mismo collar físico.
    expect(collarDisponible('12', ['012'])).toBe(false);
  });

  test('los nulos de partos sin collar no estorban', () => {
    expect(collarDisponible('12', [null, null, '13'])).toBe(true);
  });

  test('al editar un parto, su propio número no se bloquea a sí mismo', () => {
    // Sin esto, abrir un parto con collar 12 y guardarlo sin tocar el número
    // avisaría que el 12 está ocupado — por él mismo.
    expect(collarDisponible('12', ['12', '13'], '12')).toBe(true);
    expect(collarDisponible('13', ['12', '13'], '12')).toBe(false);
  });

  test('el número propio también se reconoce con ceros a la izquierda', () => {
    expect(collarDisponible('012', ['12'], '12')).toBe(true);
  });
});

describe('las marcas no se repiten dentro del parto', () => {
  test('sin corderos con marca, no hay ninguna ocupada', () => {
    expect(marcasOcupadas([cordero(), cordero()])).toEqual([]);
  });

  test('la marca de un hermano queda ocupada', () => {
    const a = cordero({ collar_marca: 'punto_arriba' });
    expect(marcasOcupadas([a, cordero()])).toEqual(['punto_arriba']);
  });

  test('al editar un cordero, su propia marca no cuenta como ocupada', () => {
    const a = cordero({ collar_marca: 'punto_arriba' });
    const b = cordero({ collar_marca: 'cruz_al_medio' });
    expect(marcasOcupadas([a, b], a.id)).toEqual(['cruz_al_medio']);
  });

  test('la marca de un anulado vuelve a estar libre', () => {
    // Dentro del parto sí se libera, al revés que el número: la marca no es un
    // objeto aparte, es la que lleva ese collar. Si el cordero no existió,
    // ningún animal la lleva puesta.
    const anulado = cordero({ collar_marca: 'punto_arriba', anulado_en: '2026-08-02T16:42:00Z' });
    expect(marcasOcupadas([anulado, cordero()])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Anular un cordero ya guardado
// ---------------------------------------------------------------------------

describe('anular un cordero', () => {
  test('en mellizos se puede anular uno', () => {
    const a = guardado();
    const b = guardado();
    expect(puedeAnular([a, b], a.id).puede).toBe(true);
  });

  test('el último cordero que queda no se puede anular', () => {
    // Un parto sin corderos no puede existir: alguien vio parir a la oveja.
    // Si el parto entero está mal, lo que corresponde es cambiar la madre.
    const solo = guardado();
    expect(puedeAnular([solo], solo.id).puede).toBe(false);
  });

  test('tampoco si los demás ya están anulados', () => {
    const vivo = guardado();
    const anulado = guardado({ anulado_en: '2026-08-02T16:42:00Z' });
    expect(puedeAnular([vivo, anulado], vivo.id).puede).toBe(false);
  });

  test('un cordero muerto sigue contando como hermano', () => {
    // El muerto existió: el parto no queda sin corderos si se anula al otro.
    const vivo = guardado();
    const muerto = guardado({ estado: 'muerto' });
    expect(puedeAnular([vivo, muerto], vivo.id).puede).toBe(true);
  });

  test('un cordero señalado no se anula', () => {
    // Tiene tatuaje puesto: se lo vio y se lo midió. La base lo rechaza igual.
    const a = guardado({ estado: 'senalado' });
    const b = guardado();
    expect(puedeAnular([a, b], a.id).puede).toBe(false);
  });

  test('uno ya anulado no se vuelve a anular', () => {
    const a = guardado({ anulado_en: '2026-08-02T16:42:00Z' });
    const b = guardado();
    const c = guardado();
    expect(puedeAnular([a, b, c], a.id).puede).toBe(false);
  });

  test('cada rechazo dice por qué', () => {
    const solo = guardado();
    const senalado = guardado({ estado: 'senalado' });
    const otro = guardado();
    const porUltimo = puedeAnular([solo], solo.id);
    const porSenalado = puedeAnular([senalado, otro], senalado.id);
    expect(porUltimo.puede).toBe(false);
    expect(porSenalado.puede).toBe(false);
    if (!porUltimo.puede && !porSenalado.puede) {
      expect(porUltimo.motivo).not.toBe(porSenalado.motivo);
    }
  });
});

describe('el parto que queda en único después de anular', () => {
  test('de mellizos a único: hay que preguntar por el collar', () => {
    const a = guardado();
    const b = guardado();
    expect(partoQuedaUnico([a, b], a.id)).toBe(true);
  });

  test('de trillizos a mellizos: el collar sigue haciendo falta', () => {
    const a = guardado();
    const b = guardado();
    const c = guardado();
    expect(partoQuedaUnico([a, b, c], a.id)).toBe(false);
  });

  test('los anulados anteriores ya no cuentan', () => {
    const a = guardado();
    const b = guardado();
    const viejo = guardado({ anulado_en: '2026-08-01T10:00:00Z' });
    expect(partoQuedaUnico([a, b, viejo], a.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R8 — Muerte entre el nacimiento y la señalada
// ---------------------------------------------------------------------------

describe('R8 — registrar una muerte posterior', () => {
  test('un cordero sin señalar puede morir', () => {
    expect(puedeRegistrarMuerte(guardado()).puede).toBe(true);
  });

  test('uno ya muerto no se vuelve a matar', () => {
    expect(puedeRegistrarMuerte(guardado({ estado: 'muerto' })).puede).toBe(false);
  });

  test('uno señalado queda fuera de esta fase', () => {
    // La muerte de un señalado es otro caso: perdería el hecho de haber sido
    // señalado, y eso hay que resolverlo desde la web.
    expect(puedeRegistrarMuerte(guardado({ estado: 'senalado' })).puede).toBe(false);
  });

  test('un anulado no muere: nunca existió', () => {
    expect(puedeRegistrarMuerte(guardado({ anulado_en: '2026-08-02T16:42:00Z' })).puede).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R7 — Rangos de peso
// ---------------------------------------------------------------------------

describe('R7 — el peso avisa fuera de 2,5–6 kg y bloquea fuera de 0,5–8 kg', () => {
  // Umbrales calibrados contra los 468 corderos vivos de 2025: mediana 4,14 kg,
  // máximo 6,90 kg. El aviso sobre 6 kg salta en 1 de cada 33 partos — raro
  // pero no invisible. A 5 kg saltaría en 1 de cada 6 y el equipo aprendería a
  // descartarlo.
  test('un peso típico pasa sin observaciones', () => {
    expect(validarPeso(4.14).estado).toBe('ok');
  });

  test('los límites del rango normal no avisan', () => {
    expect(validarPeso(2.5).estado).toBe('ok');
    expect(validarPeso(6).estado).toBe('ok');
  });

  test('por debajo de 2,5 kg avisa pero deja guardar', () => {
    expect(validarPeso(2.4).estado).toBe('aviso');
  });

  test('por encima de 6 kg avisa pero deja guardar', () => {
    // El máximo real de 2025 fue 6,90: existe, pero merece una mirada.
    expect(validarPeso(6.9).estado).toBe('aviso');
  });

  test('el tope de 8 kg todavía deja guardar', () => {
    expect(validarPeso(8).estado).toBe('aviso');
  });

  test('por encima de 8 kg bloquea', () => {
    expect(validarPeso(8.01).estado).toBe('bloqueo');
    expect(validarPeso(45).estado).toBe('bloqueo');
  });

  test('por debajo de 0,5 kg bloquea', () => {
    expect(validarPeso(0.49).estado).toBe('bloqueo');
  });

  test('cero bloquea: el peso desconocido va como nulo, no como cero', () => {
    // Los históricos de Zoho cargaban 0 en los muertos. Eso destruye cualquier
    // promedio; acá 0 no es un peso válido.
    expect(validarPeso(0).estado).toBe('bloqueo');
  });

  test('más de dos decimales bloquea', () => {
    // La balanza da dos decimales. Un tercero solo puede ser un dedo de más.
    expect(validarPeso(4.125).estado).toBe('bloqueo');
    expect(validarPeso(4.12).estado).toBe('ok');
  });

  test('el peso ausente es válido: en muertos al nacer es opcional', () => {
    expect(validarPeso(null).estado).toBe('ok');
  });

  test('un valor no numérico bloquea', () => {
    expect(validarPeso(Number.NaN).estado).toBe('bloqueo');
  });
});

// ---------------------------------------------------------------------------
// Fecha de muerte
// ---------------------------------------------------------------------------

describe('la fecha de muerte va entre el nacimiento y hoy', () => {
  const nacimiento = '2026-08-10';
  const hoy = '2026-08-20';

  test('el mismo día del parto es válida', () => {
    expect(validarFechaMuerte('2026-08-10', nacimiento, hoy).valida).toBe(true);
  });

  test('unos días después es válida', () => {
    expect(validarFechaMuerte('2026-08-15', nacimiento, hoy).valida).toBe(true);
  });

  test('hoy es válida', () => {
    expect(validarFechaMuerte(hoy, nacimiento, hoy).valida).toBe(true);
  });

  test('antes de nacer no es válida', () => {
    expect(validarFechaMuerte('2026-08-09', nacimiento, hoy).valida).toBe(false);
  });

  test('mañana no es válida', () => {
    expect(validarFechaMuerte('2026-08-21', nacimiento, hoy).valida).toBe(false);
  });

  test('sin fecha no es válida: en un cordero muerto es obligatoria', () => {
    expect(validarFechaMuerte(null, nacimiento, hoy).valida).toBe(false);
  });

  test('los dos motivos de rechazo se distinguen', () => {
    const antes = validarFechaMuerte('2026-08-09', nacimiento, hoy);
    const despues = validarFechaMuerte('2026-08-21', nacimiento, hoy);
    expect(antes.valida).toBe(false);
    expect(despues.valida).toBe(false);
    if (!antes.valida && !despues.valida) {
      expect(antes.motivo).not.toBe(despues.motivo);
    }
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
