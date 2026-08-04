import { describe, expect, test } from 'vitest';
import {
  distribucionTipos,
  histogramaCondicion,
  matrizCanelaLunar,
  paternidadPorPadre,
  pendientesConAntiguedad,
  pesosPorSexoYTipo,
  prevalenciaDe,
  resumenAvance,
  resumenTemporada,
  serieAvance,
  tasasMortalidad,
  type FilaAvance,
  type FilaCondicion,
  type FilaMortalidad,
  type FilaPaternidad,
  type FilaPendientes,
  type FilaPeso,
  type FilaPrevalencia,
  type FilaResumen,
  type FilaTipoNacimiento,
} from './tablero';

/**
 * Las transformaciones de las vistas a lo que dibuja cada tarjeta.
 *
 * La mitad de estos tests prueban lo mismo desde ángulos distintos: **qué pasa
 * cuando no hay datos**. No es exceso de celo. El tablero se va a abrir por
 * primera vez con la temporada sin arrancar, y una tarjeta en blanco parece una
 * consulta rota; «0 %, de 0 de 503» es una respuesta. La regla de la casa —el
 * cero se muestra— vale acá como aserción, no como intención.
 */

const avance = (filas: Partial<FilaAvance>[]): FilaAvance[] =>
  filas.map((f) => ({
    temporada: 2026,
    dia: '2026-08-01',
    partos: 0,
    esperados: 0,
    en_ventana: 0,
    partos_acumulados: 0,
    esperados_acumulados: 0,
    paridas_acumuladas: 0,
    servidas: 503,
    esperados_temporada: 460.3,
    ...f,
  }));

describe('resumenAvance: el porcentaje grande', () => {
  test('sale de la última fila, que es la que acumula todo', () => {
    const r = resumenAvance(
      avance([
        { dia: '2026-08-01', paridas_acumuladas: 40 },
        { dia: '2026-08-02', paridas_acumuladas: 96 },
      ]),
    );
    expect(r.paridas).toBe(96);
    expect(r.servidas).toBe(503);
    expect(r.porcentaje).toBeCloseTo(19.09, 1);
  });

  test('sin datos no explota ni divide por cero', () => {
    expect(resumenAvance([])).toEqual({
      paridas: 0,
      servidas: 0,
      porcentaje: 0,
      esperados: 0,
    });
  });

  test('sin servicios cargados el denominador es cero y el porcentaje también', () => {
    const r = resumenAvance(avance([{ servidas: 0, paridas_acumuladas: 0 }]));
    expect(r.porcentaje).toBe(0);
  });

  // Los esperados van redondeados porque la vista los devuelve con decimales
  // —son una suma de fracciones de oveja— y «460,3 partos» no es una frase.
  test('los esperados de la temporada se redondean a partos enteros', () => {
    const r = resumenAvance(avance([{ esperados_temporada: 460.3 }]));
    expect(r.esperados).toBe(460);
  });

  // La aserción que guarda la 0016: la curva ya no supone que toda oveja
  // servida pare, así que el total esperado tiene que poder ser MENOR que las
  // servidas. Si alguien volviera a normalizar, estos dos números coincidirían.
  test('los esperados pueden quedar por debajo de las servidas', () => {
    const r = resumenAvance(avance([{ servidas: 503, esperados_temporada: 460.3 }]));
    expect(r.esperados).toBeLessThan(r.servidas);
  });

  test('las filas llegan ordenadas, pero no se confía en eso', () => {
    const r = resumenAvance(
      avance([
        { dia: '2026-08-02', paridas_acumuladas: 96 },
        { dia: '2026-08-01', paridas_acumuladas: 40 },
      ]),
    );
    expect(r.paridas).toBe(96);
  });
});

describe('serieAvance: la curva', () => {
  test('conserva un punto por día, con su etiqueta corta', () => {
    const serie = serieAvance(
      avance([
        { dia: '2026-08-01', partos: 3, esperados: 4.2 },
        { dia: '2026-08-02', partos: 0, esperados: 5.1 },
      ]),
    );
    expect(serie).toHaveLength(2);
    expect(serie[0]).toEqual({ dia: '2026-08-01', etiqueta: '1 ago', partos: 3, esperados: 4.2 });
  });

  test('los días vacíos se conservan: son el ritmo de la parición', () => {
    const serie = serieAvance(avance([{ dia: '2026-06-15', partos: 0, esperados: 0 }]));
    expect(serie).toHaveLength(1);
  });

  test('sin datos, una serie vacía y no un undefined', () => {
    expect(serieAvance([])).toEqual([]);
  });
});

describe('distribucionTipos: únicos, mellizos y trillizos', () => {
  const filas: FilaTipoNacimiento[] = [
    { temporada: 2026, tipo_nacimiento: 1, partos: 58, corderos: 58 },
    { temporada: 2026, tipo_nacimiento: 2, partos: 36, corderos: 72 },
    { temporada: 2026, tipo_nacimiento: 3, partos: 2, corderos: 6 },
  ];

  test('nombra cada tipo y ordena de menor a mayor', () => {
    const d = distribucionTipos(filas);
    expect(d.barras.map((b) => b.etiqueta)).toEqual(['Únicos', 'Mellizos', 'Trillizos']);
    expect(d.barras[0]).toMatchObject({ partos: 58, corderos: 58 });
  });

  test('la mellicería es el porcentaje de partos de dos o más', () => {
    // 38 de 96 partos.
    const d = distribucionTipos(filas);
    expect(d.melliceria).toBeCloseTo(39.58, 1);
    // Y se acompaña de su fracción, porque «50 %» sin denominador no dice de
    // qué mitad se habla.
    expect(d.multiples).toBe(38);
  });

  test('cada barra trae su porcentaje sobre el total de partos', () => {
    const d = distribucionTipos(filas);
    expect(d.barras[0]).toMatchObject({ etiqueta: 'Únicos', partos: 58 });
    expect(d.barras[0]?.porcentaje).toBeCloseTo(60.42, 1);
    expect(d.barras[2]?.porcentaje).toBeCloseTo(2.08, 1);
    // Los tres porcentajes suman 100: es la misma torta repartida.
    const suma = d.barras.reduce((n, b) => n + b.porcentaje, 0);
    expect(suma).toBeCloseTo(100, 5);
  });

  test('sin partos, cero por ciento y no NaN', () => {
    const d = distribucionTipos([]);
    expect(d.melliceria).toBe(0);
    expect(d.partos).toBe(0);
    expect(d.multiples).toBe(0);
    expect(d.barras).toEqual([]);
  });
});

describe('resumenTemporada: los dos números que se preguntan primero', () => {
  const fila: FilaResumen = {
    temporada: 2026,
    ovejas: 503,
    ovejas_paridas: 96,
    corderos_nacidos: 138,
    corderos_senalados: 41,
  };

  test('el avance del rodeo va sobre las ovejas, no sobre las inseminadas', () => {
    const r = resumenTemporada([fila]);
    expect(r.paridas).toBe(96);
    expect(r.ovejas).toBe(503);
    expect(r.porcentajeParidas).toBeCloseTo(19.09, 1);
  });

  test('el % de señalada se mide contra las paridas y puede pasar de 100', () => {
    // 41 señalados sobre 96 paridas.
    expect(resumenTemporada([fila]).porcentajeSenalada).toBeCloseTo(42.71, 1);

    // Con mellicería alta el número supera el 100 %, y eso es lo esperado: son
    // los corderos que deja cada oveja parida, no una tasa de supervivencia.
    const conMellizos = { ...fila, ovejas_paridas: 50, corderos_senalados: 87 };
    expect(resumenTemporada([conMellizos]).porcentajeSenalada).toBeCloseTo(174, 0);
  });

  test('sin ninguna oveja parida no se divide por cero', () => {
    const r = resumenTemporada([{ ...fila, ovejas_paridas: 0, corderos_senalados: 0 }]);
    expect(r.porcentajeSenalada).toBe(0);
    expect(r.porcentajeParidas).toBe(0);
  });

  test('sin filas, todo en cero: la vista no devuelve nada con la base vacía', () => {
    expect(resumenTemporada([])).toEqual({
      ovejas: 0,
      paridas: 0,
      porcentajeParidas: 0,
      nacidos: 0,
      senalados: 0,
      porcentajeSenalada: 0,
    });
  });
});

describe('tasasMortalidad: siempre con fecha de muerte', () => {
  const fila: FilaMortalidad = {
    temporada: 2026,
    nacidos: 138,
    nacidos_vivos: 133,
    muertos_al_nacer: 5,
    muertos_antes_de_senalar: 3,
    muertos_despues_de_senalar: 1,
  };

  test('la cifra grande es la mortalidad total sobre los nacidos', () => {
    const m = tasasMortalidad([fila]);
    // 5 + 3 + 1 = 9 muertos de 138 nacidos.
    expect(m.muertos).toBe(9);
    expect(m.tasaTotal).toBeCloseTo(6.52, 1);
  });

  test('las tres etapas comparten denominador, así que suman la cifra grande', () => {
    const m = tasasMortalidad([fila]);
    expect(m.etapas.map((e) => e.etiqueta)).toEqual([
      'Al nacer',
      'Antes de señalar',
      'Después de señalar',
    ]);
    expect(m.etapas.map((e) => e.corderos)).toEqual([5, 3, 1]);
    const suma = m.etapas.reduce((n, e) => n + e.porcentaje, 0);
    expect(suma).toBeCloseTo(m.tasaTotal, 5);
  });

  test('el señalado que murió después se cuenta aparte, no se pierde', () => {
    expect(tasasMortalidad([fila]).etapas[2]).toMatchObject({ corderos: 1 });
  });

  test('sin corderos la vista no devuelve ninguna fila, y aun así hay tarjeta', () => {
    const m = tasasMortalidad([]);
    expect(m.nacidos).toBe(0);
    expect(m.muertos).toBe(0);
    expect(m.tasaTotal).toBe(0);
    expect(m.etapas.map((e) => e.corderos)).toEqual([0, 0, 0]);
  });

  test('con nacidos pero sin muertos, las etapas existen en cero', () => {
    const m = tasasMortalidad([
      { ...fila, muertos_al_nacer: 0, muertos_antes_de_senalar: 0, muertos_despues_de_senalar: 0 },
    ]);
    expect(m.muertos).toBe(0);
    expect(m.tasaTotal).toBe(0);
    expect(m.etapas).toHaveLength(3);
  });
});

describe('pesosPorSexoYTipo', () => {
  const filas: FilaPeso[] = [
    { temporada: 2026, sexo: 'macho', tipo_nacimiento: 1, con_peso: 30, promedio_kg: 4.4, minimo_kg: 3, maximo_kg: 6 },
    { temporada: 2026, sexo: 'hembra', tipo_nacimiento: 1, con_peso: 28, promedio_kg: 4.1, minimo_kg: 3, maximo_kg: 5.5 },
    { temporada: 2026, sexo: 'macho', tipo_nacimiento: 2, con_peso: 36, promedio_kg: 3.9, minimo_kg: 2.5, maximo_kg: 5 },
  ];

  test('agrupa por tipo con una columna por sexo', () => {
    const g = pesosPorSexoYTipo(filas);
    expect(g).toHaveLength(2);
    expect(g[0]).toEqual({ etiqueta: 'Únicos', macho: 4.4, hembra: 4.1, n: 58 });
  });

  test('un sexo sin datos queda en null, no en cero: cero kilos sería mentira', () => {
    expect(pesosPorSexoYTipo(filas)[1]).toEqual({
      etiqueta: 'Mellizos',
      macho: 3.9,
      hembra: null,
      n: 36,
    });
  });

  test('sin pesos, sin barras', () => {
    expect(pesosPorSexoYTipo([])).toEqual([]);
  });
});

describe('pendientesConAntiguedad', () => {
  const filas: FilaPendientes[] = [
    { temporada: 2026, fecha_parto: '2026-08-01', pendientes: 12 },
    { temporada: 2026, fecha_parto: '2026-08-10', pendientes: 45 },
  ];

  test('suma el total y mide la espera más larga contra el hoy que se le pasa', () => {
    const p = pendientesConAntiguedad(filas, '2026-08-13');
    expect(p.total).toBe(57);
    expect(p.masViejaDias).toBe(12);
  });

  test('las barras van por fecha de parto, de la más vieja a la más nueva', () => {
    const p = pendientesConAntiguedad(filas, '2026-08-13');
    expect(p.barras.map((b) => b.etiqueta)).toEqual(['1 ago', '10 ago']);
  });

  test('sin pendientes el total es cero y no hay «la más vieja»', () => {
    const p = pendientesConAntiguedad([], '2026-08-13');
    expect(p.total).toBe(0);
    expect(p.masViejaDias).toBeNull();
  });
});

describe('matrizCanelaLunar: la misma matriz que en el campo', () => {
  const filas: FilaPrevalencia[] = [
    { temporada: 2026, rasgo: 'canela_vellon', valor: '1', corderos: 3, senalados: 41 },
    { temporada: 2026, rasgo: 'canela_vellon', valor: '0', corderos: 38, senalados: 41 },
    { temporada: 2026, rasgo: 'canela_no_vellon', valor: '1', corderos: 5, senalados: 41 },
    { temporada: 2026, rasgo: 'lunar_vellon', valor: '1', corderos: 1, senalados: 41 },
    { temporada: 2026, rasgo: 'lunar_no_vellon', valor: '1', corderos: 4, senalados: 41 },
  ];

  test('cuenta los que SÍ tienen el rasgo, con su porcentaje', () => {
    const m = matrizCanelaLunar(filas);
    expect(m.canela.vellon).toEqual({ corderos: 3, porcentaje: expect.closeTo(7.32, 1) });
    expect(m.lunar.noVellon).toEqual({ corderos: 4, porcentaje: expect.closeTo(9.76, 1) });
    expect(m.senalados).toBe(41);
  });

  test('una casilla que la vista no trajo es cero, no un hueco', () => {
    const m = matrizCanelaLunar([]);
    expect(m.canela.vellon).toEqual({ corderos: 0, porcentaje: 0 });
    expect(m.lunar.noVellon).toEqual({ corderos: 0, porcentaje: 0 });
    expect(m.senalados).toBe(0);
  });
});

describe('prevalenciaDe: un rasgo, sus valores en orden', () => {
  const filas: FilaPrevalencia[] = [
    { temporada: 2026, rasgo: 'pigmentacion', valor: '2', corderos: 6, senalados: 41 },
    { temporada: 2026, rasgo: 'pigmentacion', valor: '0', corderos: 30, senalados: 41 },
    { temporada: 2026, rasgo: 'pigmentacion', valor: '1', corderos: 5, senalados: 41 },
    { temporada: 2026, rasgo: 'halo_hair', valor: '1', corderos: 4, senalados: 41 },
  ];

  test('filtra por rasgo y ordena por valor', () => {
    const p = prevalenciaDe(filas, 'pigmentacion');
    expect(p.map((b) => b.etiqueta)).toEqual(['0', '1', '2']);
    expect(p[2]).toMatchObject({ corderos: 6 });
  });

  test('los ceros que trae la vista se conservan: son la mitad de la respuesta', () => {
    const conCero: FilaPrevalencia[] = [
      ...filas,
      { temporada: 2026, rasgo: 'pigmentacion', valor: '4', corderos: 0, senalados: 41 },
    ];
    const p = prevalenciaDe(conCero, 'pigmentacion');
    expect(p).toHaveLength(4);
    expect(p[3]).toMatchObject({ etiqueta: '4', corderos: 0 });
  });

  test('el entropión se traduce a palabras, que es como se dice', () => {
    const p = prevalenciaDe(
      [{ temporada: 2026, rasgo: 'entropion', valor: 'ojo_derecho', corderos: 1, senalados: 41 }],
      'entropion',
    );
    expect(p[0]).toMatchObject({ etiqueta: 'Ojo derecho' });
  });
});

describe('histogramaCondicion: los cuartos de la escala', () => {
  const filas: FilaCondicion[] = [
    { temporada: 2026, condicion_corporal: 3, partos: 30 },
    { temporada: 2026, condicion_corporal: 3.25, partos: 24 },
    { temporada: 2026, condicion_corporal: null, partos: 2 },
  ];

  test('rellena los cuartos vacíos entre 1 y 5', () => {
    const h = histogramaCondicion(filas);
    // 1,00 · 1,25 … 5,00 son 17 escalones, y todos existen aunque den cero.
    expect(h.barras).toHaveLength(17);
    expect(h.barras[0]).toEqual({ etiqueta: '1', valor: 1, partos: 0 });
    expect(h.barras.find((b) => b.valor === 3.25)).toMatchObject({ partos: 24 });
  });

  test('el «sin dato» sale aparte y no se mezcla con el histograma', () => {
    const h = histogramaCondicion(filas);
    expect(h.sinDato).toBe(2);
    expect(h.barras.some((b) => b.partos === 2)).toBe(false);
  });

  test('la mediana se calcula sobre los partos medidos', () => {
    expect(histogramaCondicion(filas).mediana).toBe(3);
  });

  test('sin partos: escala completa en cero y sin mediana', () => {
    const h = histogramaCondicion([]);
    expect(h.barras).toHaveLength(17);
    expect(h.barras.every((b) => b.partos === 0)).toBe(true);
    expect(h.mediana).toBeNull();
    expect(h.sinDato).toBe(0);
  });
});

const paternidad = (filas: Partial<FilaPaternidad>[]): FilaPaternidad[] =>
  filas.map((f, i) => ({
    temporada: 2026,
    parto_id: `p${i}`,
    oveja_id: `o${i}`,
    caravana: '1740',
    fecha_parto: '2026-08-10',
    candidatos: 1,
    alternativas: 0,
    padre: '32',
    cabana: null,
    servicio_tipo: 'inseminacion',
    servicio_inicio: '2026-03-15',
    servicio_fin: '2026-03-15',
    gestacion_min: 148,
    gestacion_max: 148,
    confianza: 'cierto',
    ...f,
  }));

describe('paternidadPorPadre: partos por padre, con los sin-padre a la vista', () => {
  test('agrupa por padre y ordena del que más partos tiene al que menos', () => {
    const p = paternidadPorPadre(
      paternidad([
        { padre: '32', cabana: 'La Petra' },
        { padre: '32', cabana: 'La Petra' },
        { padre: '7', cabana: null },
      ]),
    );
    expect(p.padres).toHaveLength(2);
    expect(p.padres[0]).toEqual({ etiqueta: '32 · La Petra', partos: 2, porcentaje: (2 / 3) * 100 });
    expect(p.padres[1]?.etiqueta).toBe('7');
    expect(p.conPadre).toBe(3);
  });

  test('separa ciertos de probables, que es lo que la 0018 vino a distinguir', () => {
    const p = paternidadPorPadre(
      paternidad([
        { padre: '32', confianza: 'cierto' },
        { padre: '32', confianza: 'probable' },
        { padre: '7', confianza: 'probable' },
      ]),
    );
    expect(p.conPadre).toBe(3);
    expect(p.ciertos).toBe(1);
    expect(p.probables).toBe(2);
  });

  test('los sin padre van a revisar, los más viejos primero', () => {
    const p = paternidadPorPadre(
      paternidad([
        { padre: '32' },
        { padre: null, confianza: null, candidatos: 0, caravana: '209 V', fecha_parto: '2026-08-20' },
        { padre: null, confianza: null, candidatos: 0, caravana: '1802', fecha_parto: '2026-08-05' },
      ]),
    );
    expect(p.conPadre).toBe(1);
    expect(p.revisar.map((r) => r.caravana)).toEqual(['1802', '209 V']);
  });

  test('se cuentan los que tienen padre pero además otro servicio posible', () => {
    // Elegir no es lo mismo que no tener nada que mirar: estos van al panel.
    const p = paternidadPorPadre(
      paternidad([{ padre: '32', alternativas: 1 }, { padre: '7', alternativas: 0 }]),
    );
    expect(p.conAlternativa).toBe(1);
  });

  test('sin datos: ceros explícitos y listas vacías, nunca NaN', () => {
    expect(paternidadPorPadre([])).toEqual({
      partos: 0,
      conPadre: 0,
      ciertos: 0,
      probables: 0,
      conAlternativa: 0,
      padres: [],
      revisar: [],
    });
  });
});
