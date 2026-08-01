import { PowerSyncDatabase, WASQLiteVFS } from '@powersync/web';
import { EsquemaApp } from './esquema';
import { ConectorSupabase } from './conector';

export const db = new PowerSyncDatabase({
  schema: EsquemaApp,
  database: {
    dbFilename: 'petra.db',

    // OPFSCoopSyncVFS no es una optimización, es un requisito.
    //
    // El default (IDBBatchAtomicVFS) tiene un "RangeError: Maximum call stack
    // size exceeded" conocido en Safari con queries grandes, y es el único VFS
    // con multi-tab estable en iOS. La mitad de los dispositivos del campo son
    // iPhones.
    vfs: WASQLiteVFS.OPFSCoopSyncVFS,
  },
});

// En desarrollo, la base queda accesible desde la consola del navegador para
// poder inspeccionar la réplica y la cola de subida durante las pruebas de
// campo. `import.meta.env.DEV` es estático, así que esto no llega al build.
if (import.meta.env.DEV) {
  (globalThis as unknown as { db: typeof db }).db = db;
}

const conector = new ConectorSupabase();

export async function conectarSync(): Promise<void> {
  await db.connect(conector);
}

export async function desconectarSync(): Promise<void> {
  await db.disconnectAndClear();
}
