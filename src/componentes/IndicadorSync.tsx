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
export function usarPendientes(): number {
  const { data } = useQuery<{ n: number }>(
    'SELECT count(DISTINCT coalesce(tx_id, -id)) AS n FROM ps_crud',
  );
  return data[0]?.n ?? 0;
}

/**
 * Cuántas CARGAS rechazó el servidor.
 *
 * Por la misma razón que los pendientes cuentan transacciones: un parto de
 * mellizos son tres filas de algo que la persona hizo una sola vez, y decir «3
 * registros con error» para un solo parto manda a buscar tres problemas donde
 * hay uno.
 */
export function usarRechazados(): number {
  const { data } = useQuery<{ n: number }>(
    'SELECT count(DISTINCT carga_id) AS n FROM subidas_rechazadas',
  );
  return data[0]?.n ?? 0;
}

const registros = (n: number) => `${n} ${n === 1 ? 'registro' : 'registros'}`;
const cargas = (n: number) => `${n} ${n === 1 ? 'carga' : 'cargas'}`;

/**
 * El indicador de sincronización.
 *
 * Está en el encabezado de todas las pantallas porque es la señal operativa
 * del día a día: con pendientes en 0 el dispositivo se puede perder, romper o
 * reinstalar sin perder nada. Es el hábito que hay que construir en el equipo.
 */
export function IndicadorSync({ onVerRechazados }: { onVerRechazados?: (() => void) | undefined }) {
  const estado = useStatus();
  const pendientes = usarPendientes();
  const rechazados = usarRechazados();

  // Con rechazos la pastilla deja de ser un cartel y pasa a ser la puerta: avisar
  // de un problema sin dar el camino para verlo es peor que no avisar.
  if (rechazados > 0) {
    return (
      <button
        type="button"
        className="sync sync--error sync--tocable"
        onClick={onVerRechazados}
        disabled={onVerRechazados === undefined}
      >
        <span className="sync-punto" />
        {cargas(rechazados)} con error
      </button>
    );
  }

  if (pendientes > 0) {
    // Con conexión al servicio y la subida fallando igual, esto no es «sin
    // señal»: es el sync roto — cuenta desactivada, sesión inválida, un bug.
    // La diferencia importa porque esperar no lo arregla: un aparato así se
    // veía idéntico a uno en un potrero sin señal, y se descubría cuando
    // alguien notaba que faltaban partos.
    if (estado.connected && estado.uploadError !== undefined) {
      return (
        <span className="sync sync--error" role="status">
          <span className="sync-punto" />
          {registros(pendientes)} sin subir — con problemas
        </span>
      );
    }
    return (
      <span className="sync sync--pendiente" role="status">
        <span className="sync-punto" />
        {registros(pendientes)} sin subir
      </span>
    );
  }

  // Un aparato que todavía no sincronizó NUNCA no tiene nada a salvo: verde
  // sería la señal equivocada, aunque tampoco haya nada perdido.
  if (estado.hasSynced !== true) {
    return (
      <span className="sync sync--pendiente" role="status">
        <span className="sync-punto" />
        Sin datos aún
      </span>
    );
  }

  // Sin pendientes, todo lo registrado está a salvo en el servidor — con o sin
  // señal en este momento. Por eso el estado de conexión no cambia el color.
  return (
    <span className="sync sync--ok" role="status">
      <span className="sync-punto" />
      Todo sincronizado
    </span>
  );
}
