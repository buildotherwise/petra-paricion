import { describe, expect, test } from 'vitest';
import { antiguedad, diasDesde, nombreDeCordero, nombreMarca, nombreTipo } from './parto';

/**
 * Cómo se nombran las cosas en pantalla.
 *
 * `nombreDeCordero` existe por un error que estuvo a la vista: el feed de
 * últimas ediciones decía «Cordero 0001» usando la caravana de la MADRE, así
 * que parecía un identificador del cordero y no lo era — y en un parto de
 * trillizos los tres hermanos se llamaban igual.
 */

describe('nombreDeCordero', () => {
  const base = {
    tatuaje: null,
    caravanaMadre: '0001',
    collar_marca: null,
    hermanos: 1,
  } as const;

  // Una vez señalado, el tatuaje es el nombre del animal. La madre pasa a ser
  // dónde está, que es la misma decisión que toma la ficha con la chapa grande.
  test('señalado: el tatuaje adelante y la madre como madre', () => {
    expect(nombreDeCordero({ ...base, tatuaje: '004' })).toBe('Cordero 004 · madre 0001');
  });

  test('el tatuaje gana aunque el parto sea múltiple', () => {
    expect(
      nombreDeCordero({ ...base, tatuaje: '004', hermanos: 3, collar_marca: 'punto_arriba' }),
    ).toBe('Cordero 004 · madre 0001');
  });

  // El caso que motivó todo: sin la marca, los tres trillizos son la misma
  // línea y no hay forma de saber cuál se editó.
  test('sin señalar en un múltiple: la marca es lo que lo distingue', () => {
    expect(nombreDeCordero({ ...base, hermanos: 3, collar_marca: 'punto_arriba' })).toBe(
      'Cordero de 0001 · punto arriba',
    );
    expect(nombreDeCordero({ ...base, hermanos: 2, collar_marca: 'cruz_al_medio' })).toBe(
      'Cordero de 0001 · cruz al medio',
    );
  });

  test('sin señalar en un único: la madre alcanza', () => {
    expect(nombreDeCordero(base)).toBe('Cordero de 0001');
  });

  // Un múltiple sin marca no debería existir (R2 la exige antes de confirmar),
  // pero si llega uno el nombre no puede romperse.
  test('un múltiple sin marca no rompe', () => {
    expect(nombreDeCordero({ ...base, hermanos: 2 })).toBe('Cordero de 0001');
  });

  test('un tatuaje vacío se trata como sin tatuaje', () => {
    expect(nombreDeCordero({ ...base, tatuaje: '' })).toBe('Cordero de 0001');
  });

  test('las caravanas alfanuméricas pasan tal cual', () => {
    expect(nombreDeCordero({ ...base, caravanaMadre: 'T. 319 V' })).toBe('Cordero de T. 319 V');
  });

  // Nunca «Cordero 0001»: eso decía que el cordero se llamaba como la chapa que
  // cuelga de la oreja de la madre.
  test('la caravana nunca queda pegada a «Cordero» sin preposición', () => {
    for (const caso of [
      base,
      { ...base, hermanos: 2, collar_marca: 'punto_abajo' as const },
      { ...base, tatuaje: '007' },
    ]) {
      expect(nombreDeCordero(caso)).not.toMatch(/^Cordero 0001/);
    }
  });
});

describe('nombreMarca', () => {
  test('las tres marcas', () => {
    expect(nombreMarca('punto_arriba')).toBe('Punto arriba');
    expect(nombreMarca('cruz_al_medio')).toBe('Cruz al medio');
    expect(nombreMarca('punto_abajo')).toBe('Punto abajo');
  });
});

describe('nombreTipo', () => {
  test('los conocidos y el que no', () => {
    expect(nombreTipo(0)).toBe('Sin corderos');
    expect(nombreTipo(1)).toBe('Único');
    expect(nombreTipo(2)).toBe('Mellizos');
    expect(nombreTipo(3)).toBe('Trillizos');
    expect(nombreTipo(4)).toBe('4 corderos');
  });
});

describe('diasDesde y antiguedad', () => {
  test('cuenta días corridos', () => {
    expect(diasDesde('2026-08-01', '2026-08-20')).toBe(19);
    expect(diasDesde('2026-08-20', '2026-08-20')).toBe(0);
  });

  test('el texto se lee como se dice', () => {
    expect(antiguedad('2026-08-20', '2026-08-20')).toBe('hoy');
    expect(antiguedad('2026-08-19', '2026-08-20')).toBe('1 día');
    expect(antiguedad('2026-08-01', '2026-08-20')).toBe('19 días');
  });

  // Un parto cargado con fecha de mañana no debería existir, pero si aparece
  // «hoy» es mejor que «-1 días».
  test('una fecha futura no dice un número negativo', () => {
    expect(antiguedad('2026-08-21', '2026-08-20')).toBe('hoy');
  });
});
