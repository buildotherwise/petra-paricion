import { useQuery, useStatus } from '@powersync/react';

/**
 * Cuántos cambios locales faltan subir.
 *
 * `ps_crud` es la cola de subida de PowerSync. Consultarla con useQuery la hace
 * reactiva: el contador baja solo a medida que la cola se vacía, sin polling.
 */
function usarPendientes(): number {
  const { data } = useQuery<{ n: number }>('SELECT count() AS n FROM ps_crud');
  return data[0]?.n ?? 0;
}

function usarRechazados(): number {
  const { data } = useQuery<{ n: number }>('SELECT count() AS n FROM subidas_rechazadas');
  return data[0]?.n ?? 0;
}

/**
 * El indicador de sincronización.
 *
 * Está en el encabezado de todas las pantallas porque es la señal operativa
 * del día a día: con pendientes en 0 el dispositivo se puede perder, romper o
 * reinstalar sin perder nada. Es el hábito que hay que construir en el equipo.
 */
export function IndicadorSync() {
  const estado = useStatus();
  const pendientes = usarPendientes();
  const rechazados = usarRechazados();

  if (rechazados > 0) {
    return (
      <span className="sync sync--error" role="status">
        <span className="sync-punto" />
        {rechazados} rechazado{rechazados === 1 ? '' : 's'}
      </span>
    );
  }

  if (pendientes > 0) {
    return (
      <span className="sync sync--pendiente" role="status">
        <span className="sync-punto" />
        {pendientes} sin sincronizar
      </span>
    );
  }

  // Sin pendientes, todo lo registrado está a salvo en el servidor — con o sin
  // señal en este momento. Por eso el estado de conexión no cambia el color.
  return (
    <span className="sync sync--ok" role="status">
      <span className="sync-punto" />
      {estado.hasSynced === true ? 'Todo sincronizado' : 'Sin datos aún'}
    </span>
  );
}
