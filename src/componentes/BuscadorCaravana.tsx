import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { db } from '../lib/powersync/db';
import { dispositivo, entorno } from '../lib/entorno';
import { useUsuarioId } from '../lib/sesion';
import { buscarCaravana, partirCoincidencia } from '../lib/busqueda';

export interface OvejaElegida {
  id: string;
  caravana: string;
}

interface Fila {
  id: string;
  caravana: string;
  parto_id: string | null;
  parto_fecha: string | null;
}

/** Cuántas bloqueadas se muestran antes de resumir el resto en un contador. */
const BLOQUEADAS_VISIBLES = 3;

/** '2026-08-02' → '2 ago'. Lo justo para reconocer si el parto es de hoy. */
function diaCorto(iso: string): string {
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  const [, mes, dia] = iso.split('-');
  return `${Number(dia)} ${meses[Number(mes) - 1] ?? ''}`;
}

/**
 * Buscador de caravanas, con alta manual incluida.
 *
 * Lo usan el paso 1 (elegir la madre del parto) y la asignación de nodriza. Es
 * el mismo problema en los dos casos, y duplicarlo significaría que un arreglo
 * en uno no llega al otro — justamente lo que pasó con el caso de las
 * caravanas alfanuméricas.
 */
export function BuscadorCaravana({
  autoFocus = false,
  excluirId,
  bloquearConParto = false,
  onElegir,
  onAbrirParto,
}: {
  autoFocus?: boolean;
  /** Oveja que no debe ofrecerse (la madre biológica no puede ser su propia nodriza). */
  excluirId?: string | undefined;
  /**
   * Impide elegir ovejas que ya tienen parto. Solo al elegir la MADRE del
   * parto: una nodriza casi siempre tiene su propio parto, y bloquearla ahí
   * haría imposible asignarla.
   */
  bloquearConParto?: boolean;
  onElegir: (oveja: OvejaElegida) => void;
  /**
   * Qué hacer al tocar una oveja que ya parió. Es lo que pide la spec §7:
   * avisar y ofrecer abrirlo. Sin esto la fila queda muerta y el operador no
   * tiene forma de ver si el parto que ya existe es el que él iba a cargar.
   */
  onAbrirParto?: ((partoId: string) => void) | undefined;
}) {
  const [consulta, setConsulta] = useState('');
  const [altaManual, setAltaManual] = useState(false);
  const [verTodasBloqueadas, setVerTodasBloqueadas] = useState(false);

  // Se traen las ~500 madres de la temporada y se filtra en memoria. El costo
  // es despreciable y a cambio la búsqueda llega a las caravanas alfanuméricas
  // (ver src/lib/busqueda.ts), cosa que un LIKE no logra.
  const { data: ovejas } = useQuery<Fila>(
    `SELECT o.id, o.caravana, p.id AS parto_id, p.fecha AS parto_fecha
       FROM ovejas o
       LEFT JOIN partos p ON p.oveja_id = o.id
      WHERE o.temporada = ?`,
    [entorno.temporada],
  );

  const { disponibles, bloqueadas } = useMemo(() => {
    const todas = buscarCaravana(
      ovejas.filter((o) => o.id !== excluirId),
      consulta,
    );
    if (!bloquearConParto) return { disponibles: todas.slice(0, 12), bloqueadas: [] as Fila[] };
    return {
      disponibles: todas.filter((o) => o.parto_id === null).slice(0, 12),
      bloqueadas: todas.filter((o) => o.parto_id !== null),
    };
  }, [ovejas, consulta, excluirId, bloquearConParto]);

  const bloqueadasVisibles = verTodasBloqueadas
    ? bloqueadas
    : bloqueadas.slice(0, BLOQUEADAS_VISIBLES);
  const ocultas = bloqueadas.length - bloqueadasVisibles.length;

  if (altaManual) {
    return (
      <AltaManual
        inicial={consulta}
        existentes={ovejas}
        onCancelar={() => setAltaManual(false)}
        onCreada={onElegir}
      />
    );
  }

  return (
    <>
      <input
        className="entrada entrada--cifra"
        inputMode="numeric"
        autoFocus={autoFocus}
        placeholder="0000"
        value={consulta}
        onChange={(e) => setConsulta(e.target.value)}
        aria-label="Número de caravana"
      />

      {disponibles.length > 0 && (
        <ul className="lista" style={{ marginTop: 'var(--sp-3)' }}>
          {disponibles.map((fila) => {
            const [antes, coincide, despues] = partirCoincidencia(fila.caravana, consulta);
            return (
              <li key={fila.id}>
                <button
                  type="button"
                  onClick={() => onElegir({ id: fila.id, caravana: fila.caravana })}
                >
                  <span className="numero">
                    {antes}
                    <mark>{coincide}</mark>
                    {despues}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Las que ya parieron se muestran aparte, no se esconden: el operador
          supondría que faltan de la lista y las cargaría por alta manual,
          creando una caravana duplicada que Postgres rechaza igual. Con
          `onAbrirParto` se pueden tocar y llevan a su parto — que es lo que
          resuelve el caso de verdad: mirar si el parto que ya existe es el que
          se iba a cargar. La fecha distingue "esta la cargué yo hace un rato"
          de "alguien la cargó por error". */}
      {bloqueadas.length > 0 && (
        <>
          <p className="grupo-bloqueado">
            {onAbrirParto !== undefined
              ? 'Ya parieron · tocá para ver el parto'
              : 'Ya tienen parto registrado'}
          </p>
          <ul className={onAbrirParto !== undefined ? 'lista' : 'lista lista--bloqueada'}>
            {bloqueadasVisibles.map((fila) => {
              const [antes, coincide, despues] = partirCoincidencia(fila.caravana, consulta);
              const partoId = fila.parto_id;
              return (
                <li key={fila.id}>
                  <button
                    type="button"
                    disabled={onAbrirParto === undefined || partoId === null}
                    onClick={
                      onAbrirParto !== undefined && partoId !== null
                        ? () => onAbrirParto(partoId)
                        : undefined
                    }
                  >
                    <span className="numero">
                      {antes}
                      <mark>{coincide}</mark>
                      {despues}
                    </span>
                    <span className="nota">
                      {fila.parto_fecha !== null && diaCorto(fila.parto_fecha)}
                      {onAbrirParto !== undefined && ' · Abrir ›'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {ocultas > 0 && (
            <button
              type="button"
              className="ver-mas"
              onClick={() => setVerTodasBloqueadas(true)}
            >
              y {ocultas} más
            </button>
          )}
        </>
      )}

      {consulta.trim() !== '' && disponibles.length === 0 && bloqueadas.length === 0 && (
        <p className="aviso aviso--atencion" style={{ marginTop: 'var(--sp-3)' }}>
          Ninguna caravana de la temporada tiene <strong>{consulta}</strong>.
        </p>
      )}

      {/* Siempre visible, no solo cuando la búsqueda no encuentra nada. Con
          teclado numérico, si existe "PI 138" no hay forma de llegar a cargar
          "138 V": el buscador siempre devuelve algo y el botón nunca
          aparecería. Va al pie porque en 500 partos el 99% son ovejas que sí
          están en la lista — tiene que estar disponible, no cómodo. */}
      <button type="button" className="alta-manual" onClick={() => setAltaManual(true)}>
        + No está en la lista
      </button>
    </>
  );
}

/**
 * Alta manual de una oveja que no está en la lista (R9).
 *
 * Acá el teclado es común, no numérico: hay caravanas como 'PI 136' o
 * 'T. 319 V' y con un teclado de números serían imposibles de escribir.
 */
function AltaManual({
  inicial,
  existentes,
  onCancelar,
  onCreada,
}: {
  inicial: string;
  /** Las ovejas ya cargadas en la temporada, para frenar el duplicado acá.
      Sin este freno, el `unique (temporada, caravana)` del servidor lo rechaza
      igual — pero recién en la bandeja de rechazos, con la oveja ya lejos. */
  existentes: readonly Fila[];
  onCancelar: () => void;
  onCreada: (oveja: OvejaElegida) => void;
}) {
  const usuarioId = useUsuarioId();
  const [caravana, setCaravana] = useState(inicial);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limpia = caravana.trim();
  const repetida = existentes.some((o) => o.caravana === limpia);

  async function crear() {
    if (limpia === '' || repetida) return;
    setCreando(true);
    setError(null);

    try {
      const id = crypto.randomUUID();
      const ahora = new Date().toISOString();

      await db.execute(
        `INSERT INTO ovejas
           (id, temporada, caravana, precargada, creado_en, actualizado_en, actualizado_por, dispositivo)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
        [id, entorno.temporada, limpia, ahora, ahora, usuarioId, dispositivo()],
      );

      onCreada({ id, caravana: limpia });
    } catch (falla) {
      // Escribir en la réplica local casi no puede fallar — pero si falla, un
      // botón muerto sin explicación es la peor respuesta posible con la
      // oveja delante.
      setError(falla instanceof Error ? falla.message : 'No se pudo guardar la oveja.');
      setCreando(false);
    }
  }

  return (
    <>
      <label className="etiqueta" htmlFor="caravana-nueva">
        Caravana nueva
      </label>
      <input
        id="caravana-nueva"
        className="entrada entrada--cifra"
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        placeholder="PI 136"
        value={caravana}
        onChange={(e) => setCaravana(e.target.value)}
      />

      {repetida ? (
        <p className="aviso aviso--atencion" style={{ marginTop: 'var(--sp-3)' }}>
          La caravana <strong>{limpia}</strong> ya está en la lista de la temporada. Volvé al
          buscador y elegila de ahí.
        </p>
      ) : (
        <p className="aviso aviso--atencion" style={{ marginTop: 'var(--sp-3)' }}>
          Escribila tal cual figura en la caravana. Queda marcada para revisar desde la web
          antes de cerrar la temporada.
        </p>
      )}

      {error !== null && (
        <p className="aviso aviso--error" style={{ marginTop: 'var(--sp-3)' }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <button
          type="button"
          className="boton boton--secundario"
          style={{ flex: '0 0 38%' }}
          onClick={onCancelar}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="boton boton--principal"
          style={{ flex: 1 }}
          onClick={crear}
          disabled={creando || limpia === '' || repetida}
        >
          Agregar
        </button>
      </div>
    </>
  );
}
