import { describe, expect, test } from 'vitest';
import { clasificarErrorSubida, normalizarParaPostgres } from './subida';

/**
 * Clasificar mal un error de subida tiene dos formas de romper la app, ambas
 * silenciosas:
 *
 *  - Reintentar un error de datos deja la cola trabada para siempre. Todo lo
 *    que se registre después queda atrás de una operación que nunca va a pasar.
 *  - Descartar un error de red pierde un parto que sí se podía subir.
 *
 * Por eso esta decisión es una función pura con tests, y no un `catch` suelto.
 */
describe('clasificación de errores de subida', () => {
  test('una violación de constraint se descarta: reintentar no la va a arreglar', () => {
    const error = { code: '23514', message: 'senalada_completa violada' };
    expect(clasificarErrorSubida(error)).toBe('descartar');
  });

  test('una clave duplicada se descarta', () => {
    const error = { code: '23505', message: 'corderos_tatuaje_unico' };
    expect(clasificarErrorSubida(error)).toBe('descartar');
  });

  test('una violación de RLS se descarta', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy' };
    expect(clasificarErrorSubida(error)).toBe('descartar');
  });

  test('un request mal formado (PGRST) se descarta', () => {
    const error = { code: 'PGRST204', message: "column 'x' does not exist" };
    expect(clasificarErrorSubida(error)).toBe('descartar');
  });

  test('una falla de conexión se reintenta', () => {
    // Clase 08 de SQLSTATE: connection exception.
    const error = { code: '08006', message: 'connection failure' };
    expect(clasificarErrorSubida(error)).toBe('reintentar');
  });

  test('el servidor sin recursos se reintenta', () => {
    // Clase 53: insufficient resources. Es transitorio.
    const error = { code: '53300', message: 'too many connections' };
    expect(clasificarErrorSubida(error)).toBe('reintentar');
  });

  test('un deadlock o fallo de serialización se reintenta', () => {
    const error = { code: '40001', message: 'could not serialize access' };
    expect(clasificarErrorSubida(error)).toBe('reintentar');
  });

  test('el servidor apagándose se reintenta', () => {
    // Clase 57: operator intervention.
    const error = { code: '57P01', message: 'terminating connection due to shutdown' };
    expect(clasificarErrorSubida(error)).toBe('reintentar');
  });

  test('un error de red sin código se reintenta', () => {
    expect(clasificarErrorSubida(new TypeError('Failed to fetch'))).toBe('reintentar');
  });

  test('un error desconocido se reintenta: ante la duda no se pierde el dato', () => {
    expect(clasificarErrorSubida({ mensaje: 'algo raro' })).toBe('reintentar');
    expect(clasificarErrorSubida(null)).toBe('reintentar');
  });
});

/**
 * SQLite no tiene booleanos: PowerSync los guarda como 1/0. PostgREST recibe
 * ese 1 como número JSON y falla al meterlo en una columna boolean.
 */
describe('normalización de filas hacia Postgres', () => {
  test('los booleanos de corderos viajan como true/false, no como 1/0', () => {
    const fila = normalizarParaPostgres('corderos', { sexo_discrepancia: 1 });
    expect(fila['sexo_discrepancia']).toBe(true);
  });

  test('el 0 se convierte en false, no se pierde por falsy', () => {
    const fila = normalizarParaPostgres('corderos', { sexo_discrepancia: 0 });
    expect(fila['sexo_discrepancia']).toBe(false);
  });

  test('los booleanos de ovejas también se convierten', () => {
    expect(normalizarParaPostgres('ovejas', { precargada: 0 })['precargada']).toBe(false);
  });

  test('un booleano ya convertido pasa intacto', () => {
    expect(normalizarParaPostgres('ovejas', { precargada: true })['precargada']).toBe(true);
  });

  test('los campos 0/1 del fenotipo NO se convierten: son códigos, no booleanos', () => {
    // halo_hair y pigmentación son smallint en Postgres. Convertirlos a boolean
    // rompería la continuidad con la codificación histórica de Zoho.
    const fila = normalizarParaPostgres('corderos', { halo_hair: 1, pigmentacion: 0 });
    expect(fila['halo_hair']).toBe(1);
    expect(fila['pigmentacion']).toBe(0);
  });

  test('un null en un campo booleano se mantiene null', () => {
    expect(normalizarParaPostgres('ovejas', { precargada: null })['precargada']).toBeNull();
  });

  test('los campos que no son booleanos pasan sin tocar', () => {
    const fila = normalizarParaPostgres('corderos', {
      peso_kg: 4.2,
      collar_numero: '012',
      sexo: 'macho',
    });
    expect(fila).toEqual({ peso_kg: 4.2, collar_numero: '012', sexo: 'macho' });
  });

  test('una tabla sin booleanos devuelve la fila igual', () => {
    const fila = normalizarParaPostgres('partos', { condicion_corporal: 2.25 });
    expect(fila).toEqual({ condicion_corporal: 2.25 });
  });
});
