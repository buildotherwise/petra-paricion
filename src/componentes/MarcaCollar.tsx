import type { MarcaCollar as Marca } from '../lib/reglas';

export const MARCAS: readonly { valor: Marca; etiqueta: string }[] = [
  { valor: 'punto_arriba', etiqueta: 'Punto arriba' },
  { valor: 'cruz_al_medio', etiqueta: 'Cruz al medio' },
  { valor: 'punto_abajo', etiqueta: 'Punto abajo' },
];

/**
 * La marca del collar, dibujada donde está físicamente.
 *
 * En la marca de un collar la POSICIÓN es el dato: "punto arriba" y "punto
 * abajo" son el mismo punto en distinto lugar. Un desplegable con tres textos
 * obliga a traducir del objeto a la palabra y de vuelta, con el collar en una
 * mano y el teléfono en la otra. Dibujarlo elimina esa traducción.
 */
export function DibujoMarca({ marca, tamano = 1 }: { marca: Marca; tamano?: number }) {
  return (
    <svg
      width={44 * tamano}
      height={68 * tamano}
      viewBox="0 0 44 68"
      role="img"
      aria-label={MARCAS.find((m) => m.valor === marca)?.etiqueta ?? marca}
    >
      <rect
        x="7"
        y="3"
        width="30"
        height="62"
        rx="7"
        fill="var(--surface)"
        stroke="var(--ink)"
        strokeWidth="2.5"
      />
      {marca === 'punto_arriba' && <circle cx="22" cy="16" r="6.5" fill="var(--ink)" />}
      {marca === 'punto_abajo' && <circle cx="22" cy="52" r="6.5" fill="var(--ink)" />}
      {marca === 'cruz_al_medio' && (
        <g stroke="var(--ink)" strokeWidth="4.5" strokeLinecap="round">
          <line x1="14" y1="27" x2="30" y2="41" />
          <line x1="30" y1="27" x2="14" y2="41" />
        </g>
      )}
    </svg>
  );
}

export function SelectorMarcaCollar({
  valor,
  onChange,
}: {
  valor: Marca | null;
  onChange: (marca: Marca) => void;
}) {
  return (
    <div className="collar-opciones">
      {MARCAS.map((marca) => (
        <button
          key={marca.valor}
          type="button"
          className="collar-opcion"
          aria-pressed={valor === marca.valor}
          onClick={() => onChange(marca.valor)}
        >
          <DibujoMarca marca={marca.valor} />
          <span>{marca.etiqueta}</span>
        </button>
      ))}
    </div>
  );
}
