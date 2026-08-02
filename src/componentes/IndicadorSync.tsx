import { useQuery, useStatus } from '@powersync/react';

/**
 * Cuántas cargas hechas por el operador falta subir.
 *
 * Se cuentan TRANSACCIONES, no operaciones. `ps_crud` guarda una fila por
 * escritura, así que un parto de mellizos son tres —el parto y los dos
 * corderos— y el contador decía "3 sin sincronizar" para algo que la persona
 * hizo una sola vez. La app guarda cada carga dentro de un `writeTransaction`,
 * de modo que una transacción es exactamente una acción de guardar.
 *
 * El coalesce es por si alguna escritura quedara sin tx_id: así cuenta como
 * una propia en vez de colapsar todas en una.
 */
function usarPendientes(): number {
  const { data } = useQuery<{ n: number }>(
    'SELECT count(DISTINCT coalesce(tx_id, -id)) AS n FROM ps_crud',
  );
  return data[0]?.n ?? 0;
}

function usarRechazados(): number {
  const { data } = useQuery<{ n: number }>('SELECT count() AS n FROM subidas_rechazadas');
  return data[0]?.n ?? 0;
}

const registros = (n: number) => `${n} ${n === 1 ? 'registro' : 'registros'}`;

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
        {registros(rechazados)} con error
      </span>
    );
  }

  if (pendientes > 0) {
    return (
      <span className="sync sync--pendiente" role="status">
        <span className="sync-punto" />
        {registros(pendientes)} sin subir
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
