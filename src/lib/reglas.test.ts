import { describe, expect, test } from 'vitest';
import {
  ajustarCollarDelParto,
  camposFaltantes,
  collarDisponible,
  collaresDuplicados,
  corderosQueRequierenMarca,
  hermanoDelMismoSexo,
  marcasDuplicadasEnParto,
  marcasOcupadas,
  maximoElegible,
  ningunaCanelaNiLunar,
  normalizarTatuaje,
  partoQuedaUnico,
  partoRequiereCollar,
  puedeAnular,
  puedeRegistrarMuerte,
  puedeSenalar,
  rangoTemporada,
  restarDias,
  siguienteTatuaje,
  tatuajeDisponible,
  tipoNacimiento,
  validarFechaMuerte,
  validarFechaNacimiento,
  validarFechaSenalada,
  validarPeso,
  SIN_CANELA_NI_LUNAR,
  type BorradorSenalada,
  type CorderoDelParto,
  type CorderoEnFicha,
  type MarcaCollar,
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

// ---------------------------------------------------------------------------
// La señalada — el tatuaje
// ---------------------------------------------------------------------------

describe('el tatuaje se normaliza a tres dígitos', () => {
  test('rellena con ceros a la izquierda', () => {
    // El índice único de Postgres compara texto. Sin esto, '7' y '007' serían
    // dos tatuajes distintos para la base y el mismo número en dos orejas.
    expect(normalizarTatuaje('7')).toBe('007');
    expect(normalizarTatuaje('42')).toBe('042');
  });

  test('lo ya normalizado no cambia', () => {
    expect(normalizarTatuaje('042')).toBe('042');
    expect(normalizarTatuaje('999')).toBe('999');
  });

  test('los espacios y los ceros de más no hacen otro tatuaje', () => {
    expect(normalizarTatuaje('  42 ')).toBe('042');
    expect(normalizarTatuaje('0042')).toBe('042');
  });

  test('el 000 no existe: la numeración arranca en 001', () => {
    expect(normalizarTatuaje('0')).toBeNull();
    expect(normalizarTatuaje('000')).toBeNull();
  });

  test('más de 999 no entra en la pinza', () => {
    expect(normalizarTatuaje('1000')).toBeNull();
  });

  test('lo que no es un número no es un tatuaje', () => {
    expect(normalizarTatuaje('')).toBeNull();
    expect(normalizarTatuaje('abc')).toBeNull();
    expect(normalizarTatuaje('4,2')).toBeNull();
    expect(normalizarTatuaje('-7')).toBeNull();
  });
});

describe('el siguiente tatuaje libre', () => {
  test('la temporada arranca en el 001', () => {
    expect(siguienteTatuaje([], null)).toBe('001');
  });

  test('es el último puesto más uno', () => {
    expect(siguienteTatuaje(['001', '041'], '041')).toBe('042');
  });

  test('un hueco en el medio no se rellena', () => {
    // Un número salteado casi siempre es un cordero que murió, no un número
    // libre. Reusarlo confundiría dos animales en el histórico. La cuenta solo
    // mira para adelante, así que el hueco queda atrás y ahí se queda.
    expect(siguienteTatuaje(['001', '002', '005'], '005')).toBe('006');
  });

  test('un número suelto muy arriba no envenena la serie', () => {
    // El caso que motivó este cambio: el 27 de agosto de 2026 una cordera
    // terminó con el 910 en la oreja por un error al manipular la tatuadora.
    // Contando desde el mayor, la app sugirió 911 el resto de la temporada.
    expect(siguienteTatuaje(['108', '910', '110'], '110')).toBe('111');
  });

  test('el número suelto molesta una sola vez', () => {
    // Apenas se carga, sí manda: nada distingue un error de la tatuadora de un
    // salto deliberado. Pero alcanza con corregir a mano el siguiente para que
    // la serie vuelva sola a su lugar.
    expect(siguienteTatuaje(['108', '910'], '910')).toBe('911');
    expect(siguienteTatuaje(['108', '910', '110'], '110')).toBe('111');
  });

  test('los ya puestos se saltean', () => {
    // Pasó el 8 de agosto de 2026: venían el 012, 013 y 014, y después
    // rellenaron el 009 que había quedado colgado. Desde el 009, el primer
    // libre es el 015 — que fue exactamente lo que tipearon.
    expect(siguienteTatuaje(['010', '011', '012', '013', '014', '009'], '009')).toBe('015');
  });

  test('los corderos sin señalar no cuentan', () => {
    expect(siguienteTatuaje([null, '007', null], '007')).toBe('008');
  });

  test('agotados los tres dígitos, no hay sugerencia', () => {
    // Remotísimo —en 2025 hubo 468 corderos vivos— pero la app no debería
    // descubrirlo en el corral.
    expect(siguienteTatuaje(['999'], '999')).toBeNull();
  });
});

describe('un tatuaje usado no se repite en la temporada', () => {
  test('uno libre está disponible', () => {
    expect(tatuajeDisponible('042', ['001', '041'])).toBe(true);
  });

  test('uno tomado no', () => {
    expect(tatuajeDisponible('041', ['001', '041'])).toBe(false);
  });

  test('la comparación es por número, no por texto', () => {
    // El caso que esta función existe para frenar.
    expect(tatuajeDisponible('41', ['041'])).toBe(false);
    expect(tatuajeDisponible('041', ['41'])).toBe(false);
  });

  test('el propio tatuaje no se bloquea a sí mismo al corregir', () => {
    expect(tatuajeDisponible('042', ['042'], '042')).toBe(true);
  });

  test('uno imposible nunca está disponible', () => {
    expect(tatuajeDisponible('0', [])).toBe(false);
    expect(tatuajeDisponible('abc', [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R11 — Señalada completa o nada
// ---------------------------------------------------------------------------

/** Una señalada completa, para ir sacándole campos en cada test. */
function borrador(sobre: Partial<BorradorSenalada> = {}): BorradorSenalada {
  return {
    sexo: 'macho',
    tatuaje: '042',
    entropion: 'ninguno',
    canelaLunar: SIN_CANELA_NI_LUNAR,
    halo_hair: 0,
    pigmentacion: 0,
    ...sobre,
  };
}

describe('R11 — la señalada es completa o no es', () => {
  test('con los nueve campos no falta nada', () => {
    expect(camposFaltantes(borrador())).toEqual([]);
  });

  test('cada campo vacío se nombra', () => {
    expect(camposFaltantes(borrador({ sexo: null })).map((f) => f.campo)).toEqual(['sexo']);
    expect(camposFaltantes(borrador({ entropion: null })).map((f) => f.campo)).toEqual(['entropion']);
    expect(camposFaltantes(borrador({ halo_hair: null })).map((f) => f.campo)).toEqual(['halo_hair']);
  });

  test('un tatuaje imposible cuenta como faltante', () => {
    expect(camposFaltantes(borrador({ tatuaje: null })).map((f) => f.campo)).toEqual(['tatuaje']);
    expect(camposFaltantes(borrador({ tatuaje: '0' })).map((f) => f.campo)).toEqual(['tatuaje']);
  });

  test('canela y lunar sin contestar es distinto de las cuatro en cero', () => {
    // La distinción que la matriz de casillas sueltas no podía expresar y que
    // «Ninguna de las cuatro» resuelve: sin ella la app inventaría ceros.
    expect(camposFaltantes(borrador({ canelaLunar: null })).map((f) => f.campo)).toEqual([
      'canelaLunar',
    ]);
    expect(camposFaltantes(borrador({ canelaLunar: SIN_CANELA_NI_LUNAR }))).toEqual([]);
  });

  test('la pigmentación fuera de la escala 0–4 no vale', () => {
    expect(camposFaltantes(borrador({ pigmentacion: 5 })).map((f) => f.campo)).toEqual([
      'pigmentacion',
    ]);
    expect(camposFaltantes(borrador({ pigmentacion: -1 })).map((f) => f.campo)).toEqual([
      'pigmentacion',
    ]);
    expect(camposFaltantes(borrador({ pigmentacion: 4 }))).toEqual([]);
  });

  test('la pigmentación 0 es una respuesta, no un vacío', () => {
    expect(camposFaltantes(borrador({ pigmentacion: 0 }))).toEqual([]);
  });

  test('los faltantes salen en el orden de la pantalla', () => {
    const vacio = camposFaltantes({
      sexo: null,
      tatuaje: null,
      entropion: null,
      canelaLunar: null,
      halo_hair: null,
      pigmentacion: null,
    });
    expect(vacio.map((f) => f.campo)).toEqual([
      'sexo',
      'tatuaje',
      'entropion',
      'canelaLunar',
      'halo_hair',
      'pigmentacion',
    ]);
  });
});

describe('ninguna canela ni lunar', () => {
  test('las cuatro en cero', () => {
    expect(ningunaCanelaNiLunar(SIN_CANELA_NI_LUNAR)).toBe(true);
  });

  test('con una encendida, ya no es ninguna', () => {
    expect(ningunaCanelaNiLunar({ ...SIN_CANELA_NI_LUNAR, canela_no_vellon: 1 })).toBe(false);
  });
});

describe('a quién se puede señalar', () => {
  test('a un cordero nacido, sí', () => {
    expect(puedeSenalar(guardado()).puede).toBe(true);
  });

  test('a uno muerto, no: no pasa por la señalada', () => {
    expect(puedeSenalar(guardado({ estado: 'muerto' })).puede).toBe(false);
  });

  test('a uno ya señalado, no: lo que corresponde es corregir', () => {
    expect(puedeSenalar(guardado({ estado: 'senalado' })).puede).toBe(false);
  });

  test('a uno anulado, no', () => {
    expect(puedeSenalar(guardado({ anulado_en: '2026-08-02T16:42:00Z' })).puede).toBe(false);
  });

  test('cada negativa explica algo distinto', () => {
    const muerto = puedeSenalar(guardado({ estado: 'muerto' }));
    const senalado = puedeSenalar(guardado({ estado: 'senalado' }));
    const anulado = puedeSenalar(guardado({ anulado_en: 'x' }));
    const motivos = [muerto, senalado, anulado].map((p) => (p.puede ? '' : p.motivo));
    expect(new Set(motivos).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// R6 — El hermano equivocado
// ---------------------------------------------------------------------------

describe('R6 — la discrepancia de sexo puede ser el hermano equivocado', () => {
  const macho = { id: 'a', sexo: 'macho' as const, anulado_en: null };
  const hembra = { id: 'b', sexo: 'hembra' as const, anulado_en: null };

  test('en mellizos de distinto sexo, señala al hermano que sí coincide', () => {
    // Se está señalando al macho y el operador dice que es hembra: lo más
    // probable es que en la mano tenga a su hermana.
    expect(hermanoDelMismoSexo([macho, hembra], 'a', 'hembra')).toBe(hembra);
  });

  test('en un parto único no hay con quién confundirse', () => {
    expect(hermanoDelMismoSexo([macho], 'a', 'hembra')).toBeNull();
  });

  test('si los hermanos son del mismo sexo que el registrado, no hay aviso', () => {
    const otroMacho = { id: 'c', sexo: 'macho' as const, anulado_en: null };
    expect(hermanoDelMismoSexo([macho, otroMacho], 'a', 'hembra')).toBeNull();
  });

  test('un hermano anulado no cuenta: no existió', () => {
    const anulada = { ...hembra, anulado_en: '2026-08-02T16:42:00Z' };
    expect(hermanoDelMismoSexo([macho, anulada], 'a', 'hembra')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lo que el panel de revisión tiene que poder encontrar
// ---------------------------------------------------------------------------

describe('restarDias no se corre con el cambio de horario', () => {
  test('resta días corridos', () => {
    expect(restarDias('2026-08-20', 15)).toBe('2026-08-05');
    expect(restarDias('2026-08-20', 0)).toBe('2026-08-20');
  });

  test('cruza el fin de mes y el de año', () => {
    expect(restarDias('2026-09-03', 15)).toBe('2026-08-19');
    expect(restarDias('2027-01-05', 10)).toBe('2026-12-26');
  });

  // Uruguay estuvo en horario de verano hasta 2015 y podría volver. Con la
  // resta al mediodía UTC el resultado no depende de eso.
  test('funciona con un timestamp completo, no solo con la fecha', () => {
    expect(restarDias('2026-08-20T23:40:00Z', 15)).toBe('2026-08-05');
  });
});

describe('collaresDuplicados agrupa por el objeto físico, no por el texto', () => {
  // El caso que justifica la función: agrupando por el string crudo, estos dos
  // partos no aparecerían — y son el mismo collar en dos ovejas.
  test('«12» y «012» son el mismo collar', () => {
    const duplicados = collaresDuplicados([
      { id: 'a', collar_numero: '12' },
      { id: 'b', collar_numero: '012' },
    ]);
    expect(duplicados).toHaveLength(1);
    expect(duplicados[0]?.numero).toBe('12');
    expect(duplicados[0]?.partos.map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('sin repetidos no devuelve nada', () => {
    expect(
      collaresDuplicados([
        { id: 'a', collar_numero: '12' },
        { id: 'b', collar_numero: '13' },
      ]),
    ).toEqual([]);
  });

  test('los partos sin collar no se agrupan entre sí', () => {
    expect(
      collaresDuplicados([
        { id: 'a', collar_numero: null },
        { id: 'b', collar_numero: null },
        { id: 'c', collar_numero: '  ' },
      ]),
    ).toEqual([]);
  });

  test('tres partos con el mismo collar salen en un solo grupo', () => {
    const duplicados = collaresDuplicados([
      { id: 'a', collar_numero: '7' },
      { id: 'b', collar_numero: '07' },
      { id: 'c', collar_numero: '007' },
    ]);
    expect(duplicados).toHaveLength(1);
    expect(duplicados[0]?.partos).toHaveLength(3);
  });
});

describe('marcasDuplicadasEnParto', () => {
  const cordero = (
    id: string,
    parto_id: string,
    collar_marca: MarcaCollar | null,
    anulado_en: string | null = null,
  ) => ({ id, parto_id, collar_marca, anulado_en });

  test('dos hermanos con la misma marca', () => {
    const repetidas = marcasDuplicadasEnParto([
      cordero('a', 'p1', 'punto_arriba'),
      cordero('b', 'p1', 'punto_arriba'),
    ]);
    expect(repetidas).toHaveLength(1);
    expect(repetidas[0]?.partoId).toBe('p1');
    expect(repetidas[0]?.marca).toBe('punto_arriba');
  });

  test('la misma marca en partos distintos no es duplicado', () => {
    expect(
      marcasDuplicadasEnParto([
        cordero('a', 'p1', 'punto_arriba'),
        cordero('b', 'p2', 'punto_arriba'),
      ]),
    ).toEqual([]);
  });

  // R3: la marca de un anulado vuelve a estar libre, porque no es un objeto
  // aparte sino la que lleva ese collar.
  test('un anulado no hace duplicado', () => {
    expect(
      marcasDuplicadasEnParto([
        cordero('a', 'p1', 'punto_arriba'),
        cordero('b', 'p1', 'punto_arriba', '2026-08-02T10:00:00Z'),
      ]),
    ).toEqual([]);
  });

  test('los corderos sin marca no se agrupan entre sí', () => {
    expect(
      marcasDuplicadasEnParto([cordero('a', 'p1', null), cordero('b', 'p1', null)]),
    ).toEqual([]);
  });

  test('un parto único con su cordero marcado no es duplicado', () => {
    expect(marcasDuplicadasEnParto([cordero('a', 'p1', 'punto_abajo')])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// La fecha de señalada: la deuda que la Fase 3 dejó escrita
// ---------------------------------------------------------------------------

describe('validarFechaSenalada', () => {
  const parto = '2026-08-02';
  const hoy = '2026-08-20';

  test('lo normal pasa sin decir nada', () => {
    expect(validarFechaSenalada('2026-08-10', parto, hoy).estado).toBe('ok');
    // El mismo día del parto es raro pero posible, y no es un error de dato.
    expect(validarFechaSenalada(parto, parto, hoy).estado).toBe('ok');
  });

  test('anterior al parto se bloquea, y dice cuándo fue el parto', () => {
    const r = validarFechaSenalada('2026-08-01', parto, hoy);
    expect(r.estado).toBe('bloqueo');
    if (r.estado !== 'ok') expect(r.mensaje).toContain('2 de agosto');
  });

  test('futura se bloquea', () => {
    expect(validarFechaSenalada('2026-08-21', parto, hoy).estado).toBe('bloqueo');
  });

  test('vacía o mal formada se bloquea', () => {
    expect(validarFechaSenalada(null, parto, hoy).estado).toBe('bloqueo');
    expect(validarFechaSenalada('', parto, hoy).estado).toBe('bloqueo');
    expect(validarFechaSenalada('20 de agosto', parto, hoy).estado).toBe('bloqueo');
  });

  // Aviso y no bloqueo: hay corderos que se señalan tarde y siguen siendo un
  // dato cierto. Bloquearlo obligaría a mentir la fecha para poder guardar.
  test('más de treinta días avisa pero deja guardar', () => {
    const r = validarFechaSenalada('2026-09-15', parto, '2026-09-20');
    expect(r.estado).toBe('aviso');
    if (r.estado !== 'ok') expect(r.mensaje).toContain('44 días');
  });

  test('justo en el umbral todavía no avisa', () => {
    expect(validarFechaSenalada('2026-09-01', parto, '2026-09-20').estado).toBe('ok');
  });

  /**
   * El caso con nombre y apellido, el que motivó toda la función: un cordero
   * nacido el 28 de noviembre se señala en diciembre, FUERA de la ventana de
   * parición. `validarFechaNacimiento` lo rechazaría siendo correcto.
   */
  test('un 12 de diciembre es válido, aunque la parición termine el 30 de noviembre', () => {
    expect(validarFechaSenalada('2026-12-12', '2026-11-28', '2026-12-20').estado).toBe('ok');
    // Y para que no queden dudas de contra qué se está comparando:
    expect(validarFechaNacimiento('2026-12-12', '2026-12-20', 2026).valida).toBe(false);
  });
});
