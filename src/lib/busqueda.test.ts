import { describe, expect, test } from 'vitest';
import { buscarCaravana, partirCoincidencia } from './busqueda';

/** Muestra tomada del archivo real de la temporada 2026. */
const OVEJAS = [
  { caravana: '0001' },
  { caravana: '0013' },
  { caravana: '0131' },
  { caravana: '0178' },
  { caravana: '1300' },
  { caravana: '1742' },
  { caravana: '2373' },
  { caravana: 'PI 136' },
  { caravana: 'PI 1164' },
  { caravana: 'T. 096 V (2096)' },
  { caravana: 'T. 319 V' },
];

const caravanas = (consulta: string) => buscarCaravana(OVEJAS, consulta).map((o) => o.caravana);

describe('buscador de caravanas', () => {
  test('sin consulta no devuelve nada', () => {
    expect(buscarCaravana(OVEJAS, '')).toEqual([]);
    expect(buscarCaravana(OVEJAS, '   ')).toEqual([]);
  });

  test('encuentra por prefijo exacto', () => {
    expect(caravanas('0178')).toEqual(['0178']);
  });

  test('el teclado numérico alcanza para llegar a las alfanuméricas', () => {
    // Las 20 caravanas tipo 'PI 136' no tienen forma de tipearse con teclado
    // numérico. Buscando sus dígitos, aparecen.
    expect(caravanas('136')).toContain('PI 136');
  });

  test('escribir 13 muestra tanto las numéricas como PI 136', () => {
    const resultado = caravanas('13');
    expect(resultado).toContain('PI 136');
    expect(resultado).toContain('1300');
    expect(resultado).toContain('0013');
    expect(resultado).toContain('0131');
  });

  test('lo que empieza con lo tipeado va primero', () => {
    // '1300' empieza con 13; '0013' solo lo contiene. El que empieza es el que
    // el operador probablemente busca.
    const resultado = caravanas('13');
    expect(resultado.indexOf('1300')).toBeLessThan(resultado.indexOf('0013'));
  });

  test('los ceros a la izquierda no estorban', () => {
    // Escribir '178' tiene que encontrar '0178' sin obligar a tipear el cero.
    expect(caravanas('178')).toContain('0178');
  });

  test('encuentra dentro de una caravana con puntos y paréntesis', () => {
    expect(caravanas('096')).toContain('T. 096 V (2096)');
    expect(caravanas('319')).toContain('T. 319 V');
  });

  test('una consulta que no está no devuelve nada', () => {
    expect(caravanas('9999')).toEqual([]);
  });

  test('acepta letras si el operador las escribe', () => {
    expect(caravanas('PI')).toEqual(expect.arrayContaining(['PI 136', 'PI 1164']));
  });

  test('ignora espacios y puntos de la consulta', () => {
    expect(caravanas('pi 136')).toContain('PI 136');
    expect(caravanas('t319')).toContain('T. 319 V');
  });

  test('entre dos que empiezan igual, primero la más corta', () => {
    // '136' vs '1164' con la consulta '1': la más corta se lee más rápido y
    // suele ser la buscada.
    const resultado = caravanas('11');
    expect(resultado[0]).toBe('PI 1164');
  });

  test('no devuelve duplicados aunque coincida por varias vías', () => {
    const resultado = caravanas('0');
    expect(new Set(resultado).size).toBe(resultado.length);
  });
});

describe('resaltado de la coincidencia', () => {
  test('marca el prefijo tipeado', () => {
    expect(partirCoincidencia('0178', '01')).toEqual(['', '01', '78']);
  });

  test('marca los dígitos dentro de una caravana alfanumérica', () => {
    // Sin esto, buscar '13' devuelve 'PI 136' y el operador no entiende por
    // qué apareció.
    expect(partirCoincidencia('PI 136', '13')).toEqual(['PI ', '13', '6']);
  });

  test('marca en el medio, salteando puntos y espacios', () => {
    expect(partirCoincidencia('T. 319 V', '319')).toEqual(['T. ', '319', ' V']);
  });

  test('sin consulta no marca nada', () => {
    expect(partirCoincidencia('0178', '')).toEqual(['0178', '', '']);
  });

  test('si no coincide, devuelve la caravana entera sin marcar', () => {
    expect(partirCoincidencia('0178', '99')).toEqual(['0178', '', '']);
  });
});
