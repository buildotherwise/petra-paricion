/**
 * El único camino por el que la app edita algo ya guardado.
 *
 * Existe por una razón concreta y silenciosa. La política de RLS exige
 * `with check (actualizado_por = auth.uid())` y evalúa la fila RESULTANTE. Si B
 * edita un parto que creó A sin tocar esa columna, la fila sigue diciendo A,
 * Postgres devuelve 42501, el clasificador lo trata como error de dato y
 * **descarta el cambio**. La corrección se perdería sin que nadie la vea salvo
 * en la bandeja de rechazados.
 *
 * Además es de donde sale la auditoría: el trigger de Postgres toma el autor y
 * el aparato de estas mismas columnas. Que haya un solo lugar que las escriba
 * es lo que hace que no se pueda olvidar.
 */

import type { AbstractPowerSyncDatabase, LockContext } from '@powersync/web';
import { dispositivo } from '../entorno';

/** Las tablas que la app de campo edita. */
export type TablaEditable = 'ovejas' | 'partos' | 'corderos';

export type Campos = Record<string, string | number | null>;

/**
 * Arma el UPDATE con los metadatos de auditoría ya puestos.
 *
 * Solo se mandan las columnas que se piden: el trigger igual audita únicamente
 * lo que cambió de verdad, pero un UPDATE angosto deja la intención escrita en
 * la cola de subida.
 */
export function actualizar(
  tx: LockContext,
  tabla: TablaEditable,
  id: string,
  campos: Campos,
  usuarioId: string,
): Promise<unknown> {
  const columnas = Object.keys(campos);
  const asignaciones = [...columnas, 'actualizado_en', 'actualizado_por', 'dispositivo']
    .map((c) => `${c} = ?`)
    .join(', ');

  return tx.execute(`UPDATE ${tabla} SET ${asignaciones} WHERE id = ?`, [
    ...columnas.map((c) => campos[c] ?? null),
    new Date().toISOString(),
    usuarioId,
    dispositivo(),
    id,
  ]);
}

/**
 * Una edición = una transacción = un pendiente en el contador.
 *
 * El indicador cuenta transacciones, no operaciones (ver IndicadorSync). Guardar
 * cada acción dentro de su propio `writeTransaction` es lo que hace que "1
 * registro sin subir" signifique una cosa que la persona hizo.
 */
export async function guardarCambio(
  base: AbstractPowerSyncDatabase,
  usuarioId: string,
  cambios: (aplicar: (tabla: TablaEditable, id: string, campos: Campos) => Promise<unknown>) => Promise<void>,
): Promise<void> {
  await base.writeTransaction(async (tx) => {
    await cambios((tabla, id, campos) => actualizar(tx, tabla, id, campos, usuarioId));
  });
}
