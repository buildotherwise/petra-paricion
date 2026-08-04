import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  apilarEnHistorial,
  escucharHistorial,
  leerPilaDelHistorial,
  pilaDesdeUrl,
  rebobinarAlInicio,
  reemplazarEnHistorial,
  retrocederEnHistorial,
  sembrarHistorial,
} from './historial';

/**
 * A dónde está mirando la app.
 *
 * Es una pila, no un estado suelto: desde la ficha de un cordero «Volver» tiene
 * que llevar a su parto, y desde el parto al lugar por el que se entró — que
 * puede ser el inicio, el buscador o la lista de partos registrados. Sin pila,
 * cada pantalla tendría que saber quién la llamó.
 *
 * Va por contexto porque el encabezado está en todas las pantallas y su pastilla
 * roja tiene que poder abrir los rechazados desde cualquiera. Pasarlo como prop
 * obligaría a que seis pantallas reciban y reenvíen algo que no usan.
 *
 * Sigue sin haber router: ninguna pantalla necesita URL propia y la app se usa
 * instalada. Lo que sí hay es el botón atrás del navegador, que sin ayuda se
 * sale de la aplicación entera — ver `historial.ts`, que espeja esta pila en
 * `history.state` sin que ninguna pantalla se entere.
 */

/** Las secciones de la web admin. Son también su URL. */
export type SeccionAdmin = 'partos' | 'corderos' | 'revision' | 'tableros' | 'exportar';

export type Pantalla =
  | { nombre: 'inicio' }
  | { nombre: 'registrar-parto' }
  | { nombre: 'partos' }
  | { nombre: 'ficha-parto'; partoId: string }
  | { nombre: 'ficha-cordero'; corderoId: string }
  | { nombre: 'senalada' }
  | { nombre: 'senalar-parto'; partoId: string }
  | { nombre: 'senalar-cordero'; corderoId: string }
  | { nombre: 'rechazados' }
  | { nombre: 'tablero' }
  | { nombre: 'admin'; seccion: SeccionAdmin };

const INICIO: Pantalla = { nombre: 'inicio' };

interface Navegacion {
  pantalla: Pantalla;
  ir: (destino: Pantalla) => void;
  volver: () => void;
  /**
   * Cambia la pantalla actual sin apilar otra.
   *
   * Es lo que hace que encadenar mellizos en la señalada no deje una pila de
   * corderos ya señalados detrás: al terminar el segundo, «volver» tiene que
   * llevar al parto, no al primero.
   */
  reemplazar: (destino: Pantalla) => void;
  /** Vuelve al inicio y descarta la pila: se usa al terminar de cargar algo. */
  alInicio: () => void;
  /**
   * Si se está mirando desde la administración.
   *
   * Las fichas son las mismas en los dos lados —esa es la decisión de §05— pero
   * hay cosas que solo corresponden en la web: el historial de cambios, que
   * CLAUDE.md §7 saca explícitamente del teléfono. Es el mismo predicado que
   * usa `urlDe` para decidir si una ficha tiene URL propia.
   */
  enAdmin: boolean;
}

const Contexto = createContext<Navegacion | null>(null);

export function ProveedorNavegacion({ children }: { children: ReactNode }) {
  const [pila, setPila] = useState<Pantalla[]>([INICIO]);

  /**
   * La pila autoritativa. El estado es solo para renderizar.
   *
   * Hace falta por dos razones. Una: escribir en `window.history` adentro del
   * updater de `setPila` lo ejecutaría dos veces en desarrollo, por StrictMode,
   * y dejaría entradas duplicadas. Dos: dos `ir()` en el mismo tick leerían la
   * misma pila vieja, porque `pila` no se actualiza hasta el próximo render.
   */
  const pilaRef = useRef<Pantalla[]>(pila);

  const aplicar = useCallback((nueva: Pantalla[]) => {
    pilaRef.current = nueva;
    setPila(nueva);
  }, []);

  useEffect(() => {
    // Tres formas de arrancar, en orden de precedencia.
    //
    // 1. Hay una pila nuestra en la entrada actual: es una recarga sobre una
    //    pantalla profunda, y se restaura. Los navegadores conservan
    //    `history.state` a través de un F5. Es seguro incluso con un id que ya
    //    no está: las dos fichas muestran «no encontrado», que es una pantalla
    //    prevista.
    // 2. La dirección dice /admin: alguien la tipeó o la tiene en favoritos.
    // 3. Cualquier otra cosa: el inicio, sembrado en la entrada actual sin
    //    crear una nueva.
    const guardada = leerPilaDelHistorial();
    if (guardada !== null) {
      sembrarHistorial(guardada);
      aplicar(guardada);
    } else {
      const deLaUrl = pilaDesdeUrl(window.location.pathname);
      const inicial = deLaUrl ?? pilaRef.current;
      sembrarHistorial(inicial);
      aplicar(inicial);
    }

    return escucharHistorial((restaurada) => aplicar(restaurada ?? [INICIO]));
  }, [aplicar]);

  const ir = useCallback(
    (destino: Pantalla) => {
      const nueva = [...pilaRef.current, destino];
      apilarEnHistorial(nueva);
      aplicar(nueva);
    },
    [aplicar],
  );

  /**
   * Volver nunca vacía la pila: del inicio no se sale.
   *
   * No toca el estado a propósito — pide `history.back()` y espera a que
   * `popstate` confirme. Ver el comentario largo en `historial.ts`: hacer las
   * dos cosas correría una pila respecto de la otra.
   */
  const volver = useCallback(() => {
    if (pilaRef.current.length > 1) {
      retrocederEnHistorial();
      return;
    }
    const nueva: Pantalla[] = [INICIO];
    reemplazarEnHistorial(nueva);
    aplicar(nueva);
  }, [aplicar]);

  const reemplazar = useCallback(
    (destino: Pantalla) => {
      const nueva = [...pilaRef.current.slice(0, -1), destino];
      reemplazarEnHistorial(nueva);
      aplicar(nueva);
    },
    [aplicar],
  );

  const alInicio = useCallback(() => {
    // Rebobinar el historial en vez de apilar el inicio: si se apilara, «atrás»
    // ofrecería volver al formulario del parto recién guardado.
    if (!rebobinarAlInicio(pilaRef.current.length)) {
      const nueva: Pantalla[] = [INICIO];
      reemplazarEnHistorial(nueva);
      aplicar(nueva);
    }
  }, [aplicar]);

  const valor = useMemo(
    () => ({
      pantalla: pila[pila.length - 1] ?? INICIO,
      enAdmin: pila.some((p) => p.nombre === 'admin'),
      ir,
      volver,
      reemplazar,
      alInicio,
    }),
    [pila, ir, volver, reemplazar, alInicio],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useNavegacion(): Navegacion {
  const contexto = useContext(Contexto);
  if (contexto === null) {
    throw new Error('useNavegacion tiene que usarse dentro de <ProveedorNavegacion>');
  }
  return contexto;
}
