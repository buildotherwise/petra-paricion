import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

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
 * No hay router: son seis pantallas y ninguna necesita URL propia. La app se usa
 * instalada, sin barra de direcciones.
 */

export type Pantalla =
  | { nombre: 'inicio' }
  | { nombre: 'registrar-parto' }
  | { nombre: 'partos' }
  | { nombre: 'ficha-parto'; partoId: string }
  | { nombre: 'ficha-cordero'; corderoId: string }
  | { nombre: 'rechazados' };

const INICIO: Pantalla = { nombre: 'inicio' };

interface Navegacion {
  pantalla: Pantalla;
  ir: (destino: Pantalla) => void;
  volver: () => void;
  /** Vuelve al inicio y descarta la pila: se usa al terminar de cargar algo. */
  alInicio: () => void;
}

const Contexto = createContext<Navegacion | null>(null);

export function ProveedorNavegacion({ children }: { children: ReactNode }) {
  const [pila, setPila] = useState<Pantalla[]>([INICIO]);

  const ir = useCallback((destino: Pantalla) => {
    setPila((previa) => [...previa, destino]);
  }, []);

  // Volver nunca vacía la pila: del inicio no se sale.
  const volver = useCallback(() => {
    setPila((previa) => (previa.length <= 1 ? [INICIO] : previa.slice(0, -1)));
  }, []);

  const alInicio = useCallback(() => setPila([INICIO]), []);

  const valor = useMemo(
    () => ({ pantalla: pila[pila.length - 1] ?? INICIO, ir, volver, alInicio }),
    [pila, ir, volver, alInicio],
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
