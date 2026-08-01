import { createClient } from '@supabase/supabase-js';
import { entorno } from './entorno';

/**
 * Cliente de Supabase. Se usa para dos cosas y nada más:
 *
 *  1. Autenticación (login y renovación de token).
 *  2. Subir la cola de PowerSync — por acá pasan las escrituras, así que RLS
 *     se aplica a cada una con el JWT del usuario.
 *
 * Las LECTURAS de la app de campo nunca pasan por acá: salen de la réplica
 * SQLite local, que es lo que permite trabajar días sin señal.
 */
export const supabase = createClient(entorno.supabaseUrl, entorno.supabaseAnonKey, {
  auth: {
    persistSession: true,
    // En el campo la app nunca puede pedir login. El token se renueva solo al
    // recuperar señal; el único requisito es haber iniciado sesión una vez.
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
  },
});
