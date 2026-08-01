import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/web';
import { supabase } from '../supabase';
import { entorno } from '../entorno';
import { clasificarErrorSubida, normalizarParaPostgres } from './subida';

/**
 * Nombre de la columna clave en Postgres, cuando no es `id`.
 *
 * PowerSync exige que la PK local se llame `id`; en `perfiles` la PK real es
 * `user_id` y las sync rules la renombran al bajar. Al subir hay que deshacer
 * esa traducción.
 */
const COLUMNA_ID: Record<string, string> = {
  perfiles: 'user_id',
};

export class ConectorSupabase implements PowerSyncBackendConnector {
  /**
   * PowerSync pide credenciales al conectar y cada vez que el token vence.
   * El JWT es el mismo de Supabase Auth: la instancia está configurada para
   * validarlo contra el JWKS del proyecto.
   */
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error !== null) throw error;

    const sesion = data.session;
    // Sin sesión no se conecta, pero tampoco es un error: la app funciona
    // offline con lo que ya tiene en la réplica local.
    if (sesion === null) return null;

    return {
      endpoint: entorno.powersyncUrl,
      token: sesion.access_token,
    };
  }

  /**
   * Sube la cola local a Supabase.
   *
   * El manejo de errores es lo importante de este método. Hay exactamente dos
   * salidas y confundirlas rompe la app de formas silenciosas:
   *
   *  - `throw` → PowerSync reintenta más tarde. Correcto para red caída o
   *    servidor sobrecargado.
   *  - `complete()` → la operación se da por terminada y sale de la cola.
   *    Necesario para errores de dato, porque reintentarlos trabaría la cola
   *    para siempre y todo lo registrado después quedaría atrás.
   *
   * Descartar no puede ser silencioso: lo descartado queda en
   * `subidas_rechazadas` para que la app lo muestre.
   */
  async uploadData(base: AbstractPowerSyncDatabase): Promise<void> {
    const transaccion = await base.getNextCrudTransaction();
    if (transaccion === null) return;

    let operacionActual: CrudEntry | null = null;

    try {
      for (const operacion of transaccion.crud) {
        operacionActual = operacion;
        await this.aplicar(operacion);
      }
      await transaccion.complete();
    } catch (error) {
      if (clasificarErrorSubida(error) === 'reintentar') {
        throw error;
      }

      await this.registrarRechazo(base, operacionActual, error);
      await transaccion.complete();
    }
  }

  private async aplicar(operacion: CrudEntry): Promise<void> {
    const tabla = operacion.table;
    const columnaId = COLUMNA_ID[tabla] ?? 'id';
    const consulta = supabase.from(tabla);

    switch (operacion.op) {
      case UpdateType.PUT: {
        const datos = normalizarParaPostgres(tabla, {
          ...operacion.opData,
          [columnaId]: operacion.id,
        });
        const { error } = await consulta.upsert(datos);
        if (error !== null) throw error;
        return;
      }

      case UpdateType.PATCH: {
        const datos = normalizarParaPostgres(tabla, { ...operacion.opData });
        const { error } = await consulta.update(datos).eq(columnaId, operacion.id);
        if (error !== null) throw error;
        return;
      }

      case UpdateType.DELETE: {
        // En este sistema no hay borrado físico: las bajas son lógicas para
        // preservar la trazabilidad. Un DELETE en la cola es un bug de la app,
        // no una operación válida — se rechaza para que quede registrado.
        throw Object.assign(new Error(`DELETE no permitido sobre ${tabla}`), {
          code: 'PGRST-LOCAL-DELETE',
        });
      }
    }
  }

  private async registrarRechazo(
    base: AbstractPowerSyncDatabase,
    operacion: CrudEntry | null,
    error: unknown,
  ): Promise<void> {
    const motivo = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('[sync] operación rechazada por el servidor', { operacion, error });

    await base.execute(
      `insert into subidas_rechazadas
         (id, tabla, registro_id, operacion, motivo, datos, ocurrido_en)
       values (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        operacion?.table ?? 'desconocida',
        operacion?.id ?? '',
        operacion?.op ?? '',
        motivo,
        JSON.stringify(operacion?.opData ?? {}),
        new Date().toISOString(),
      ],
    );
  }
}
