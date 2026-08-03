import { useQuery } from '@powersync/react';
import { Encabezado } from '../componentes/Encabezado';
import { Caravana } from '../componentes/Caravana';
import { FilaCordero } from '../componentes/FilaCordero';
import { diaCorto, nombreTipo } from '../lib/parto';
import { puedeSenalar } from '../lib/reglas';
import { nombreMarca, useCorderosDelParto } from './FichaParto';
import { antiguedad } from './Senalada';

/**
 * Cuál de los hermanos tenés en la mano.
 *
 * Solo aparece en partos múltiples: en un único la caravana lleva a un solo
 * cordero y esta pantalla sería un toque que dice lo que ya se sabe.
 *
 * Lo que distingue a los hermanos es la marca del collar, y va dibujada porque
 * en un collar la POSICIÓN es el dato: «punto arriba» y «punto abajo» son el
 * mismo punto en distinto lugar. Traducir del objeto a la palabra y de vuelta,
 * con el cordero sujeto entre las piernas, es donde nacen los errores.
 *
 * Los ya señalados se quedan en la lista, apagados y con su tatuaje: es la
 * única forma de ver si al parto le falta uno.
 */

interface Cabecera {
  caravana: string;
  fecha: string;
  collar_numero: string | null;
}

/** De arriba hacia abajo, como están en el collar. Sin marca, al final. */
const ORDEN_MARCA = ['punto_arriba', 'cruz_al_medio', 'punto_abajo'];

function ordenMarca(marca: string | null): number {
  const i = marca === null ? -1 : ORDEN_MARCA.indexOf(marca);
  return i === -1 ? ORDEN_MARCA.length : i;
}

export function SenalarParto({
  partoId,
  onVolver,
  onSenalar,
  onAbrirCordero,
}: {
  partoId: string;
  onVolver: () => void;
  onSenalar: (corderoId: string) => void;
  onAbrirCordero: (corderoId: string) => void;
}) {
  const { data: cabeceras } = useQuery<Cabecera>(
    `SELECT o.caravana, p.fecha, p.collar_numero
       FROM partos p JOIN ovejas o ON o.id = p.oveja_id
      WHERE p.id = ?`,
    [partoId],
  );
  const hermanos = useCorderosDelParto(partoId);
  const parto = cabeceras[0];

  if (parto === undefined) {
    return (
      <div className="app">
        <Encabezado atras={onVolver} />
        <main className="contenido area-segura">
          <h1 className="titulo">Parto no encontrado</h1>
        </main>
      </div>
    );
  }

  // Los anulados no existieron: no cuentan para el tipo de nacimiento (R1) ni
  // pasan por la señalada.
  //
  // El orden es el de las marcas en el collar —arriba, medio, abajo— y no el de
  // carga: los hermanos se cargan en la misma transacción y comparten
  // `creado_en` al milisegundo, así que sin esto el orden lo decide el UUID y
  // la lista sale distinta cada vez. Acá el orden es el del objeto que se está
  // mirando.
  const activos = [...hermanos]
    .filter((h) => h.anulado_en === null)
    .sort((a, b) => ordenMarca(a.collar_marca) - ordenMarca(b.collar_marca));
  const pendientes = activos.filter((h) => puedeSenalar(h).puede);

  return (
    <div className="app">
      <Encabezado atras={onVolver} />

      <main className="contenido area-segura">
        <h1 className="titulo">
          <Caravana numero={parto.caravana} grande />
        </h1>
        <p className="subtitulo">
          {nombreTipo(activos.length)}
          {parto.collar_numero !== null && ` · collar ${parto.collar_numero}`} · nacidos el{' '}
          {diaCorto(parto.fecha)} · {antiguedad(parto.fecha)}
        </p>

        <p className="etiqueta">{pendientes.length > 0 ? '¿Cuál tenés?' : 'Corderos'}</p>

        <div className="tarjeta">
          {activos.map((hermano) => {
            const permiso = puedeSenalar(hermano);
            return (
              <FilaCordero
                key={hermano.id}
                cordero={hermano}
                atenuada={!permiso.puede}
                detalle={
                  hermano.collar_marca !== null
                    ? nombreMarca(hermano.collar_marca)
                    : hermano.estado === 'muerto'
                      ? 'Muerto'
                      : 'Sin collar'
                }
                chip={
                  hermano.estado === 'senalado' && hermano.tatuaje !== null
                    ? { texto: hermano.tatuaje, tono: 'senalado' }
                    : hermano.estado === 'muerto'
                      ? { texto: 'Muerto', tono: 'muerto' }
                      : undefined
                }
                // Un cordero que no se puede señalar igual se puede abrir: si
                // alguien lo toca es porque quiere saber qué le pasó.
                onAbrir={() => (permiso.puede ? onSenalar(hermano.id) : onAbrirCordero(hermano.id))}
              />
            );
          })}
        </div>

        {parto.collar_numero !== null && pendientes.length > 1 && (
          <p className="aviso">
            El collar {parto.collar_numero} lo llevan la madre y todos los hermanos. Lo que los
            distingue es dónde está la marca.
          </p>
        )}

        {pendientes.length === 0 && (
          <p className="aviso">
            {activos.every((h) => h.estado === 'senalado')
              ? 'Este parto ya está señalado entero.'
              : 'No queda ningún cordero de este parto para señalar.'}
          </p>
        )}
      </main>
    </div>
  );
}
