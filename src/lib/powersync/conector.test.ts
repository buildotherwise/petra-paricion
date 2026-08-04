import { describe, expect, test, vi } from 'vitest';
import type { AbstractPowerSyncDatabase, CrudEntry } from '@powersync/web';

// El cliente de Supabase toca `window.localStorage` al construirse, y acá no hay
// navegador. Los tests miran qué se guarda cuando una subida falla, no cómo se
// sube: el cliente real no hace falta. `from` es reemplazable por test para
// poder simular la respuesta del servidor donde sí importa (el PATCH sin filas).
const mocks = vi.hoisted(() => ({ from: vi.fn<(tabla: string) => unknown>(() => ({})) }));
vi.mock('../supabase', () => ({ supabase: { from: mocks.from } }));

// El tipo se importa aparte porque `import type` se borra al compilar: traerlo
// con el import normal evaluaría el módulo antes de que corra el mock.
import type { ConectorSupabase as TipoConector } from './conector';
const { ConectorSupabase } = await import('./conector');

/**
 * Qué se guarda cuando el servidor rechaza una carga.
 *
 * Es la última red: una transacción rechazada se descarta entera —reintentarla
 * trabaría la cola para siempre— y lo que queda en `subidas_rechazadas` es la
 * ÚNICA copia del registro. Si acá se pierde una operación, el dato se perdió
 * del todo y sin dejar rastro.
 */

/** Una operación de la cola, con lo mínimo que usa el conector. */
function operacion(tabla: string, id: string, datos: Record<string, unknown>): CrudEntry {
  return { table: tabla, id, op: 'PUT', opData: datos } as unknown as CrudEntry;
}

/**
 * Base falsa: registra los inserts a `subidas_rechazadas` y deja fallar la
 * subida en la operación que se indique.
 */
function baseFalsa(crud: CrudEntry[]) {
  const rechazos: unknown[][] = [];
  let completada = false;

  const base = {
    getNextCrudTransaction: async () => ({
      crud,
      complete: async () => {
        completada = true;
      },
    }),
    execute: async (sql: string, parametros: unknown[]) => {
      if (sql.includes('subidas_rechazadas')) rechazos.push(parametros);
      return { rows: { _array: [] } };
    },
    getOptional: async () => ({ caravana: '1740' }),
  } as unknown as AbstractPowerSyncDatabase;

  return { base, rechazos, seCompleto: () => completada };
}

/** Hace fallar `aplicar` a partir de la operación número `desde`. */
function conFalloEn(conector: TipoConector, desde: number, error: unknown) {
  let n = 0;
  vi.spyOn(conector as unknown as { aplicar: (o: CrudEntry) => Promise<void> }, 'aplicar').
    mockImplementation(async () => {
      if (n++ >= desde) throw error;
    });
}

const DUPLICADA = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "partos_oveja_id_key"',
};

describe('una carga rechazada deja constancia de todo lo que se perdió', () => {
  test('si falla la primera operación, se registran también las que nunca se intentaron', async () => {
    // El caso que importa: el parto de unos mellizos se rechaza y los dos
    // corderos de la misma transacción no llegan a intentarse siquiera.
    const crud = [
      operacion('partos', 'p1', { oveja_id: 'o1', fecha: '2026-08-02' }),
      operacion('corderos', 'c1', { parto_id: 'p1', sexo: 'macho' }),
      operacion('corderos', 'c2', { parto_id: 'p1', sexo: 'hembra' }),
    ];
    const { base, rechazos, seCompleto } = baseFalsa(crud);
    const conector = new ConectorSupabase();
    conFalloEn(conector, 0, DUPLICADA);

    await conector.uploadData(base);

    expect(rechazos).toHaveLength(3);
    expect(seCompleto()).toBe(true);
  });

  test('las operaciones que sí entraron al servidor no se registran como perdidas', async () => {
    // El parto entró; falla el segundo cordero. Registrar el parto diría que se
    // perdió algo que está guardado.
    const crud = [
      operacion('partos', 'p1', { oveja_id: 'o1' }),
      operacion('corderos', 'c1', { parto_id: 'p1' }),
      operacion('corderos', 'c2', { parto_id: 'p1' }),
    ];
    const { base, rechazos } = baseFalsa(crud);
    const conector = new ConectorSupabase();
    conFalloEn(conector, 2, DUPLICADA);

    await conector.uploadData(base);

    expect(rechazos).toHaveLength(1);
    expect(rechazos[0]?.[2]).toBe('corderos');
    expect(rechazos[0]?.[3]).toBe('c2');
  });

  test('las filas de una misma carga comparten identificador', async () => {
    // Un parto de mellizos es una sola cosa que la persona hizo: se muestra una
    // vez, no tres.
    const crud = [
      operacion('partos', 'p1', { oveja_id: 'o1' }),
      operacion('corderos', 'c1', { parto_id: 'p1' }),
    ];
    const { base, rechazos } = baseFalsa(crud);
    const conector = new ConectorSupabase();
    conFalloEn(conector, 0, DUPLICADA);

    await conector.uploadData(base);

    const cargas = new Set(rechazos.map((r) => r[1]));
    expect(cargas.size).toBe(1);
  });

  test('se guardan el código y la caravana, que después no se pueden reconstruir', async () => {
    const crud = [operacion('partos', 'p1', { oveja_id: 'o1' })];
    const { base, rechazos } = baseFalsa(crud);
    const conector = new ConectorSupabase();
    conFalloEn(conector, 0, DUPLICADA);

    await conector.uploadData(base);

    expect(rechazos[0]?.[5]).toBe('23505');
    expect(rechazos[0]?.[7]).toBe('1740');
  });

  test('un error de red no deja constancia: se reintenta', async () => {
    // Descartar acá perdería un parto que sí se podía subir.
    const crud = [operacion('partos', 'p1', { oveja_id: 'o1' })];
    const { base, rechazos, seCompleto } = baseFalsa(crud);
    const conector = new ConectorSupabase();
    conFalloEn(conector, 0, { code: '08006', message: 'connection failure' });

    await expect(conector.uploadData(base)).rejects.toBeDefined();
    expect(rechazos).toHaveLength(0);
    expect(seCompleto()).toBe(false);
  });
});

describe('el UPDATE verifica que el registro exista en el servidor', () => {
  /** Una edición en la cola y la respuesta del servidor al UPDATE. */
  function editar(filas: unknown[]) {
    const crud = [
      { table: 'corderos', id: 'c9', op: 'PATCH', opData: { peso_kg: 4.5 } } as unknown as CrudEntry,
    ];
    mocks.from.mockReturnValue({
      update: () => ({ eq: () => ({ select: async () => ({ data: filas, error: null }) }) }),
    });
    return baseFalsa(crud);
  }

  test('un UPDATE que no matchea ninguna fila se rechaza, no se da por subido', async () => {
    // El alta del registro fue rechazada antes, así que no existe en el
    // servidor. PostgREST contesta eso sin error: sin la verificación, la
    // edición saldría de la cola como subida con éxito — la única pérdida
    // totalmente silenciosa del sistema.
    const { base, rechazos, seCompleto } = editar([]);

    await new ConectorSupabase().uploadData(base);

    expect(rechazos).toHaveLength(1);
    expect(rechazos[0]?.[5]).toBe('PGRST-LOCAL-SIN-FILA');
    expect(seCompleto()).toBe(true);
  });

  test('un UPDATE que sí matchea sale de la cola sin dejar rastro', async () => {
    const { base, rechazos, seCompleto } = editar([{ id: 'c9' }]);

    await new ConectorSupabase().uploadData(base);

    expect(rechazos).toHaveLength(0);
    expect(seCompleto()).toBe(true);
  });
});
