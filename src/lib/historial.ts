import type { Pantalla } from './navegacion';

/**
 * El botón atrás del navegador, mapeado sobre la pila de `navegacion.tsx`.
 *
 * Hasta ahora no hacía falta: la app de campo se usa instalada, sin barra de
 * direcciones. Pero el botón atrás existe igual en dos lugares donde duele —la
 * web admin corre en una pestaña y la gente lo aprieta sin pensarlo, y en la
 * tablet Android el botón atrás del sistema hace lo mismo en medio de un
 * registro de parto—. Sin esto, en los dos casos se sale de la aplicación.
 *
 * No hay router, y esto no lo es: no traduce URLs a pantallas. La pila entera
 * viaja en `history.state`, así que cada entrada del navegador sabe qué
 * pantallas había apiladas cuando se creó y restaurar es copiar, no recalcular.
 *
 * La regla que hace que las dos pilas no se corran: **`volver()` no toca el
 * estado de React**. Pide `history.back()` y se queda quieto; el `setPila` lo
 * hace el manejador de `popstate` cuando el navegador confirma el movimiento.
 * Si `volver()` también hiciera el pop por su cuenta, cada «Volver» adelantaría
 * la pila de React una entrada respecto de la del navegador, y a los tres pasos
 * el botón atrás llevaría a cualquier lado.
 *
 * Las pantallas no tienen URL propia todavía; todas viven en `/`. Eso alcanza
 * para el botón atrás, que es lo que resuelve este archivo. Las URLs de la web
 * admin llegan con la pantalla de administración.
 */

interface Estado {
  pila: Pantalla[];
}

/**
 * Lee la pila de un `history.state` que puede no ser nuestro.
 *
 * `popstate` también dispara con entradas que esta app no creó —una recarga
 * vieja, una extensión, un `#hash` de algo— y ahí `state` es `null` o cualquier
 * cosa. Devolver `null` deja que el llamador caiga al inicio, en vez de
 * renderizar el `nombre` de un `undefined` y dejar la pantalla en blanco con el
 * cordero en la mano.
 */
export function leerPila(estado: unknown): Pantalla[] | null {
  if (typeof estado !== 'object' || estado === null) return null;

  const pila = (estado as Partial<Estado>).pila;
  if (!Array.isArray(pila) || pila.length === 0) return null;

  // Una pila vacía tampoco sirve: no habría nada que renderizar. Se trata como
  // ajena y el llamador vuelve al inicio.
  const todasSonPantallas = pila.every(
    (p: unknown) =>
      typeof p === 'object' && p !== null && typeof (p as { nombre?: unknown }).nombre === 'string',
  );

  return todasSonPantallas ? (pila as Pantalla[]) : null;
}

/**
 * La pila guardada en la entrada actual, si es nuestra.
 *
 * Los navegadores conservan `history.state` a través de una recarga, así que
 * esto es lo que permite que F5 sobre una ficha vuelva a la ficha en vez de
 * tirar al inicio. Sin esto, recargar dejaría la entrada actual diciendo
 * «inicio» mientras la anterior sigue diciendo «inicio, partos» — y el botón
 * atrás llevaría hacia adentro.
 */
export function leerPilaDelHistorial(): Pantalla[] | null {
  return leerPila(window.history.state);
}

/** Deja la pila en la entrada actual, sin crear una nueva. */
export function sembrarHistorial(pila: Pantalla[]): void {
  window.history.replaceState({ pila } satisfies Estado, '');
}

export function apilarEnHistorial(pila: Pantalla[]): void {
  window.history.pushState({ pila } satisfies Estado, '');
}

export function reemplazarEnHistorial(pila: Pantalla[]): void {
  window.history.replaceState({ pila } satisfies Estado, '');
}

export function retrocederEnHistorial(): void {
  window.history.back();
}

/**
 * Rebobina hasta la entrada del inicio. Devuelve false si no había a dónde ir.
 *
 * El `if` no es defensivo por gusto: **`history.go(0)` recarga la página**. Con
 * la pila ya en el inicio, llamarlo sin mirar tiraría abajo la réplica en
 * memoria justo después de guardar un parto.
 */
export function rebobinarAlInicio(largo: number): boolean {
  const saltos = largo - 1;
  if (saltos <= 0) return false;
  window.history.go(-saltos);
  return true;
}

/** Se suscribe al botón atrás. Devuelve la función para desuscribirse. */
export function escucharHistorial(alRestaurar: (pila: Pantalla[] | null) => void): () => void {
  const manejar = (evento: PopStateEvent) => alRestaurar(leerPila(evento.state));
  window.addEventListener('popstate', manejar);
  return () => window.removeEventListener('popstate', manejar);
}
