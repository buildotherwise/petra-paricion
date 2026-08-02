import type { ReactNode } from 'react';
import { DibujoMarca } from './MarcaCollar';
import { CAUSAS_MUERTE, type CausaMuerte, type MarcaCollar } from '../lib/reglas';

/**
 * Un cordero en una lista.
 *
 * Lo usan el alta —donde la fila se edita y se quita— y las fichas —donde se
 * abre—. Lo que comparten es lo que se lee de un vistazo: la marca del collar
 * dibujada, el sexo y el peso. La línea de abajo la arma cada pantalla, porque
 * ahí sí dicen cosas distintas.
 */

export interface CorderoDeFila {
  sexo: 'macho' | 'hembra' | null;
  peso_kg: number | null;
  collar_marca: MarcaCollar | null;
}

export type TonoChip = 'muerto' | 'anulado';

/** '4.2' → '4,20 kg'. Sin peso dice "sin pesar", no cero (R5). */
export function pesoLegible(peso: number | null): string {
  return peso !== null ? `${peso.toFixed(2).replace('.', ',')} kg` : 'sin pesar';
}

export function causaLegible(causa: CausaMuerte | string | null): string | null {
  if (causa === null) return null;
  return CAUSAS_MUERTE.find((c) => c.valor === causa)?.etiqueta ?? null;
}

export function sexoLegible(sexo: string | null): string {
  return sexo === 'macho' ? 'Macho' : sexo === 'hembra' ? 'Hembra' : 'Sin sexo';
}

export function FilaCordero({
  cordero,
  detalle,
  chip,
  atenuada = false,
  onAbrir,
  onEditar,
  onQuitar,
}: {
  cordero: CorderoDeFila;
  /** La línea chica: cada pantalla decide qué es lo que importa ahí. */
  detalle: ReactNode;
  chip?: { texto: string; tono: TonoChip } | undefined;
  /** Para los muertos y los anulados: siguen a la vista, pero en segundo plano. */
  atenuada?: boolean;
  onAbrir?: (() => void) | undefined;
  onEditar?: (() => void) | undefined;
  onQuitar?: (() => void) | undefined;
}) {
  const contenido = (
    <>
      {cordero.collar_marca !== null && <DibujoMarca marca={cordero.collar_marca} tamano={0.62} />}
      <div className="cordero-datos">
        <strong>
          {sexoLegible(cordero.sexo)} · {pesoLegible(cordero.peso_kg)}
        </strong>
        <small>{detalle}</small>
      </div>
      {chip !== undefined && <span className={`chip chip--${chip.tono}`}>{chip.texto}</span>}
    </>
  );

  // Con onAbrir la fila entera es el objetivo: con guantes, un chevrón de 12px
  // no se acierta.
  if (onAbrir !== undefined) {
    return (
      <button
        type="button"
        className={`cordero-fila cordero-fila--abrible${atenuada ? ' cordero-fila--atenuada' : ''}`}
        onClick={onAbrir}
      >
        {contenido}
        <span className="cordero-chevron" aria-hidden="true">
          ›
        </span>
      </button>
    );
  }

  return (
    <div className={`cordero-fila${atenuada ? ' cordero-fila--atenuada' : ''}`}>
      {contenido}
      {onEditar !== undefined && (
        <button type="button" className="boton--texto" onClick={onEditar}>
          Editar
        </button>
      )}
      {onQuitar !== undefined && (
        <button type="button" className="boton--texto boton--peligro" onClick={onQuitar}>
          Quitar
        </button>
      )}
    </div>
  );
}
