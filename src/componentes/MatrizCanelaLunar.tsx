import { Fragment } from 'react';
import {
  ningunaCanelaNiLunar,
  SIN_CANELA_NI_LUNAR,
  type CanelaLunar,
} from '../lib/reglas';

/**
 * Canela y lunar: dos rasgos por dos ubicaciones, no cuatro preguntas.
 *
 * En Zoho eran cuatro casillas sueltas y las columnas se heredaron así para que
 * los datos sigan siendo comparables entre temporadas. Pero preguntarlas de a
 * una son ocho botones y media pantalla para el caso que casi siempre es «no,
 * no, no, no» — cuatro toques idénticos, cuatrocientas veces por jornada, que
 * es la definición de un campo que se llena sin mirar.
 *
 * La matriz sola no alcanzaba: una casilla apagada no distingue «no tiene» de
 * «todavía no lo miré», y las columnas son `smallint check in (0,1)`, así que
 * hay que escribir un 0 y no un null. Sin esa distinción la app estaría
 * inventando ceros que nadie afirmó.
 *
 * De ahí la barra de arriba. `null` es sin contestar; marcar «Ninguna de las
 * cuatro» es un acto positivo que escribe los cuatro ceros. Un toque para el
 * caso común, las casillas para la excepción.
 */

const FILAS = [
  {
    rasgo: 'Canela',
    vellon: 'canela_vellon',
    noVellon: 'canela_no_vellon',
  },
  {
    rasgo: 'Lunar',
    vellon: 'lunar_vellon',
    noVellon: 'lunar_no_vellon',
  },
] as const;

const COLUMNAS = [
  { clave: 'vellon', titulo: 'En el vellón', enunciado: 'en el vellón' },
  { clave: 'noVellon', titulo: 'Fuera del vellón', enunciado: 'fuera del vellón' },
] as const;

export function MatrizCanelaLunar({
  valor,
  onChange,
  faltante = false,
}: {
  valor: CanelaLunar | null;
  onChange: (valor: CanelaLunar | null) => void;
  /** Se intentó guardar y este campo estaba sin contestar. */
  faltante?: boolean;
}) {
  const ninguna = valor !== null && ningunaCanelaNiLunar(valor);

  // Volver a tocar «Ninguna» devuelve el campo a sin contestar, para que no
  // haya forma de dejarlo afirmado por accidente y sin salida.
  const alternarNinguna = () => onChange(ninguna ? null : SIN_CANELA_NI_LUNAR);

  const alternarCasilla = (campo: keyof CanelaLunar) => {
    const base = valor ?? SIN_CANELA_NI_LUNAR;
    onChange({ ...base, [campo]: base[campo] === 1 ? 0 : 1 });
  };

  return (
    <div>
      <button
        type="button"
        className="matriz-ninguna"
        aria-pressed={ninguna}
        data-faltante={faltante || undefined}
        onClick={alternarNinguna}
      >
        <span>Ninguna de las cuatro</span>
        <span aria-hidden="true">✓</span>
      </button>

      <div className="matriz" role="group" aria-label="Canela y lunar">
        <span />
        {COLUMNAS.map((columna) => (
          <span key={columna.clave} className="matriz-cabecera">
            {columna.titulo}
          </span>
        ))}

        {FILAS.map((fila) => (
          <Fragment key={fila.rasgo}>
            <span className="matriz-rasgo">{fila.rasgo}</span>
            {COLUMNAS.map((columna) => {
              const campo = fila[columna.clave];
              const encendida = valor?.[campo] === 1;
              return (
                <button
                  key={campo}
                  type="button"
                  className="matriz-casilla"
                  aria-pressed={encendida}
                  aria-label={`${fila.rasgo} ${columna.enunciado}`}
                  data-faltante={faltante || undefined}
                  onClick={() => alternarCasilla(campo)}
                >
                  <span aria-hidden="true">{encendida ? '✓' : '·'}</span>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** 'Ninguna' · 'Canela fuera del vellón' · 'Canela en el vellón y lunar fuera'. */
export function describirCanelaLunar(valor: CanelaLunar): string {
  if (ningunaCanelaNiLunar(valor)) return 'Ninguna';

  const partes: string[] = [];
  for (const fila of FILAS) {
    for (const columna of COLUMNAS) {
      if (valor[fila[columna.clave]] === 1) {
        partes.push(`${fila.rasgo.toLowerCase()} ${columna.enunciado}`);
      }
    }
  }

  const texto = partes.join(', ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
