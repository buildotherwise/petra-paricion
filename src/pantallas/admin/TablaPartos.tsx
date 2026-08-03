import { useMemo, useState } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import { Tabla, type Columna } from '../../componentes/admin/Tabla';
import { Caravana } from '../../componentes/Caravana';
import { entorno } from '../../lib/entorno';
import { buscarPorCaravanaOCollar } from '../../lib/busqueda';
import { formatearCondicion } from '../../componentes/SelectorCondicionCorporal';
import { diaCorto, nombreTipo } from '../../lib/parto';

/**
 * Todos los partos de la temporada, en una tabla.
 *
 * El SQL vive acá y no en el componente de tabla: cada pantalla es dueña de su
 * consulta, como el resto del repo. Sale de la réplica local, así que funciona
 * sin señal igual que el teléfono.
 *
 * El tipo de nacimiento se cuenta, nunca se lee de un campo (R1), y los
 * anulados no cuentan (R13) — las dos cosas, en el mismo `filter` que ya usa
 * `partos_resumen`, pero calculadas acá porque la vista no viaja a la réplica.
 */

/**
 * La consulta sobrevive a abrir una ficha y volver.
 *
 * Abrir un parto desmonta la tabla —la ficha ocupa la pantalla entera, que es
 * lo decidido para no tener dos vistas del mismo dato—, así que sin esto
 * «Volver» devuelve a un buscador en blanco. Y el gesto de una sesión de
 * revisión es justamente buscar una caravana, mirarla, volver y mirar la
 * siguiente: retipearla cada vez sería el trabajo.
 *
 * No va en la pila de navegación, que sería el lugar natural, porque eso
 * significa un `replaceState` por tecla y, peor, un re-render del árbol entero
 * por tecla. Con mil doscientos corderos eso se siente.
 *
 * Se pierde al recargar, y está bien: recargar es empezar de nuevo.
 */
let ultimaConsulta = '';

interface FilaParto {
  id: string;
  caravana: string;
  fecha: string;
  collar_numero: string | null;
  condicion_corporal: number | null;
  corderos: number;
  vivos: number;
  senalados: number;
  anulados: number;
  cargado_por: string | null;
}

export function TablaPartos({ onAbrir }: { onAbrir: (partoId: string) => void }) {
  const [consulta, setConsultaLocal] = useState(ultimaConsulta);
  const sincronizacion = useStatus();

  const setConsulta = (texto: string) => {
    ultimaConsulta = texto;
    setConsultaLocal(texto);
  };

  const { data: partos } = useQuery<FilaParto>(
    `SELECT p.id, o.caravana, p.fecha, p.collar_numero, p.condicion_corporal,
            (SELECT count() FROM corderos c
              WHERE c.parto_id = p.id AND c.anulado_en IS NULL)             AS corderos,
            (SELECT count() FROM corderos c
              WHERE c.parto_id = p.id AND c.anulado_en IS NULL
                AND c.condicion = 'vivo')                                   AS vivos,
            (SELECT count() FROM corderos c
              WHERE c.parto_id = p.id AND c.anulado_en IS NULL
                AND c.estado = 'senalado')                                  AS senalados,
            (SELECT count() FROM corderos c
              WHERE c.parto_id = p.id AND c.anulado_en IS NOT NULL)         AS anulados,
            pf.nombre                                                       AS cargado_por
       FROM partos p
       JOIN ovejas o        ON o.id = p.oveja_id
       LEFT JOIN perfiles pf ON pf.id = p.creado_por
      WHERE o.temporada = ?
      ORDER BY p.fecha DESC, o.caravana`,
    [entorno.temporada],
  );

  // El texto libre se filtra en memoria, con la misma función que el campo:
  // que un parto aparezca en una pantalla y no en la otra haría dudar de si es
  // el mismo registro.
  //
  // El guardia no es de más: `buscarCaravana` devuelve vacío con la consulta
  // vacía, a propósito, porque en el teléfono la lista aparece recién cuando se
  // escribe algo. Acá la tabla arranca mostrando todo.
  const buscando = consulta.trim() !== '';
  const filtrados = useMemo(
    () => (buscando ? buscarPorCaravanaOCollar(partos, consulta) : partos),
    [partos, consulta, buscando],
  );

  const columnas: readonly Columna<FilaParto>[] = [
    {
      clave: 'caravana',
      titulo: 'Caravana',
      orden: (f) => f.caravana,
      celda: (f) => <Caravana numero={f.caravana} />,
    },
    {
      clave: 'fecha',
      titulo: 'Fecha',
      orden: (f) => f.fecha,
      celda: (f) => diaCorto(f.fecha),
    },
    {
      clave: 'tipo',
      titulo: 'Tipo',
      orden: (f) => f.corderos,
      celda: (f) =>
        f.corderos === 0 ? (
          // R13 impide llegar acá anulando, así que un parto sin corderos es
          // siempre una carga que el servidor rechazó. Se marca, no se esconde.
          <span className="chip chip--pendiente">Sin corderos</span>
        ) : (
          nombreTipo(f.corderos)
        ),
    },
    { clave: 'vivos', titulo: 'Vivos', tipo: 'numero', orden: (f) => f.vivos },
    { clave: 'senalados', titulo: 'Señalados', tipo: 'numero', orden: (f) => f.senalados },
    {
      clave: 'collar',
      titulo: 'Collar',
      orden: (f) => f.collar_numero,
      celda: (f) => f.collar_numero ?? <span className="apagado">—</span>,
    },
    {
      clave: 'condicion',
      titulo: 'Condición',
      tipo: 'numero',
      orden: (f) => f.condicion_corporal,
      celda: (f) =>
        f.condicion_corporal === null ? (
          <span className="apagado">—</span>
        ) : (
          formatearCondicion(f.condicion_corporal)
        ),
    },
    {
      clave: 'anulados',
      titulo: 'Anulados',
      tipo: 'numero',
      orden: (f) => f.anulados,
      celda: (f) => (f.anulados === 0 ? <span className="apagado">—</span> : f.anulados),
    },
    {
      clave: 'cargo',
      titulo: 'Cargó',
      orden: (f) => f.cargado_por,
      celda: (f) => <span className="apagado">{f.cargado_por ?? '—'}</span>,
    },
  ];

  const corderos = partos.reduce((total, p) => total + p.corderos, 0);

  return (
    <>
      <div className="admin-filtros">
        <input
          type="search"
          className="admin-buscar"
          placeholder="Buscar caravana o collar…"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          aria-label="Buscar por caravana o collar"
        />
        {/* El denominador es lo que evita el malentendido: un «3 partos» solo,
            sin el «de 96», es indistinguible de una temporada floja. */}
        <span className="admin-conteo">
          {consulta === ''
            ? `${partos.length} partos · ${corderos} corderos`
            : `${filtrados.length} de ${partos.length} partos`}
        </span>
      </div>

      <Tabla
        filas={filtrados}
        columnas={columnas}
        claveDe={(f) => f.id}
        onAbrir={(f) => onAbrir(f.id)}
        cargando={!sincronizacion.hasSynced && partos.length === 0}
        vacia={
          consulta === ''
            ? 'Todavía no hay partos cargados en la temporada.'
            : 'Ninguna caravana ni collar coincide.'
        }
        ordenInicial={{ clave: 'fecha', direccion: 'desc' }}
      />
    </>
  );
}
