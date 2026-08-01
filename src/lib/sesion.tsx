import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { conectarSync, db } from './powersync/db';

interface EstadoSesion {
  sesion: Session | null;
  cargando: boolean;
  salir: () => Promise<void>;
}

const ContextoSesion = createContext<EstadoSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargando(false);
    });

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
    });

    return () => suscripcion.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sesion === null) return;
    // connect() es idempotente y reintenta solo si no hay señal, así que no
    // hace falta esperar a estar online para llamarlo.
    void conectarSync();
  }, [sesion]);

  const salir = async () => {
    // disconnectAndClear borra la réplica local. Es correcto al cerrar sesión
    // (el próximo usuario no debería ver los datos del anterior), pero se
    // bloquea si hay cambios sin subir: eso sería pérdida de datos.
    const pendientes = await db.getUploadQueueStats();
    if (pendientes.count > 0) {
      throw new Error(
        `Hay ${pendientes.count} cambios sin sincronizar. Conectate a internet antes de cerrar sesión.`,
      );
    }
    await db.disconnectAndClear();
    await supabase.auth.signOut();
  };

  return (
    <ContextoSesion.Provider value={{ sesion, cargando, salir }}>{children}</ContextoSesion.Provider>
  );
}

export function useSesion(): EstadoSesion {
  const contexto = useContext(ContextoSesion);
  if (contexto === null) {
    throw new Error('useSesion tiene que usarse dentro de <ProveedorSesion>');
  }
  return contexto;
}

/** Id del usuario autenticado. Lanza si no hay sesión — nunca debería pasar. */
export function useUsuarioId(): string {
  const { sesion } = useSesion();
  const id = sesion?.user.id;
  if (id === undefined) throw new Error('No hay sesión activa');
  return id;
}
