import { IndicadorSync } from './IndicadorSync';

export function Encabezado({ atras }: { atras?: (() => void) | undefined }) {
  return (
    <header className="encabezado">
      {atras !== undefined ? (
        <button type="button" className="volver" onClick={atras}>
          <svg width="9" height="15" viewBox="0 0 9 15" aria-hidden="true">
            <path
              d="M8 1 1.5 7.5 8 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Volver
        </button>
      ) : (
        <div className="marca">
          <img src="/icono-192.png" alt="" />
          <span className="marca-nombre">Petra</span>
        </div>
      )}
      <IndicadorSync />
    </header>
  );
}
