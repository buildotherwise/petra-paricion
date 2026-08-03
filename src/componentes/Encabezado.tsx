import { IndicadorSync } from './IndicadorSync';
import { useNavegacion } from '../lib/navegacion';

export function Encabezado({ atras }: { atras?: (() => void) | undefined }) {
  const { pantalla, ir } = useNavegacion();

  // Desde la propia bandeja la pastilla no lleva a ningún lado: ya se está ahí.
  const verRechazados =
    pantalla.nombre === 'rechazados' ? undefined : () => ir({ nombre: 'rechazados' });

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
        /* El emblema recortado, no el ícono de la PWA: ese es el logo entero
           —medallón y lettering— comprimido en un cuadrado, y a 30 px las dos
           líneas de texto quedan en menos de tres píxeles de alto. */
        <div className="marca">
          <img src="/emblema.png" alt="" />
          <span className="marca-lockup">
            <b>Petra</b>
            <small>Merino Australiano</small>
          </span>
        </div>
      )}
      <IndicadorSync onVerRechazados={verRechazados} />
    </header>
  );
}
