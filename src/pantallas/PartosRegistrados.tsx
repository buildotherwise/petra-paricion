import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { entorno } from '../lib/entorno';
import { buscarPorCaravanaOCollar, partirCoincidencia } from '../lib/busqueda';
import { diaCorto, nombreTipo } from '../lib/parto';
import { hoyISO } from '../lib/reglas';

/**
 * Todos los partos de la temporada, buscables.
 *
 * Es una sección propia y no una parte de «Registrar parto»: entrar por la
 * pantalla de cargar un parto para no cargar ninguno es un camino torcido, y
 * quien busca algo de hace tres días no tiene por qué pasar por ahí.
 *
 * Sin escribir nada ya se ve lo último cargado, agrupado por jornada, porque la
 * parición se recorre por días. Al escribir, la agrupación se disuelve: ahí lo
 * que importa es la caravana y el día pasa a ser un dato de la fila.
 */

interface FilaParto {
  id: string;
  caravana: string;
  fecha: string;
  collar_numero: string | null;
  corderos: number;
}

export function PartosRegistrados({
  onVolver,
  onAbrir,
}: {
  onVolver: () => void;
  onAbrir: (partoId: string) => void;
}) {
  const [consulta, setConsulta] = useState('');

  // Los anulados no cuentan (R1): un parto cargado por error como mellizos no
  // puede seguir diciendo «mellizos» después de corregirlo.
  const { data: partos } = useQuery<FilaParto>(
    `SELECT p.id, o.caravana, p.fecha, p.collar_numero,
            (SELECT count() FROM corderos c
              WHERE c.parto_id = p.id AND c.anulado_en IS NULL) AS corderos
       FROM partos p
       JOIN ovejas o ON o.id = p.oveja_id
      WHERE o.temporada = ?
      ORDER BY p.fecha DESC, p.creado_en DESC`,
    [entorno.temporada],
  );

  const buscando = consulta.trim() !== '';
  const resultados = useMemo(
    () => (buscando ? buscarPorCaravanaOCollar(partos, consulta) : partos),
    [partos, consulta, buscando],
  );

  return (
    <div className="app">
      <Encabezado atras={onVolver} />

      <main className="contenido area-segura">
        <h1 className="titulo">Partos registrados</h1>
        <p className="subtitulo">
          {buscando
            ? `${resultados.length} de ${partos.length} coinciden con «${consulta.trim()}»`
            : `${partos.length} en la temporada ${entorno.temporada}`}
        </p>

        <input
          className="entrada"
          type="search"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Caravana o collar"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          aria-label="Buscar por caravana o collar"
        />

        {resultados.length === 0 && (
          <p className="aviso aviso--atencion" style={{ marginTop: 'var(--sp-4)' }}>
            {buscando
              ? 'Ningún parto de la temporada coincide.'
              : 'Todavía no hay partos cargados en esta temporada.'}
          </p>
        )}

        {buscando
          ? <ListaPartos partos={resultados} consulta={consulta} conFecha onAbrir={onAbrir} />
          : agruparPorDia(resultados).map(([dia, delDia]) => (
              <div key={dia}>
                <p className="etiqueta" style={{ marginTop: 'var(--sp-5)' }}>
                  {tituloDelDia(dia)}
                </p>
                <ListaPartos partos={delDia} consulta="" onAbrir={onAbrir} />
              </div>
            ))}
      </main>
    </div>
  );
}

function ListaPartos({
  partos,
  consulta,
  conFecha = false,
  onAbrir,
}: {
  partos: readonly FilaParto[];
  consulta: string;
  conFecha?: boolean;
  onAbrir: (id: string) => void;
}) {
  if (partos.length === 0) return null;

  return (
    <ul className="lista">
      {partos.map((parto) => {
        const [antes, coincide, despues] = partirCoincidencia(parto.caravana, consulta);
        return (
          <li key={parto.id}>
            <button type="button" onClick={() => onAbrir(parto.id)}>
              <span className="numero">
                {antes}
                <mark>{coincide}</mark>
                {despues}
              </span>
              <span className="nota">
                {conFecha && `${diaCorto(parto.fecha)} · `}
                {nombreTipo(parto.corderos).toLowerCase()}
                {parto.collar_numero !== null && ` · collar ${parto.collar_numero}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Buscar y agrupar
// ───────────────────────────────────────────────────────────────────────

function agruparPorDia(partos: readonly FilaParto[]): [string, FilaParto[]][] {
  const dias = new Map<string, FilaParto[]>();
  for (const parto of partos) {
    const delDia = dias.get(parto.fecha);
    if (delDia === undefined) dias.set(parto.fecha, [parto]);
    else delDia.push(parto);
  }
  return [...dias.entries()];
}

/** «Hoy», «Ayer · 1 de agosto», o la fecha larga. */
function tituloDelDia(fecha: string): string {
  const hoy = hoyISO();
  if (fecha === hoy) return 'Hoy';

  const ayer = new Date(`${hoy}T12:00:00`);
  ayer.setDate(ayer.getDate() - 1);
  const ayerISO = hoyISO(ayer);

  const larga = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-UY', {
    day: 'numeric',
    month: 'long',
  });

  return fecha === ayerISO ? `Ayer · ${larga}` : larga;
}
