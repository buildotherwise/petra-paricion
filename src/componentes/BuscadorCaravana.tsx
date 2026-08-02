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
  anotarParto = false,
  onElegir,
}: {
  autoFocus?: boolean;
  /** Oveja que no debe ofrecerse (la madre biológica no puede ser su propia nodriza). */
  excluirId?: string | undefined;
  /** Marca las ovejas que ya tienen parto. Solo tiene sentido al elegir la madre. */
  anotarParto?: boolean;
  onElegir: (oveja: OvejaElegida) => void;
}) {
  const [consulta, setConsulta] = useState('');
  const [altaManual, setAltaManual] = useState(false);

  // Se traen las ~500 madres de la temporada y se filtra en memoria. El costo
  // es despreciable y a cambio la búsqueda llega a las caravanas alfanuméricas
  // (ver src/lib/busqueda.ts), cosa que un LIKE no logra.
  const { data: ovejas } = useQuery<Fila>(
    `SELECT o.id, o.caravana, p.id AS parto_id
       FROM ovejas o
       LEFT JOIN partos p ON p.oveja_id = o.id
      WHERE o.temporada = ?`,
    [entorno.temporada],
  );

  const resultados = useMemo(
    () => buscarCaravana(ovejas.filter((o) => o.id !== excluirId), consulta).slice(0, 12),
    [ovejas, consulta, excluirId],
  );

  if (altaManual) {
    return (
      <AltaManual
        inicial={consulta}
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

      {resultados.length > 0 && (
        <ul className="lista" style={{ marginTop: 'var(--sp-3)' }}>
          {resultados.map((fila) => {
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
                  {anotarParto && fila.parto_id !== null && (
                    <span className="nota nota--alerta">Ya tiene parto</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {consulta.trim() !== '' && resultados.length === 0 && (
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
  onCancelar,
  onCreada,
}: {
  inicial: string;
  onCancelar: () => void;
  onCreada: (oveja: OvejaElegida) => void;
}) {
  const usuarioId = useUsuarioId();
  const [caravana, setCaravana] = useState(inicial);
  const [creando, setCreando] = useState(false);

  async function crear() {
    const limpia = caravana.trim();
    if (limpia === '') return;
    setCreando(true);

    const id = crypto.randomUUID();
    const ahora = new Date().toISOString();

    await db.execute(
      `INSERT INTO ovejas
         (id, temporada, caravana, precargada, creado_en, actualizado_en, actualizado_por, dispositivo)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
      [id, entorno.temporada, limpia, ahora, ahora, usuarioId, dispositivo()],
    );

    onCreada({ id, caravana: limpia });
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

      <p className="aviso aviso--atencion" style={{ marginTop: 'var(--sp-3)' }}>
        Escribila tal cual figura en la caravana. Queda marcada para revisar desde la web
        antes de cerrar la temporada.
      </p>

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
          disabled={creando || caravana.trim() === ''}
        >
          Agregar
        </button>
      </div>
    </>
  );
}
