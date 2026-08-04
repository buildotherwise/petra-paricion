import { describe, expect, test } from 'vitest';
import {
  gestacionLegible,
  padreProbable,
  tienePadre,
  type ServicioDeLaMadre,
} from './paternidad';

/**
 * La regla del padre probable está escrita dos veces —acá y en la vista
 * `v_paternidad` de la migración 0018— porque el corral no tiene señal. Estos
 * tests fijan la versión del aparato; `supabase/tests/metricas.test.sql` fija la
 * del servidor, con los mismos casos donde se puede.
 *
 * El caso que más importa no es el que acierta: es el que **no afirma**. Un
 * cordero con padre equivocado en un plantel de cabaña es peor que uno sin
 * padre, porque el segundo se investiga y el primero se hereda.
 */

const ia = (fecha: string, padre: string, cabana = 'PETRA'): ServicioDeLaMadre => ({
  tipo: 'inseminacion',
  fecha_inicio: fecha,
  fecha_fin: fecha,
  padre,
  cabana,
});

const encarnerada = (
  inicio: string,
  fin: string,
  padre: string,
): ServicioDeLaMadre => ({
  tipo: 'encarnerada',
  fecha_inicio: inicio,
  fecha_fin: fin,
  padre,
  cabana: null,
});

describe('padreProbable: gana el servicio que mejor explica la fecha', () => {
  test('una inseminación sola, en el centro: cierto', () => {
    // 9 de marzo + 150 días = 6 de agosto.
    const r = padreProbable([ia('2026-03-09', '3050')], '2026-08-06');
    expect(tienePadre(r)).toBe(true);
    if (!tienePadre(r)) return;
    expect(r.padre).toBe('3050');
    expect(r.cabana).toBe('PETRA');
    expect(r.gestacionMin).toBe(150);
    expect(r.gestacionMax).toBe(150);
    expect(r.confianza).toBe('cierto');
    expect(r.alternativas).toBe(0);
  });

  test('los tres casos que la regla vieja dejaba sin padre: 142, 143 y 144 días', () => {
    // Son los partos reales que motivaron la 0018. Con la ventana [145,155]
    // los tres quedaban en null por uno, dos y tres días.
    for (const [fecha, dias] of [
      ['2026-08-01', 142],
      ['2026-08-02', 143],
      ['2026-08-03', 144],
    ] as const) {
      const r = padreProbable([ia('2026-03-12', '32')], fecha);
      expect(tienePadre(r)).toBe(true);
      if (!tienePadre(r)) return;
      expect(r.gestacionMin).toBe(dias);
      expect(r.padre).toBe('32');
      expect(r.confianza).toBe('probable');
    }
  });

  test('145 y 155 días son ciertos; 144 y 156 son probables', () => {
    const limite = (dias: number) => {
      const parto = new Date(Date.UTC(2026, 2, 12) + dias * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const r = padreProbable([ia('2026-03-12', '32')], parto);
      return tienePadre(r) ? r.confianza : null;
    };
    expect(limite(145)).toBe('cierto');
    expect(limite(155)).toBe('cierto');
    expect(limite(144)).toBe('probable');
    expect(limite(156)).toBe('probable');
  });

  test('fuera de 140–160 no se afirma, pero se dice cuál era el más cercano', () => {
    // Una IA de enero no explica un parto de agosto: son 209 días.
    const r = padreProbable([ia('2026-01-05', '32')], '2026-08-02');
    expect(tienePadre(r)).toBe(false);
    if (tienePadre(r)) return;
    expect(r.motivo).toBe('fuera-de-rango');
    if (r.motivo !== 'fuera-de-rango') return;
    expect(r.padre).toBe('32');
    expect(r.gestacionMin).toBe(209);
  });

  test('una oveja de alta manual (R9) no tiene servicios, y eso se dice distinto', () => {
    const r = padreProbable([], '2026-08-02');
    expect(tienePadre(r)).toBe(false);
    if (tienePadre(r)) return;
    expect(r.motivo).toBe('sin-servicios');
  });
});

describe('padreProbable: la encarnerada es un rango, no una fecha', () => {
  test('un rango que contiene los 150 días es tan bueno como una IA exacta', () => {
    // 1→15 de marzo, parto el 1 de agosto: la gestación posible va de 139 a
    // 153, así que 150 cae adentro. Distancia cero.
    const r = padreProbable([encarnerada('2026-03-01', '2026-03-15', '4459')], '2026-08-01');
    expect(tienePadre(r)).toBe(true);
    if (!tienePadre(r)) return;
    expect(r.confianza).toBe('cierto');
    expect(r.tipo).toBe('encarnerada');
  });

  test('el rango informado se acota a lo posible: [140, 153] y no [139, 153]', () => {
    const r = padreProbable([encarnerada('2026-03-01', '2026-03-15', '4459')], '2026-08-01');
    if (!tienePadre(r)) throw new Error('debería tener padre');
    expect(r.gestacionMin).toBe(140);
    expect(r.gestacionMax).toBe(153);
  });
});

describe('padreProbable: cuando hay más de un servicio', () => {
  test('gana el más cercano a 150, no el más nuevo ni el primero', () => {
    // IA el 9 y el 11 de marzo, parto el 3 de agosto: 147 y 145 días.
    const r = padreProbable(
      [ia('2026-03-09', '3020'), ia('2026-03-11', '4459')],
      '2026-08-03',
    );
    if (!tienePadre(r)) throw new Error('debería tener padre');
    expect(r.padre).toBe('3020');
    expect(r.gestacionMin).toBe(147);
  });

  test('el orden de entrada no cambia el resultado', () => {
    const servicios = [ia('2026-03-11', '4459'), ia('2026-03-09', '3020')];
    const r = padreProbable(servicios, '2026-08-03');
    if (!tienePadre(r)) throw new Error('debería tener padre');
    expect(r.padre).toBe('3020');
  });

  test('con dos posibles de padres distintos queda 1 alternativa', () => {
    const r = padreProbable(
      [ia('2026-03-09', '3020'), ia('2026-03-11', '4459')],
      '2026-08-03',
    );
    if (!tienePadre(r)) throw new Error('debería tener padre');
    expect(r.alternativas).toBe(1);
  });

  test('dos servicios del MISMO carnero no son una ambigüedad', () => {
    // Una oveja reinseminada con el mismo padre no tiene nada que decidir, y
    // mandarla al panel de revisión sería gastar la atención de alguien.
    const r = padreProbable(
      [ia('2026-03-09', '3020'), ia('2026-03-11', '3020')],
      '2026-08-03',
    );
    if (!tienePadre(r)) throw new Error('debería tener padre');
    expect(r.alternativas).toBe(0);
  });

  test('el servicio imposible no cuenta como alternativa', () => {
    // La IA de enero no explica nada, así que la encarnerada gana sin competencia.
    const r = padreProbable(
      [ia('2026-01-05', '32'), ia('2026-03-09', '3020')],
      '2026-08-06',
    );
    if (!tienePadre(r)) throw new Error('debería tener padre');
    expect(r.padre).toBe('3020');
    expect(r.alternativas).toBe(0);
  });

  test('ante empate exacto gana el más nuevo: la reinseminación prueba que la anterior falló', () => {
    // Con dos fechas distintas nunca hay empate entre inseminaciones: una está
    // más cerca de 150 que la otra. El empate real se da entre dos rangos que
    // CONTIENEN los 150 días, porque los dos quedan a distancia cero.
    // Parto el 1 de agosto ⇒ los 150 días caen en el 4 de marzo, y los dos
    // rangos de abajo lo contienen.
    const r = padreProbable(
      [
        encarnerada('2026-03-01', '2026-03-20', 'viejo'),
        encarnerada('2026-03-02', '2026-03-10', 'nuevo'),
      ],
      '2026-08-01',
    );
    if (!tienePadre(r)) throw new Error('debería tener padre');
    expect(r.padre).toBe('nuevo');
  });
});

describe('padreProbable: datos incompletos no rompen la pantalla', () => {
  test('un servicio sin fecha o sin padre se ignora', () => {
    const roto: ServicioDeLaMadre = {
      tipo: 'inseminacion',
      fecha_inicio: null,
      fecha_fin: null,
      padre: null,
      cabana: null,
    };
    const r = padreProbable([roto, ia('2026-03-09', '3050')], '2026-08-06');
    if (!tienePadre(r)) throw new Error('debería tener padre');
    expect(r.padre).toBe('3050');
  });

  test('si TODOS están rotos es como no tener servicios', () => {
    const roto: ServicioDeLaMadre = {
      tipo: null,
      fecha_inicio: null,
      fecha_fin: null,
      padre: null,
      cabana: null,
    };
    const r = padreProbable([roto], '2026-08-06');
    expect(tienePadre(r)).toBe(false);
    if (tienePadre(r)) return;
    expect(r.motivo).toBe('sin-servicios');
  });
});

describe('gestacionLegible', () => {
  test('una IA da un número; una encarnerada, un rango', () => {
    expect(gestacionLegible(146, 146)).toBe('146 días');
    expect(gestacionLegible(140, 153)).toBe('entre 140 y 153 días');
  });
});
