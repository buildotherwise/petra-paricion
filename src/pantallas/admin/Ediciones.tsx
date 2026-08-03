import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { edicionesRecientes, useConsultaOnline, type Cambio } from '../../lib/consultas-online';
import { nombreDeCordero } from '../../lib/parto';
import type { MarcaCollar } from '../../lib/reglas';

/**
 * Lo último que se tocó, en cualquier registro.
 *
 * El historial de la ficha contesta «¿quién le cambió el peso a este cordero?»,
 * parado en el cordero. Esto contesta la otra pregunta, que se hace al final
 * del día y sin ningún animal en la cabeza: **¿qué se tocó hoy?**
 *
 * Es la única parte de esta pantalla que se pide por internet.
 */

interface Nombrable {
  id: string;
  tabla: string;
  caravana: string;
  tatuaje: string | null;
  collar_marca: MarcaCollar | null;
  hermanos: number;
}

export function Ediciones() {
  const { datos, cargando, error, recargar } = useConsultaOnline<Cambio>(edicionesRecientes(), []);

  const { data: perfiles } = useQuery<{ id: string; nombre: string }>(
    'SELECT id, nombre FROM perfiles',
  );
  const nombres = useMemo(() => new Map(perfiles.map((p) => [p.id, p.nombre])), [perfiles]);

  // Cómo se llama cada registro sale de la réplica, no del servidor: `cambios`
  // guarda un registro_id y nada más, y un uuid no le dice nada a nadie.
  //
  // Para el cordero hacen falta el tatuaje y la marca además de la caravana,
  // porque la caravana es de la MADRE y no lo identifica: en un parto de
  // trillizos los tres se llamarían igual. Ver `nombreDeCordero`.
  const { data: comoSeLlaman } = useQuery<Nombrable>(
    `SELECT p.id, 'partos' AS tabla, o.caravana,
            NULL AS tatuaje, NULL AS collar_marca, 0 AS hermanos
       FROM partos p JOIN ovejas o ON o.id = p.oveja_id
     UNION ALL
     SELECT c.id, 'corderos' AS tabla, o.caravana,
            c.tatuaje, c.collar_marca,
            (SELECT count() FROM corderos h
              WHERE h.parto_id = c.parto_id AND h.anulado_en IS NULL) AS hermanos
       FROM corderos c
       JOIN partos p ON p.id = c.parto_id
       JOIN ovejas o ON o.id = p.oveja_id
     UNION ALL
     SELECT o.id, 'ovejas' AS tabla, o.caravana, NULL, NULL, 0 FROM ovejas o`,
  );

  const etiquetas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const fila of comoSeLlaman) {
      mapa.set(`${fila.tabla}:${fila.id}`, etiquetaDe(fila));
    }
    return mapa;
  }, [comoSeLlaman]);

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
                {etiquetas.get(`${cambio.tabla}:${cambio.registro_id}`) ?? cambio.tabla}
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

/**
 * Cómo se nombra cada registro en el feed.
 *
 * El parto y la oveja se llaman por la caravana, que es lo que los identifica.
 * El cordero NO: la caravana es de su madre. Ver `nombreDeCordero`.
 */
function etiquetaDe(fila: Nombrable): string {
  if (fila.tabla === 'partos') return `Parto ${fila.caravana}`;
  if (fila.tabla === 'ovejas') return `Oveja ${fila.caravana}`;
  return nombreDeCordero({
    tatuaje: fila.tatuaje,
    caravanaMadre: fila.caravana,
    collar_marca: fila.collar_marca,
    hermanos: fila.hermanos,
  });
}

function cuando(iso: string): string {
  const fecha = new Date(iso);
  return `${fecha.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })} · ${fecha.toLocaleTimeString(
    'es-UY',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}
