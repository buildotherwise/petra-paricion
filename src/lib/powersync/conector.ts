import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/web';
import { supabase } from '../supabase';
import { entorno } from '../entorno';
import { clasificarErrorSubida, codigoDe, normalizarParaPostgres } from './subida';

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

    let indiceActual = 0;

    try {
      for (const [i, operacion] of transaccion.crud.entries()) {
        indiceActual = i;
        await this.aplicar(operacion);
      }
      await transaccion.complete();
    } catch (error) {
      if (clasificarErrorSubida(error) === 'reintentar') {
        throw error;
      }

      // Se descarta la transacción ENTERA, así que hay que registrar todo lo
      // que no llegó al servidor: la operación que falló y las que venían
      // después, que nunca se intentaron. Las anteriores sí entraron.
      //
      // Registrar solo la que falló perdía los corderos de un parto de
      // mellizos sin dejar rastro, que es exactamente el caso donde más
      // importa saber qué se perdió.
      await this.registrarRechazo(base, transaccion.crud.slice(indiceActual), error);
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
    perdidas: readonly CrudEntry[],
    error: unknown,
  ): Promise<void> {
    const motivo = error instanceof Error ? error.message : JSON.stringify(error);
    const codigo = codigoDe(error);
    // Un solo id para toda la carga: lo que la persona hizo una vez se muestra
    // una vez, aunque sean tres filas.
    const cargaId = crypto.randomUUID();
    const ahora = new Date().toISOString();

    console.error('[sync] carga rechazada por el servidor', { perdidas, error });

    for (const operacion of perdidas) {
      await base.execute(
        `insert into subidas_rechazadas
           (id, carga_id, tabla, registro_id, operacion, codigo, motivo, caravana,
            datos, ocurrido_en)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          cargaId,
          operacion.table,
          operacion.id,
          operacion.op,
          codigo,
          motivo,
          await this.caravanaDe(base, operacion),
          JSON.stringify(operacion.opData ?? {}),
          ahora,
        ],
      );
    }
  }

  /**
   * La caravana del animal, resuelta AHORA y guardada como texto.
   *
   * No se resuelve al mostrar: la oveja de un alta manual rechazada también va a
   * desaparecer de la réplica local, y entonces no habría contra qué unir. Con
   * la caravana guardada, la pantalla de rechazos sigue diciendo de qué animal
   * se trata aunque no quede nada más.
   */
  private async caravanaDe(
    base: AbstractPowerSyncDatabase,
    operacion: CrudEntry,
  ): Promise<string | null> {
    const datos = operacion.opData ?? {};

    try {
      if (operacion.table === 'ovejas') {
        const caravana = datos['caravana'];
        return typeof caravana === 'string' ? caravana : null;
      }

      if (operacion.table === 'partos') {
        const fila = await base.getOptional<{ caravana: string }>(
          'SELECT caravana FROM ovejas WHERE id = ?',
          [datos['oveja_id'] ?? ''],
        );
        return fila?.caravana ?? null;
      }

      if (operacion.table === 'corderos') {
        const fila = await base.getOptional<{ caravana: string }>(
          `SELECT o.caravana FROM partos p
             JOIN ovejas o ON o.id = p.oveja_id
            WHERE p.id = ?`,
          [datos['parto_id'] ?? ''],
        );
        return fila?.caravana ?? null;
      }
    } catch {
      // Que no se pueda nombrar el animal no puede impedir dejar constancia de
      // lo que se perdió.
      return null;
    }

    return null;
  }
}
