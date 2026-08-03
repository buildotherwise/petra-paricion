import { useQuery, useStatus } from '@powersync/react';
import { useSesion } from './sesion';
import type { Perfil } from './powersync/esquema';

/**
 * Quién es el que está usando la app, según la tabla `perfiles`.
 *
 * Va aparte de `sesion.tsx` a propósito: la sesión es autenticación y viene de
 * Supabase; el perfil es un dato de la réplica y viene de PowerSync. Meterlos
 * juntos ataría el proveedor de sesión al contexto de PowerSync sin necesidad.
 *
 * **Esto no es control de acceso.** Un operador ya ve todos los partos y
 * corderos en el teléfono, y ninguna política de RLS lo impide: `partos_lectura`
 * es `using (perfil_activo())`, sin más. Lo único que el servidor protege de
 * verdad es `cambios` —solo `es_admin()`— y `perfiles`. Lo de acá separa
 * superficies, no permisos: sirve para no ponerle la administración en la
 * pantalla a quien está registrando partos, no para impedir que la abra.
 */

export type EstadoPerfil =
  /** La réplica todavía no bajó. No se sabe nada, y no se decide nada. */
  | { estado: 'cargando' }
  /** Sesión válida, réplica bajada, y ninguna fila activa en `perfiles`. */
  | { estado: 'sin-perfil' }
  | { estado: 'listo'; perfil: Perfil };

export function usePerfil(): EstadoPerfil {
  const { sesion } = useSesion();
  const sincronizacion = useStatus();
  const usuarioId = sesion?.user.id ?? null;

  const { data } = useQuery<Perfil>(
    'SELECT id, nombre, rol, activo FROM perfiles WHERE id = ?',
    [usuarioId],
  );

  const perfil = data[0];
  if (perfil !== undefined && perfil.activo === 1) {
    return { estado: 'listo', perfil };
  }

  // El discriminador entre «todavía no sé» y «no hay»: el mismo dato que la
  // pastilla de sincronización ya usa para decir «Sin datos aún». Sin él, los
  // primeros segundos de cada arranque en frío se verían como un operador.
  if (!sincronizacion.hasSynced) return { estado: 'cargando' };

  return { estado: 'sin-perfil' };
}

/**
 * ¿Es administrador? `undefined` mientras no se sepa.
 *
 * Los tres estados importan. Si «todavía no sé» se resolviera como `false`, el
 * enlace a la administración aparecería 300 ms tarde en cada arranque — y un
 * enlace que aparece y desaparece es un reporte de bug, no una demora. Mientras
 * esto devuelva `undefined` no se dibuja ni el enlace, ni la web admin, ni la
 * pantalla que la niega.
 */
export function useEsAdmin(): boolean | undefined {
  const perfil = usePerfil();
  if (perfil.estado === 'cargando') return undefined;
  return perfil.estado === 'listo' && perfil.perfil.rol === 'admin';
}
