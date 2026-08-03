import { createClient } from '@supabase/supabase-js';
import { entorno } from './entorno';

/**
 * Cliente de Supabase. Se usa para tres cosas y nada más:
 *
 *  1. Autenticación (login y renovación de token).
 *  2. Subir la cola de PowerSync — por acá pasan las escrituras, así que RLS
 *     se aplica a cada una con el JWT del usuario.
 *  3. Las lecturas de la web admin de lo que NO se replica: la tabla `cambios`
 *     y, cuando lleguen, las vistas `v_*` de métricas. Ver `consultas-online.ts`.
 *
 * Las LECTURAS de la app de campo nunca pasan por acá: salen de la réplica
 * SQLite local, que es lo que permite trabajar días sin señal. Y las de la web
 * admin tampoco, salvo esas dos: si esta línea alguna vez justifica leer
 * `partos` o `corderos` por acá, está mal usada — sería crear una segunda
 * fuente del mismo número y romper el trabajo sin señal de una pantalla que
 * hoy funciona.
 *
 * Es un solo cliente a propósito. Un segundo significaría dos almacenamientos
 * de sesión, o uno compartido con carreras sutiles de renovación de token;
 * supabase-js está pensado como singleton.
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
