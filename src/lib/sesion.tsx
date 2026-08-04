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
    // hace falta esperar a estar online para llamarlo. Si la base local no
    // abrió, App ya lo muestra; acá solo se deja rastro de lo demás.
    conectarSync().catch((error: unknown) => {
      console.error('[sync] no se pudo conectar', error);
    });
  }, [sesion]);

  const salir = async () => {
    // disconnectAndClear borra la réplica local ENTERA, incluidas las tablas
    // que solo viven en el aparato. Por eso la doble guarda: con pendientes
    // sería pérdida directa, y con rechazos también — `subidas_rechazadas` es
    // la última copia de esos datos, y salir se los llevaría sin pasar por la
    // confirmación de la bandeja.
    const pendientes = await db.getUploadQueueStats();
    if (pendientes.count > 0) {
      throw new Error(
        `Hay ${pendientes.count} cambios sin sincronizar. Conectate a internet antes de cerrar sesión.`,
      );
    }
    const rechazadas = await db.get<{ n: number }>(
      'SELECT count(*) AS n FROM subidas_rechazadas',
    );
    if (rechazadas.n > 0) {
      throw new Error(
        'Hay cargas con error guardadas en este aparato: son la última copia de esos datos. Resolvelas desde la pastilla roja antes de cerrar sesión.',
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
