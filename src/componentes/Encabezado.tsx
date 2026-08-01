import { IndicadorSync } from './IndicadorSync';

export function Encabezado({ atras }: { atras?: (() => void) | undefined }) {
  return (
    <header className="encabezado">
      <div className="marca">
        {atras !== undefined ? (
          <button
            type="button"
            className="boton--texto"
            onClick={atras}
            style={{ color: 'var(--tag)', textDecoration: 'none', padding: 0, minHeight: 'auto' }}
            aria-label="Volver"
          >
            ‹ Volver
          </button>
        ) : (
          // Solo el emblema. El logotipo ya contiene el lettering, y en 390px
          // el texto se truncaba robándole lugar al indicador de sync — que es
          // lo único que no puede quedar a medias.
          <img src="/icono-192.png" alt="Petra · Merino Australiano" />
        )}
      </div>
      <IndicadorSync />
    </header>
  );
}
