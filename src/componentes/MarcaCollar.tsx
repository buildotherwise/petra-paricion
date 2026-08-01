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
export function DibujoMarca({
  marca,
  tamano = 1,
  apagado = false,
}: {
  marca: Marca;
  tamano?: number;
  apagado?: boolean;
}) {
  const color = apagado ? 'var(--tinta-tenue)' : 'var(--marca)';

  return (
    <svg
      width={30 * tamano}
      height={48 * tamano}
      viewBox="0 0 30 48"
      role="img"
      aria-label={MARCAS.find((m) => m.valor === marca)?.etiqueta ?? marca}
    >
      <rect
        x="4"
        y="2"
        width="22"
        height="44"
        rx="7"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
      />
      {marca === 'punto_arriba' && <circle cx="15" cy="12" r="4.8" fill={color} />}
      {marca === 'punto_abajo' && <circle cx="15" cy="36" r="4.8" fill={color} />}
      {marca === 'cruz_al_medio' && (
        <g stroke={color} strokeWidth="3.2" strokeLinecap="round">
          <line x1="9" y1="19" x2="21" y2="29" />
          <line x1="21" y1="19" x2="9" y2="29" />
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
      {MARCAS.map((marca) => {
        const elegida = valor === marca.valor;
        return (
          <button
            key={marca.valor}
            type="button"
            className="collar-opcion"
            aria-pressed={elegida}
            onClick={() => onChange(marca.valor)}
          >
            <DibujoMarca marca={marca.valor} apagado={!elegida} />
            <span>{marca.etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
