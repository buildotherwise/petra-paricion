/**
 * Configuración de entorno, validada al arrancar.
 *
 * Falla ruidosamente y temprano: una variable faltante en producción se
 * manifestaría como un sync que nunca conecta, sin error visible. En el campo
 * eso se descubre tarde y mal.
 */

function requerida(nombre: string, valor: string | undefined): string {
  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copiá .env.example a .env.local y completala.`,
    );
  }
  return valor;
}

export const entorno = {
  supabaseUrl: requerida('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: requerida('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  powersyncUrl: requerida('VITE_POWERSYNC_URL', import.meta.env.VITE_POWERSYNC_URL),
  temporada: Number(requerida('VITE_TEMPORADA', import.meta.env.VITE_TEMPORADA)),
} as const;

if (!Number.isInteger(entorno.temporada)) {
  throw new Error('VITE_TEMPORADA debe ser un año entero, por ejemplo 2026.');
}

const CLAVE_DISPOSITIVO = 'petra.dispositivo';

/**
 * Nombre del aparato, para la columna `dispositivo` de la auditoría.
 *
 * Va aparte del usuario: la auditoría tiene que poder responder "quién" y
 * "desde dónde" por separado. Se guarda en localStorage porque tiene que
 * sobrevivir al cierre de la app, y es un dato del aparato, no de la sesión.
 */
export function dispositivo(): string {
  const guardado = localStorage.getItem(CLAVE_DISPOSITIVO);
  if (guardado !== null && guardado !== '') return guardado;

  const generado = `${plataforma()}-${crypto.randomUUID().slice(0, 8)}`;
  localStorage.setItem(CLAVE_DISPOSITIVO, generado);
  return generado;
}

export function renombrarDispositivo(nombre: string): void {
  localStorage.setItem(CLAVE_DISPOSITIVO, nombre.trim());
}

function plataforma(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return 'ipad';
  if (/iPhone/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  return 'web';
}
