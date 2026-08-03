import { useMemo, useState } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { entorno } from '../lib/entorno';
import { buscarPorCaravanaOCollar, partirCoincidencia } from '../lib/busqueda';
import { antiguedad, nombreTipo } from '../lib/parto';

/**
 * La entrada a la señalada.
 *
 * El buscador va arriba y la lista abajo, al revés de lo que decía la spec.
 * El motivo es cómo se trabaja: se señala en tandas, se agarra una oveja y lo
 * primero que se sabe es su caravana. Una lista de doscientos corderos no ayuda
 * a encontrar la que ya tenés agarrada, y ordenada por antigüedad la fila que
 * buscás nunca está arriba.
 *
 * La lista igual está, porque contesta la otra pregunta —cuánto falta y si
 * quedó alguno atrás— y esa se hace al final de la jornada, no con el animal en
 * la mano.
 */

interface FilaPendiente {
  id: string;
  caravana: string;
  fecha: string;
  collar_numero: string | null;
  /** Corderos del parto sin señalar. */
  pendientes: number;
  /** Corderos del parto que siguen contando (R1), señalados o no. */
  corderos: number;
  /** Cuando falta uno solo, se entra directo a señalarlo. */
  primer_pendiente: string;
}

/** Cuántos partos se muestran antes de que la lista pida abrirse entera. */
const VISIBLES = 4;

/**
 * A partir de cuánto tiempo sin bajar datos la señalada avisa.
 *
 * Doce horas es una jornada: si el aparato bajó datos esta mañana, lo que otro
 * haya señalado desde entonces ya sería raro. Más corto que eso convertiría el
 * aviso en ruido diario, que es la forma de que un aviso deje de leerse.
 */
const HORAS_PARA_AVISAR = 12;

export function Senalada({
  onVolver,
  onSenalarParto,
  onSenalarCordero,
}: {
  onVolver: () => void;
  onSenalarParto: (partoId: string) => void;
  onSenalarCordero: (corderoId: string) => void;
}) {
  const [consulta, setConsulta] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const desactualizado = useDatosViejos();

  // Solo partos con corderos sin señalar: los ya hechos no tienen nada que
  // hacer acá. Los anulados no cuentan para nada (R1) y los muertos no pasan
  // por la señalada (R5, R8).
  const { data: partos } = useQuery<FilaPendiente>(
    `SELECT p.id, o.caravana, p.fecha, p.collar_numero,
            count(c.id)  AS pendientes,
            min(c.id)    AS primer_pendiente,
            (SELECT count() FROM corderos t
              WHERE t.parto_id = p.id AND t.anulado_en IS NULL) AS corderos
       FROM partos p
       JOIN ovejas o   ON o.id = p.oveja_id
       JOIN corderos c ON c.parto_id = p.id
                      AND c.estado = 'nacido'
                      AND c.anulado_en IS NULL
      WHERE o.temporada = ?
      GROUP BY p.id
      -- Los más viejos primero: son los que urgen.
      ORDER BY p.fecha, o.caravana`,
    [entorno.temporada],
  );

  const { data: senalados } = useQuery<{ n: number }>(
    `SELECT count() AS n FROM corderos
      WHERE temporada = ? AND estado = 'senalado' AND anulado_en IS NULL`,
    [entorno.temporada],
  );

  const buscando = consulta.trim() !== '';
  const resultados = useMemo(
    () => (buscando ? buscarPorCaravanaOCollar(partos, consulta) : partos),
    [partos, consulta, buscando],
  );

  const corderosPendientes = partos.reduce((total, p) => total + p.pendientes, 0);
  const visibles = buscando || verTodos ? resultados : resultados.slice(0, VISIBLES);

  /**
   * Con un solo cordero pendiente no hay nada que elegir: la pantalla de
   * hermanos sería un toque que solo dice lo que ya se sabe. En partos únicos
   * —la mayoría— se entra derecho a señalar.
   */
  const abrir = (parto: FilaPendiente) => {
    if (parto.pendientes === 1) onSenalarCordero(parto.primer_pendiente);
    else onSenalarParto(parto.id);
  };

  return (
    <div className="app">
      <Encabezado atras={onVolver} />

      <main className="contenido area-segura">
        <h1 className="titulo">Señalada</h1>
        <p className="subtitulo">
          {buscando
            ? `${resultados.length} sin señalar coinciden con «${consulta.trim()}»`
            : '¿Qué oveja tenés?'}
        </p>

        {desactualizado !== null && (
          <p className="aviso aviso--atencion">
            <b>Últimos datos: {desactualizado}.</b> Si otro aparato señaló en el medio, el número
            que te sugiera puede estar usado. Revisalo antes de tatuar.
          </p>
        )}

        <input
          className="entrada entrada--cifra entrada--pista"
          type="search"
          inputMode="numeric"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Caravana o collar"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          aria-label="Buscar por caravana de la madre o número de collar"
        />

        {!buscando && (
          <p className="etiqueta" style={{ marginTop: 'var(--sp-5)' }}>
            {corderosPendientes === 0
              ? 'Sin señalar'
              : `Sin señalar · ${corderosPendientes} ${
                  corderosPendientes === 1 ? 'cordero' : 'corderos'
                }`}
          </p>
        )}

        {resultados.length === 0 ? (
          <p className="aviso" style={{ marginTop: 'var(--sp-4)' }}>
            {buscando
              ? 'Ninguna oveja sin señalar coincide. Puede que ya la hayas señalado.'
              : senalados[0] !== undefined && senalados[0].n > 0
                ? 'No queda nada por señalar en la temporada.'
                : 'Todavía no hay corderos para señalar.'}
          </p>
        ) : (
          <ul className="lista">
            {visibles.map((parto) => {
              const [antes, coincide, despues] = partirCoincidencia(
                parto.caravana,
                buscando ? consulta : '',
              );
              return (
                <li key={parto.id}>
                  <button type="button" onClick={() => abrir(parto)}>
                    <span className="numero">
                      {antes}
                      <mark>{coincide}</mark>
                      {despues}
                    </span>
                    <span className="nota">
                      {nombreTipo(parto.corderos).toLowerCase()}
                      {parto.collar_numero !== null && ` · collar ${parto.collar_numero}`}
                      {parto.pendientes < parto.corderos && ` · falta ${parto.pendientes}`}
                      {` · ${antiguedad(parto.fecha)}`}
                    </span>
                  </button>
                </li>
              );
            })}

            {!buscando && !verTodos && resultados.length > VISIBLES && (
              <li>
                <button type="button" onClick={() => setVerTodos(true)}>
                  <span className="ver-todos">Ver los {resultados.length} partos</span>
                  <span className="nota" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            )}
          </ul>
        )}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// La única pantalla de la app que quiere estar al día
// ───────────────────────────────────────────────────────────────────────

/**
 * Hace cuánto que el aparato no baja datos, o null si está al día.
 *
 * Toda la app funciona días enteros sin señal y eso no cambia acá: esto avisa,
 * no bloquea. Negarse a trabajar sin señal en un corral que rara vez la tiene
 * convertiría un riesgo raro en un bloqueo seguro, y el equipo terminaría
 * señalando en papel — que es exactamente lo que este sistema vino a eliminar.
 *
 * El riesgo concreto que se avisa: el tatuaje sugerido sale del mayor usado en
 * la réplica local, así que un aparato atrasado propone números que otro ya
 * gastó, y el rechazo llega cuando el animal ya tiene el tatuaje en la oreja.
 */
function useDatosViejos(): string | null {
  const estado = useStatus();

  if (estado.hasSynced !== true) return 'nunca';

  const ultima = estado.lastSyncedAt;
  if (!(ultima instanceof Date)) return null;

  const horas = (Date.now() - ultima.getTime()) / 3_600_000;
  if (horas < HORAS_PARA_AVISAR) return null;

  const dias = Math.floor(horas / 24);
  if (dias >= 1) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  return `hace ${Math.floor(horas)} horas`;
}

// `antiguedad` se mudó a lib/parto.ts: la tabla de corderos y el panel de
// revisión necesitan el mismo cálculo, y la antigüedad de un cordero tiene que
// decir lo mismo en las tres pantallas.
