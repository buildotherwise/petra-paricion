import { registerSW } from 'virtual:pwa-register';

/**
 * Registro del service worker con búsqueda activa de versiones nuevas.
 *
 * El registro mínimo que emitía el plugin registra el SW y nada más: en una
 * PWA que queda residente —la tablet abierta semanas— el navegador no vuelve a
 * buscar `sw.js` por su cuenta, así que un deploy en medio de la temporada no
 * llegaba nunca. Y cuando el SW nuevo por fin se activaba (`skipWaiting` +
 * `clientsClaim`), la página vieja seguía corriendo JS viejo sobre un precache
 * nuevo: el `import()` del tablero pedía un chunk con un hash que ya no
 * existe, y ese 404 se disfrazaba de «sin conexión».
 *
 * De ahí las dos piezas: buscar actualización al volver a primer plano (y
 * cada hora, de respaldo), y recargar la página cuando el SW nuevo toma el
 * control, para que el JS y el precache sean siempre de la misma versión. La
 * recarga no pierde datos —lo registrado vive en la base local—; a lo sumo un
 * formulario a medio llenar, una vez por deploy.
 */
export function registrarServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  // Solo si ya había un controlador: en la primera instalación el claim
  // inicial también dispara `controllerchange`, y recargar ahí sería un
  // parpadeo gratis en el primer arranque.
  const habiaControlador = navigator.serviceWorker.controller !== null;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    recargando = true;
    window.location.reload();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registro) {
      if (registro === undefined) return;
      // El caso que importa en iOS: la PWA vuelve del background días después.
      // Los timers de fondo se congelan, así que el chequeo va atado a volver
      // a primer plano; el intervalo queda para la tablet siempre encendida.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registro.update();
      });
      setInterval(() => void registro.update(), 60 * 60 * 1000);
    },
  });
}
