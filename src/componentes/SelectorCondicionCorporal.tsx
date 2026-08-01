const ENTEROS = [
  { valor: 1, descripcion: 'muy flaca' },
  { valor: 2, descripcion: 'flaca' },
  { valor: 3, descripcion: 'normal' },
  { valor: 4, descripcion: 'gorda' },
  { valor: 5, descripcion: 'muy gorda' },
] as const;

const CUARTOS = [0, 0.25, 0.5, 0.75] as const;

/**
 * Condición corporal de la madre (R4): dos toques, entero y después cuarto.
 *
 * La escala se registra en CUARTOS, no en enteros. Los 495 partos de 2025 usan
 * 1,75 · 2 · 2,25 · 2,5 · 2,75 · 3 · 3,25 · 3,5 — pedir solo enteros perdería
 * la granularidad que el equipo ya viene usando y rompería la comparabilidad
 * entre temporadas.
 */
export function SelectorCondicionCorporal({
  valor,
  onChange,
}: {
  valor: number | null;
  onChange: (valor: number) => void;
}) {
  const entero = valor === null ? null : Math.floor(valor);
  const cuarto = valor === null || entero === null ? null : Number((valor - entero).toFixed(2));

  return (
    <div>
      <div className="opciones" style={{ '--columnas': 5 } as React.CSSProperties}>
        {ENTEROS.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            className="opcion"
            aria-pressed={entero === opcion.valor}
            onClick={() => onChange(opcion.valor + (cuarto ?? 0))}
          >
            {opcion.valor}
            <small>{opcion.descripcion}</small>
          </button>
        ))}
      </div>

      {entero !== null && (
        <div
          className="opciones"
          style={{ '--columnas': 4, marginTop: 'var(--sp-2)' } as React.CSSProperties}
        >
          {CUARTOS.map((fraccion) => (
            <button
              key={fraccion}
              type="button"
              className="opcion"
              aria-pressed={cuarto === fraccion}
              onClick={() => onChange(entero + fraccion)}
            >
              {formatearCuarto(fraccion)}
            </button>
          ))}
        </div>
      )}

      {valor !== null && (
        <p
          style={{
            marginTop: 'var(--sp-3)',
            marginBottom: 0,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
          }}
        >
          Condición corporal: {formatearCondicion(valor)}
        </p>
      )}
    </div>
  );
}

function formatearCuarto(fraccion: number): string {
  return fraccion === 0 ? ',00' : `,${String(fraccion * 100)}`;
}

export function formatearCondicion(valor: number): string {
  return valor.toFixed(2).replace('.', ',');
}
