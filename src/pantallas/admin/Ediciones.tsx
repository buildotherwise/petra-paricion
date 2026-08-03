import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { edicionesRecientes, useConsultaOnline, type Cambio } from '../../lib/consultas-online';

/**
 * Lo último que se tocó, en cualquier registro.
 *
 * El historial de la ficha contesta «¿quién le cambió el peso a este cordero?»,
 * parado en el cordero. Esto contesta la otra pregunta, que se hace al final
 * del día y sin ningún animal en la cabeza: **¿qué se tocó hoy?**
 *
 * Es la única parte de esta pantalla que se pide por internet.
 */

const TABLAS: Record<string, string> = {
  partos: 'Parto',
  corderos: 'Cordero',
  ovejas: 'Oveja',
};

export function Ediciones() {
  const { datos, cargando, error, recargar } = useConsultaOnline<Cambio>(edicionesRecientes(), []);

  const { data: perfiles } = useQuery<{ id: string; nombre: string }>(
    'SELECT id, nombre FROM perfiles',
  );
  const nombres = useMemo(() => new Map(perfiles.map((p) => [p.id, p.nombre])), [perfiles]);

  // Las caravanas salen de la réplica, no del servidor: `cambios` guarda un
  // registro_id y nada más, y un uuid no le dice nada a nadie. Cruzarlo acá es
  // lo que convierte «se cambió el registro 8f2c…» en «se cambió el parto de la
  // 0015».
  const { data: comoSeLlaman } = useQuery<{ id: string; caravana: string; tabla: string }>(
    `SELECT p.id, o.caravana, 'partos' AS tabla
       FROM partos p JOIN ovejas o ON o.id = p.oveja_id
     UNION ALL
     SELECT c.id, o.caravana, 'corderos' AS tabla
       FROM corderos c
       JOIN partos p ON p.id = c.parto_id
       JOIN ovejas o ON o.id = p.oveja_id
     UNION ALL
     SELECT o.id, o.caravana, 'ovejas' AS tabla FROM ovejas o`,
  );
  const caravanas = useMemo(
    () => new Map(comoSeLlaman.map((f) => [`${f.tabla}:${f.id}`, f.caravana])),
    [comoSeLlaman],
  );

  return (
    <section className="historial" style={{ marginTop: 0 }}>
      <p className="etiqueta">Últimas ediciones</p>

      {cargando && <p className="historial-nota">Buscando en el servidor…</p>}

      {error !== null && (
        <div className="historial-nota historial-nota--apagada">
          <p>{error}</p>
          <button type="button" className="boton boton--texto" onClick={recargar}>
            Reintentar
          </button>
        </div>
      )}

      {!cargando && error === null && datos.length === 0 && (
        <p className="historial-nota">Todavía no se editó nada.</p>
      )}

      {datos.length > 0 && (
        <ul className="historial-lista">
          {datos.map((cambio) => (
            <li key={cambio.id}>
              <span className="cuando">{cuando(cambio.realizado_en)}</span>
              <span className="campo">{cambio.campo ?? 'creado'}</span>
              <span className="valor">
                {TABLAS[cambio.tabla] ?? cambio.tabla}{' '}
                {caravanas.get(`${cambio.tabla}:${cambio.registro_id}`) ?? '—'}
                {cambio.tipo === 'actualizacion' && (
                  <>
                    {' · '}
                    <b>{cambio.valor_nuevo ?? '—'}</b>
                  </>
                )}
              </span>
              <span className="autor">
                {nombres.get(cambio.realizado_por) ?? 'Alguien'}
                {cambio.dispositivo !== null && ` · ${cambio.dispositivo}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function cuando(iso: string): string {
  const fecha = new Date(iso);
  return `${fecha.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })} · ${fecha.toLocaleTimeString(
    'es-UY',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}
