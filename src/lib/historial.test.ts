import { describe, expect, test } from 'vitest';
import { leerPila, pilaDesdeUrl, urlDe } from './historial';

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

describe('urlDe: solo tiene URL lo que un F5 puede restaurar', () => {
  test('el campo entero vive en la raíz', () => {
    expect(urlDe([{ nombre: 'inicio' }])).toBe('/');
    expect(urlDe([{ nombre: 'inicio' }, { nombre: 'registrar-parto' }])).toBe('/');
    expect(urlDe([{ nombre: 'inicio' }, { nombre: 'senalada' }])).toBe('/');
  });

  test('cada sección de la administración tiene la suya', () => {
    expect(urlDe([{ nombre: 'admin', seccion: 'partos' }])).toBe('/admin/partos');
    expect(urlDe([{ nombre: 'admin', seccion: 'revision' }])).toBe('/admin/revision');
  });

  // Es la misma pantalla en los dos lados. Lo que cambia es dónde se está
  // trabajando: en la pestaña conviene poder recargar sin perder el lugar, en
  // el teléfono no hay barra de direcciones que mirar.
  test('una ficha tiene URL adentro de la administración y no afuera', () => {
    const ficha = { nombre: 'ficha-parto', partoId: 'p1' } as const;
    expect(urlDe([{ nombre: 'inicio' }, { nombre: 'partos' }, ficha])).toBe('/');
    expect(urlDe([{ nombre: 'admin', seccion: 'partos' }, ficha])).toBe('/admin/parto/p1');
  });

  test('la ficha del cordero también', () => {
    const ficha = { nombre: 'ficha-cordero', corderoId: 'c9' } as const;
    expect(urlDe([{ nombre: 'admin', seccion: 'corderos' }, ficha])).toBe('/admin/cordero/c9');
  });

  // Los rechazados se abren desde la pastilla roja del encabezado, que existe
  // en los dos lados. No tienen URL propia: se entra por un aviso, no por una
  // dirección.
  test('una pantalla sin URL propia adentro de la administración cae en la tabla', () => {
    expect(urlDe([{ nombre: 'admin', seccion: 'partos' }, { nombre: 'rechazados' }])).toBe(
      '/admin/partos',
    );
  });

  test('una pila vacía no rompe', () => {
    expect(urlDe([])).toBe('/');
  });
});

describe('pilaDesdeUrl: con qué arranca la app según lo que se tipeó', () => {
  test('la raíz y el campo no se parsean', () => {
    expect(pilaDesdeUrl('/')).toBeNull();
    expect(pilaDesdeUrl('')).toBeNull();
    expect(pilaDesdeUrl('/otra-cosa')).toBeNull();
  });

  test('cada sección', () => {
    expect(pilaDesdeUrl('/admin/partos')).toEqual([{ nombre: 'admin', seccion: 'partos' }]);
    expect(pilaDesdeUrl('/admin/corderos')).toEqual([{ nombre: 'admin', seccion: 'corderos' }]);
    expect(pilaDesdeUrl('/admin/revision')).toEqual([{ nombre: 'admin', seccion: 'revision' }]);
    expect(pilaDesdeUrl('/admin/tableros')).toEqual([{ nombre: 'admin', seccion: 'tableros' }]);
    expect(pilaDesdeUrl('/admin/exportar')).toEqual([{ nombre: 'admin', seccion: 'exportar' }]);
  });

  test('/admin pelado abre partos', () => {
    expect(pilaDesdeUrl('/admin')).toEqual([{ nombre: 'admin', seccion: 'partos' }]);
    expect(pilaDesdeUrl('/admin/')).toEqual([{ nombre: 'admin', seccion: 'partos' }]);
  });

  // Nada de 404 propios: una sección inventada cae en la primera y
  // `sembrarHistorial` reescribe la barra de direcciones a la URL canónica.
  test('una sección que no existe cae en partos', () => {
    expect(pilaDesdeUrl('/admin/reportes')).toEqual([{ nombre: 'admin', seccion: 'partos' }]);
    expect(pilaDesdeUrl('/admin/../etc')).toEqual([{ nombre: 'admin', seccion: 'partos' }]);
  });

  // Un enlace pegado a una ficha no puede restaurarse: la pila completa vive en
  // history.state, que una recarga conserva y un pegado no. Se aterriza en la
  // tabla, que es de donde se saca la ficha.
  test('un enlace pegado a una ficha aterriza en la tabla', () => {
    expect(pilaDesdeUrl('/admin/parto/abc')).toEqual([{ nombre: 'admin', seccion: 'partos' }]);
    expect(pilaDesdeUrl('/admin/cordero/abc')).toEqual([{ nombre: 'admin', seccion: 'partos' }]);
  });

  // «/administracion» no es «/admin»: sin el corte, el prefijo se comería
  // cualquier ruta futura que empiece igual.
  test('una ruta que solo empieza parecido no es administración', () => {
    expect(pilaDesdeUrl('/administracion')).toBeNull();
    expect(pilaDesdeUrl('/adminis/partos')).toBeNull();
  });
});
