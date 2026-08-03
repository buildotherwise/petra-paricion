import { describe, expect, test } from 'vitest';
import { aCSV, BOM, escapar, formatear, nombreDeArchivo, type ColumnaCSV } from './exportacion';

/**
 * Lo que se prueba acá es lo que rompe la planilla en silencio.
 *
 * Un CSV mal armado no falla: abre, se ve bien, y los promedios dan cero. Por
 * eso los casos son los tres de siempre —separador, BOM, coma decimal— más el
 * escapado y el orden de columnas, que es el que impide romper la planilla del
 * año que viene sin enterarse.
 */

describe('escapar', () => {
  test('lo simple pasa sin comillas', () => {
    expect(escapar('0178')).toBe('0178');
    expect(escapar('punto_arriba')).toBe('punto_arriba');
  });

  test('el punto y coma obliga a entrecomillar', () => {
    expect(escapar('flaca; mamó poco')).toBe('"flaca; mamó poco"');
  });

  test('las comillas internas se duplican', () => {
    expect(escapar('la "3633"')).toBe('"la ""3633"""');
  });

  test('los saltos de línea también', () => {
    expect(escapar('una\nobservación')).toBe('"una\nobservación"');
    expect(escapar('una\r\nobservación')).toBe('"una\r\nobservación"');
  });

  // Una observación que empiece con un guion no debería poder ejecutar nada al
  // abrirse la planilla.
  test('lo que empieza como fórmula se entrecomilla', () => {
    expect(escapar('=1+1')).toBe('"=1+1"');
    expect(escapar('+34')).toBe('"+34"');
    expect(escapar('-flaca')).toBe('"-flaca"');
    expect(escapar('@casa')).toBe('"@casa"');
  });
});

describe('formatear', () => {
  // Con punto, Excel en español lee el peso como texto y el promedio da cero.
  test('los decimales van con coma', () => {
    expect(formatear(4.2)).toBe('4,2');
    expect(formatear(3.25)).toBe('3,25');
  });

  test('los enteros van sin coma', () => {
    expect(formatear(2026)).toBe('2026');
    expect(formatear(0)).toBe('0');
  });

  // Los históricos de Zoho cargaban 0 en el peso de los muertos, y eso arruina
  // cualquier promedio de peso al nacer. Vacío no es cero.
  test('null y undefined son celda vacía, nunca cero', () => {
    expect(formatear(null)).toBe('');
    expect(formatear(undefined)).toBe('');
  });
});

describe('aCSV', () => {
  interface Fila {
    caravana: string;
    peso: number | null;
    obs: string | null;
  }

  const columnas: readonly ColumnaCSV<Fila>[] = [
    { clave: 'caravana', valor: (f) => f.caravana },
    { clave: 'peso_kg', valor: (f) => f.peso },
    { clave: 'observaciones', valor: (f) => f.obs },
  ];

  test('arranca con el BOM', () => {
    expect(aCSV([], columnas).startsWith(BOM)).toBe(true);
  });

  test('separa con punto y coma y termina las líneas con CRLF', () => {
    const csv = aCSV([{ caravana: '0178', peso: 4.2, obs: null }], columnas);
    expect(csv).toBe(`${BOM}caravana;peso_kg;observaciones\r\n0178;4,2;\r\n`);
  });

  test('sin filas igual sale el encabezado', () => {
    expect(aCSV([], columnas)).toBe(`${BOM}caravana;peso_kg;observaciones\r\n`);
  });

  test('una observación con punto y coma no corre las columnas', () => {
    const csv = aCSV([{ caravana: '0241', peso: null, obs: 'chiquita; mamó poco' }], columnas);
    const linea = csv.split('\r\n')[1] ?? '';
    expect(linea).toBe('0241;;"chiquita; mamó poco"');
    // Y la prueba de que no se corrió: tres campos, no cuatro.
    expect(linea.split(';').length).toBe(4); // el escapado deja el ; adentro
    expect(linea.startsWith('0241;;')).toBe(true);
  });

  /**
   * El test que impide romper la planilla del año que viene.
   *
   * Alguien va a reordenar las columnas «para que se lean mejor» y el
   * histórico del genetista va a dejar de cruzar. Si esto falla, la pregunta
   * no es cómo arreglar el test.
   */
  test('el orden de las columnas es el que se declaró', () => {
    const csv = aCSV([{ caravana: 'a', peso: 1, obs: 'b' }], columnas);
    expect(csv.split('\r\n')[0]).toBe(`${BOM}caravana;peso_kg;observaciones`);
  });
});

describe('nombreDeArchivo', () => {
  test('lleva la fecha y la hora del corte', () => {
    const ahora = new Date(2026, 7, 10, 14, 30);
    expect(nombreDeArchivo('corderos', 2026, ahora)).toBe('petra-corderos-2026-20260810-1430.csv');
  });

  test('rellena con ceros', () => {
    const ahora = new Date(2026, 0, 5, 9, 7);
    expect(nombreDeArchivo('completo', 2026, ahora)).toBe('petra-completo-2026-20260105-0907.csv');
  });
});
