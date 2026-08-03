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
  tinta,
}: {
  marca: Marca;
  tamano?: number;
  apagado?: boolean;
  /** Sobreescribe el color; lo usa la chapa del collar, que va sobre champán. */
  tinta?: string;
}) {
  const color = tinta ?? (apagado ? 'var(--tinta-tenue)' : 'var(--marca)');

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

/**
 * El collar, como la segunda chapa que se lee en el animal.
 *
 * La caravana cuelga de la oreja de la madre; el collar va en el cuello y lo
 * llevan la madre y todos los hermanos. Son dos objetos distintos y por eso se
 * ven distintos: la caravana en el amarillo real de las caravanas, el collar en
 * champán.
 *
 * La marca va dibujada ADENTRO de la pastilla, junto al número, porque «collar
 * 12, punto arriba» es una sola cosa: sin la marca, el número no distingue a un
 * hermano de otro, y sin el número, en un potrero con tres collares puestos la
 * marca tampoco alcanza.
 *
 * Va donde se compara contra el animal —señalar, elegir el hermano, las dos
 * fichas— y no en las listas de búsqueda, donde el collar ya está como texto y
 * ahí está bien: esas pantallas se miran sin el cordero en la mano.
 */
export function Collar({
  numero,
  marca,
  grande = false,
}: {
  numero: string;
  marca?: Marca | null;
  grande?: boolean;
}) {
  return (
    <span className={grande ? 'collar-chapa collar-chapa--grande' : 'collar-chapa'}>
      {marca != null && (
        <DibujoMarca marca={marca} tamano={grande ? 0.5 : 0.42} tinta="var(--marca-press)" />
      )}
      <b>Collar {numero}</b>
    </span>
  );
}

export function SelectorMarcaCollar({
  valor,
  ocupadas = [],
  onChange,
}: {
  valor: Marca | null;
  /** Marcas que ya lleva un hermano. Se muestran, pero no se pueden elegir. */
  ocupadas?: readonly Marca[];
  onChange: (marca: Marca) => void;
}) {
  return (
    <div className="collar-opciones">
      {MARCAS.map((marca) => {
        const elegida = valor === marca.valor;
        const tomada = ocupadas.includes(marca.valor);
        return (
          <button
            key={marca.valor}
            type="button"
            className="collar-opcion"
            aria-pressed={elegida}
            disabled={tomada}
            onClick={() => onChange(marca.valor)}
          >
            <DibujoMarca marca={marca.valor} apagado={!elegida} />
            <span>{marca.etiqueta}</span>
            {/* Mostrarla en gris en vez de esconderla mantiene las tres en el
                mismo lugar: el dedo no aprende una posición que después cambia. */}
            {tomada && <em>en uso</em>}
          </button>
        );
      })}
    </div>
  );
}
