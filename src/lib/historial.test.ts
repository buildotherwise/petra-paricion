import { describe, expect, test } from 'vitest';
import { leerPila } from './historial';

/**
 * Lo único que vale testear de este archivo es `leerPila`: el resto son cuatro
 * llamadas a `window.history` que no tienen lógica, y el acople entre las dos
 * pilas se verifica en un navegador real apretando el botón atrás.
 *
 * `leerPila` sí tiene un modo de falla propio, y silencioso: si acepta un
 * estado ajeno, la app renderiza `undefined.nombre` y la pantalla queda en
 * blanco — con el cordero en la mano y sin nada que tocar.
 */

describe('leerPila reconoce lo que es nuestro', () => {
  test('una pila con pantallas se devuelve tal cual', () => {
    const pila = [{ nombre: 'inicio' }, { nombre: 'ficha-parto', partoId: 'abc' }];
    expect(leerPila({ pila })).toEqual(pila);
  });

  test('una sola pantalla también es una pila válida', () => {
    expect(leerPila({ pila: [{ nombre: 'inicio' }] })).toEqual([{ nombre: 'inicio' }]);
  });
});

describe('leerPila descarta lo ajeno sin romperse', () => {
  // El caso más común de todos: la entrada del historial anterior a que la app
  // sembrara la suya, o una que creó otra cosa.
  test('null y undefined', () => {
    expect(leerPila(null)).toBeNull();
    expect(leerPila(undefined)).toBeNull();
  });

  test('un estado sin pila', () => {
    expect(leerPila({})).toBeNull();
    expect(leerPila({ otraCosa: 1 })).toBeNull();
  });

  test('una pila que no es un arreglo', () => {
    expect(leerPila({ pila: 'inicio' })).toBeNull();
    expect(leerPila({ pila: 42 })).toBeNull();
    expect(leerPila({ pila: { nombre: 'inicio' } })).toBeNull();
  });

  // Una pila vacía no rompería, pero no hay nada que renderizar: se trata como
  // ajena para que el llamador caiga al inicio.
  test('una pila vacía', () => {
    expect(leerPila({ pila: [] })).toBeNull();
  });

  test('una pila con algo que no es una pantalla', () => {
    expect(leerPila({ pila: [{ nombre: 'inicio' }, null] })).toBeNull();
    expect(leerPila({ pila: [{ nombre: 'inicio' }, 'ficha-parto'] })).toBeNull();
    expect(leerPila({ pila: [{ sin: 'nombre' }] })).toBeNull();
    expect(leerPila({ pila: [{ nombre: 7 }] })).toBeNull();
  });

  test('tipos primitivos sueltos', () => {
    expect(leerPila('inicio')).toBeNull();
    expect(leerPila(0)).toBeNull();
    expect(leerPila(false)).toBeNull();
  });
});
