import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { Caravana } from '../componentes/Caravana';
import { entorno } from '../lib/entorno';
import { hoyISO } from '../lib/reglas';
import { nombreTipo } from '../lib/parto';
import { useEsAdmin } from '../lib/perfil';

interface Contadores {
  partos_hoy: number;
  partos_temporada: number;
  corderos_nacidos: number;
  pendientes_senalada: number;
}

interface PartoDeHoy {
  id: string;
  caravana: string;
  collar_numero: string | null;
  corderos: number;
}

export function Inicio({
  onRegistrarParto,
  onSenalada,
  onVerPartos,
  onAbrirParto,
  onAdministracion,
}: {
  onRegistrarParto: () => void;
  onSenalada: () => void;
  onVerPartos: () => void;
  onAbrirParto: (partoId: string) => void;
  onAdministracion: () => void;
}) {
  const hoy = hoyISO();
  const esAdmin = useEsAdmin();

  // Todo sale de la réplica local: la pantalla carga igual sin señal.
  // Los anulados no cuentan en ningún contador (R1).
  const { data } = useQuery<Contadores>(
    `SELECT
       (SELECT count() FROM partos WHERE fecha = ?)                    AS partos_hoy,
       (SELECT count() FROM partos p
          JOIN ovejas o ON o.id = p.oveja_id
        WHERE o.temporada = ?)                                         AS partos_temporada,
       (SELECT count() FROM corderos
        WHERE temporada = ? AND anulado_en IS NULL)                    AS corderos_nacidos,
       (SELECT count() FROM corderos
        WHERE temporada = ? AND estado = 'nacido'
          AND anulado_en IS NULL)                                      AS pendientes_senalada`,
    [hoy, entorno.temporada, entorno.temporada, entorno.temporada],
  );

  /**
   * Lo cargado en la jornada.
   *
   * Contesta la pregunta que el operario se hace de verdad al cerrar el día
   * —qué cargué, y está bien— y es la entrada a la corrección más común: la del
   * parto que se acaba de cargar.
   */
  const { data: partosHoy } = useQuery<PartoDeHoy>(
    `SELECT p.id, o.caravana, p.collar_numero,
            (SELECT count() FROM corderos c
              WHERE c.parto_id = p.id AND c.anulado_en IS NULL) AS corderos
       FROM partos p
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE p.fecha = ? AND o.temporada = ?
      ORDER BY p.creado_en DESC`,
    [hoy, entorno.temporada],
  );

  const contadores = data[0];
  const fecha = new Date().toLocaleDateString('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="app">
      <Encabezado />

      <main className="contenido area-segura">
        <h1 className="titulo">Temporada {entorno.temporada}</h1>
        <p className="subtitulo">{fecha}</p>

        {/* Agrupados por unidad, con el sustantivo dicho una vez arriba. Los
            tres contadores en fila mezclaban partos con corderos sin decirlo,
            y con tres partos que dieron cinco corderos los números parecían
            contradecirse: 3, 3, y de pronto 4. */}
        <span className="grupo-contadores">Partos</span>
        <div className="contadores contadores--dos">
          <div className="contador">
            <b>{contadores?.partos_hoy ?? 0}</b>
            <span>Hoy</span>
          </div>
          <div className="contador">
            <b>{contadores?.partos_temporada ?? 0}</b>
            <span>En la temporada</span>
          </div>
        </div>

        <span className="grupo-contadores">Corderos</span>
        <div className="contadores contadores--dos">
          <div className="contador">
            <b>{contadores?.corderos_nacidos ?? 0}</b>
            <span>Nacidos</span>
          </div>
          {/* El único contador que lleva a algún lado: es el número que el
              encargado mira para saber si va quedando trabajo atrás. */}
          <button type="button" className="contador contador--tocable" onClick={onSenalada}>
            <b>{contadores?.pendientes_senalada ?? 0}</b>
            <span>Sin señalar ›</span>
          </button>
        </div>

        <div className="rizo" aria-hidden="true" />

        {/* «Registrar parto» se usa treinta veces por día durante seis semanas
            y la señalada, dos o tres jornadas enteras. La jerarquía sigue al
            uso, no a la importancia. */}
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <button type="button" className="boton boton--principal" onClick={onRegistrarParto}>
            Registrar parto
          </button>
          <button type="button" className="boton boton--secundario" onClick={onSenalada}>
            Señalada
          </button>
        </div>

        <p className="etiqueta" style={{ marginTop: 'var(--sp-5)' }}>
          Partos de hoy
        </p>
        <ul className="lista">
          {partosHoy.map((parto) => (
            <li key={parto.id}>
              <button type="button" onClick={() => onAbrirParto(parto.id)}>
                <Caravana numero={parto.caravana} />
                <span className="nota">
                  {nombreTipo(parto.corderos)}
                  {parto.collar_numero !== null && ` · collar ${parto.collar_numero}`}
                </span>
              </button>
            </li>
          ))}
          {partosHoy.length === 0 && (
            <li>
              <span className="lista-vacia">Todavía no cargaste ningún parto hoy.</span>
            </li>
          )}
          {/* La entrada a la sección de partos registrados va acá y no como un
              tercer botón: está donde se mira cuando se busca un parto, y el
              inicio conserva dos objetivos grandes para el pulgar. */}
          <li>
            <button type="button" onClick={onVerPartos}>
              <span className="ver-todos">Ver todos los partos de la temporada</span>
              <span className="nota" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
          {/* La administración entra con la misma forma que la fila de arriba y
              no como tercer botón grande: el inicio conserva dos objetivos para
              el pulgar. Solo se dibuja con el rol resuelto — `undefined` es
              «todavía no sé», y un enlace que aparece y desaparece medio segundo
              después de arrancar es un reporte de bug, no una demora. */}
          {esAdmin === true && (
            <li>
              <button type="button" onClick={onAdministracion}>
                <span className="ver-todos">Administración</span>
                <span className="nota" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          )}
        </ul>
      </main>
    </div>
  );
}
