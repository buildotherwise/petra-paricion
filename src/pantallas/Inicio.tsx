import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { entorno } from '../lib/entorno';
import { hoyISO } from '../lib/reglas';

interface Contadores {
  partos_hoy: number;
  partos_temporada: number;
  pendientes_senalada: number;
}

export function Inicio({ onRegistrarParto }: { onRegistrarParto: () => void }) {
  const hoy = hoyISO();

  // Todo sale de la réplica local: la pantalla de inicio carga igual sin señal.
  const { data } = useQuery<Contadores>(
    `SELECT
       (SELECT count() FROM partos WHERE fecha = ?)                    AS partos_hoy,
       (SELECT count() FROM partos p
          JOIN ovejas o ON o.id = p.oveja_id
        WHERE o.temporada = ?)                                         AS partos_temporada,
       (SELECT count() FROM corderos
        WHERE temporada = ? AND estado = 'nacido')                     AS pendientes_senalada`,
    [hoy, entorno.temporada, entorno.temporada],
  );

  const contadores = data[0];

  return (
    <div className="app">
      <Encabezado />

      <main className="contenido area-segura">
        <h1 className="titulo">Temporada {entorno.temporada}</h1>
        <p className="subtitulo">
          {new Date().toLocaleDateString('es-UY', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>

        <div className="contadores">
          <div className="contador">
            <b>{contadores?.partos_hoy ?? 0}</b>
            <span>Partos hoy</span>
          </div>
          <div className="contador">
            <b>{contadores?.partos_temporada ?? 0}</b>
            <span>Temporada</span>
          </div>
          <div className="contador">
            <b>{contadores?.pendientes_senalada ?? 0}</b>
            <span>Sin señalar</span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <button type="button" className="boton boton--principal" onClick={onRegistrarParto}>
            Registrar parto
          </button>
          <button type="button" className="boton boton--secundario" disabled>
            Señalada · todavía no disponible
          </button>
        </div>
      </main>
    </div>
  );
}
