import { describe, expect, test } from 'vitest';
import { camposDeLaCarga, motivoLegible, tituloDeLaCarga } from './rechazos';

describe('el motivo del rechazo se cuenta en castellano', () => {
  test('una oveja que ya tenía parto', () => {
    // El caso más probable: dos aparatos cargaron el mismo parto.
    const texto = motivoLegible(
      '23505',
      'duplicate key value violates unique constraint "partos_oveja_id_key"',
    );
    expect(texto).toMatch(/ya tenía un parto/i);
    expect(texto).not.toMatch(/constraint|duplicate key/i);
  });

  test('una caravana repetida en la temporada', () => {
    const texto = motivoLegible(
      '23505',
      'duplicate key value violates unique constraint "ovejas_temporada_caravana_key"',
    );
    expect(texto).toMatch(/caravana/i);
  });

  test('un tatuaje ya usado', () => {
    const texto = motivoLegible(
      '23505',
      'duplicate key value violates unique constraint "corderos_tatuaje_unico"',
    );
    expect(texto).toMatch(/tatuaje/i);
  });

  test('un peso fuera de rango', () => {
    const texto = motivoLegible(
      '23514',
      'new row for relation "corderos" violates check constraint "peso_en_rango"',
    );
    expect(texto).toMatch(/peso/i);
  });

  test('una muerte sin causa', () => {
    const texto = motivoLegible(
      '23514',
      'new row for relation "corderos" violates check constraint "muerte_documentada"',
    );
    expect(texto).toMatch(/causa|motivo/i);
  });

  test('el parto al que pertenece el cordero no llegó', () => {
    // Sucede cuando el parto se rechazó y el cordero se subió aparte.
    const texto = motivoLegible(
      '23503',
      'insert or update on table "corderos" violates foreign key constraint "corderos_parto_id_fkey"',
    );
    expect(texto).toMatch(/parto/i);
  });

  test('una cuenta sin permiso o desactivada', () => {
    const texto = motivoLegible('42501', 'new row violates row-level security policy');
    expect(texto).toMatch(/cuenta|permiso/i);
  });

  test('el mensaje del trigger de fecha de muerte se conserva', () => {
    // Ya viene en castellano desde la base: traducirlo lo empeoraría.
    const texto = motivoLegible(
      '23514',
      'La fecha de muerte (2026-08-01) es anterior a la del parto (2026-08-02)',
    );
    expect(texto).toMatch(/anterior a la del parto/i);
  });

  test('un error desconocido no queda mudo', () => {
    const texto = motivoLegible('XX999', 'algo raro pasó');
    expect(texto.length).toBeGreaterThan(0);
    expect(texto).toMatch(/algo raro pasó/);
  });

  test('sin código tampoco queda mudo', () => {
    expect(motivoLegible(null, '').length).toBeGreaterThan(0);
  });
});

describe('el título dice de qué carga se trata', () => {
  test('un parto se nombra por la caravana de la madre', () => {
    expect(tituloDeLaCarga('partos', '1740')).toBe('Parto de 1740');
  });

  test('un cordero también', () => {
    expect(tituloDeLaCarga('corderos', '1740')).toBe('Cordero de 1740');
  });

  test('un alta de oveja se nombra por su caravana', () => {
    expect(tituloDeLaCarga('ovejas', 'PI 136')).toBe('Oveja PI 136');
  });

  test('sin caravana, el título sigue diciendo qué era', () => {
    expect(tituloDeLaCarga('partos', null)).toBe('Un parto');
  });
});

describe('lo que se había cargado se muestra legible', () => {
  test('un parto muestra fecha, condición y collar', () => {
    const campos = camposDeLaCarga('partos', {
      id: 'abc',
      oveja_id: 'def',
      fecha: '2026-08-01',
      condicion_corporal: 2.5,
      collar_numero: '12',
      creado_por: 'xyz',
    });
    expect(campos).toEqual([
      { etiqueta: 'Fecha', valor: '1 ago 2026' },
      { etiqueta: 'Condición corporal', valor: '2,50' },
      { etiqueta: 'Collar del parto', valor: '12' },
    ]);
  });

  test('un cordero muestra el peso con coma y la causa con su etiqueta', () => {
    const campos = camposDeLaCarga('corderos', {
      sexo: 'macho',
      condicion: 'muerto',
      peso_kg: 4.1,
      collar_marca: 'punto_arriba',
      causa_muerte: 'hambre_exposicion',
      fecha_muerte: '2026-08-05',
    });
    expect(campos).toContainEqual({ etiqueta: 'Peso', valor: '4,10 kg' });
    expect(campos).toContainEqual({ etiqueta: 'Sexo', valor: 'Macho' });
    expect(campos).toContainEqual({ etiqueta: 'Marca del collar', valor: 'Punto arriba' });
    expect(campos).toContainEqual({ etiqueta: 'Causa de muerte', valor: 'Hambre, exposición' });
  });

  test('los identificadores y los metadatos no se muestran', () => {
    // Un uuid en pantalla no le dice nada a nadie en el campo.
    const campos = camposDeLaCarga('corderos', {
      id: 'abc',
      parto_id: 'def',
      temporada: 2026,
      creado_en: '2026-08-01T10:00:00Z',
      actualizado_por: 'xyz',
      dispositivo: 'tablet',
      sexo: 'hembra',
    });
    expect(campos).toEqual([{ etiqueta: 'Sexo', valor: 'Hembra' }]);
  });

  test('los campos vacíos se omiten', () => {
    const campos = camposDeLaCarga('partos', {
      fecha: '2026-08-01',
      condicion_corporal: null,
      collar_numero: null,
      observaciones: '',
    });
    expect(campos).toEqual([{ etiqueta: 'Fecha', valor: '1 ago 2026' }]);
  });

  test('una tabla desconocida no rompe', () => {
    expect(camposDeLaCarga('otra_cosa', { algo: 1 })).toEqual([]);
  });
});
