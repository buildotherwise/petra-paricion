import { useCallback, useEffect, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { mensajeDeLectura } from './rechazos';

/**
 * Lo poco que la web admin lee por internet.
 *
 * Casi todo sale de la réplica local, igual que en el teléfono. Lo que no está
 * ahí es la tabla `cambios`: quedó deliberadamente fuera de la replicación
 * porque llevarla a los cinco aparatos del campo significaría replicar ~10.000
 * filas por temporada que nadie va a leer, y abrirle la lectura a todos — dos
 * cambios al modelo de seguridad por una pantalla de administración.
 *
 * Consecuencia que hay que asumir de frente: **este es el único bloque de la
 * web admin que no funciona sin señal.** Degrada solo, sin arrastrar a la
 * pantalla que lo contiene.
 */

// ---------------------------------------------------------------------------
// El hook
// ---------------------------------------------------------------------------

export interface EstadoConsulta<T> {
  datos: readonly T[];
  cargando: boolean;
  /** Ya traducido. `null` si salió bien. */
  error: string | null;
  recargar: () => void;
}

/**
 * Una consulta al servidor, con su estado.
 *
 * Sin reintento automático: un bucle contra una conexión caída, mientras
 * alguien intenta trabajar, es ruido. Se reintenta cuando la persona toca el
 * botón — que además es la señal de que le importa.
 */
export function useConsultaOnline<T>(
  consultar: () => Promise<{ data: T[] | null; error: PostgrestError | null }>,
  deps: readonly unknown[],
): EstadoConsulta<T> {
  const [datos, setDatos] = useState<readonly T[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  // `consultar` se rearma en cada render del llamador; las deps son las que
  // mandan. Es el mismo trato que useQuery de PowerSync.
  const ejecutar = useCallback(consultar, deps);

  useEffect(() => {
    // Los filtros cambian rápido y una respuesta que llega tarde pisaría el
    // resultado bueno. La bandera es lo que impide ver el historial del cordero
    // anterior en la ficha del que se está mirando.
    let abortado = false;

    setCargando(true);
    setError(null);

    void ejecutar()
      .then(({ data, error: fallo }) => {
        if (abortado) return;
        if (fallo !== null) {
          setError(mensajeDeLectura(fallo.code, navigator.onLine));
          setDatos([]);
        } else {
          setDatos(data ?? []);
        }
      })
      .catch(() => {
        // Un `fetch` que no llega ni a hablar con PostgREST: casi siempre, red.
        if (!abortado) {
          setError(mensajeDeLectura(null, navigator.onLine));
          setDatos([]);
        }
      })
      .finally(() => {
        if (!abortado) setCargando(false);
      });

    return () => {
      abortado = true;
    };
  }, [ejecutar, intento]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);

  return { datos, cargando, error, recargar };
}

// ---------------------------------------------------------------------------
// Las consultas
// ---------------------------------------------------------------------------

/** Una fila de `cambios`, tal como la escribe el trigger `auditar()`. */
export interface Cambio {
  id: number;
  tabla: string;
  registro_id: string;
  tipo: 'creacion' | 'actualizacion';
  /** null en las creaciones: ahí el cambio es la fila entera. */
  campo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  realizado_por: string;
  dispositivo: string | null;
  realizado_en: string;
}

/**
 * Un límite alto pero real. Un UPDATE de ocho columnas deja ocho filas, así que
 * con 1200 corderos señalados son ~10.000 por temporada: sin límite, el feed
 * general bajaría la temporada entera para mostrar veinte líneas.
 */
const TOPE = 200;

const COLUMNAS =
  'id, tabla, registro_id, tipo, campo, valor_anterior, valor_nuevo, realizado_por, dispositivo, realizado_en';

/**
 * El historial de un registro.
 *
 * Los nombres NO se resuelven acá: `realizado_por` es un uuid y `perfiles` ya
 * está en la réplica, así que el nombre se busca localmente. Eso deja la
 * consulta sin joins y —lo que importa— funcionando incluso para una cuenta
 * cuyo perfil no se pueda leer.
 */
export function historialDeRegistro(tabla: string, registroId: string) {
  return async () => {
    // El builder de supabase-js es «thenable» pero no una Promise: sin el await
    // el tipo que sale no tiene .catch y el hook no podría atrapar una caída de
    // red, que es justamente el caso que más importa acá.
    const { data, error } = await supabase
      .from('cambios')
      .select(COLUMNAS)
      .eq('tabla', tabla)
      .eq('registro_id', registroId)
      .order('realizado_en', { ascending: false })
      .limit(TOPE);
    return { data: data as Cambio[] | null, error };
  };
}

/** Lo último que se tocó en cualquier lado. Contesta «¿qué pasó hoy?». */
export function edicionesRecientes(limite = 60) {
  return async () => {
    const { data, error } = await supabase
      .from('cambios')
      .select(COLUMNAS)
      .order('realizado_en', { ascending: false })
      .limit(Math.min(limite, TOPE));
    return { data: data as Cambio[] | null, error };
  };
}
