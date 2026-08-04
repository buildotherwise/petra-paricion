import { lazy, Suspense } from 'react';
import { useQuery } from '@powersync/react';
import { IndicadorSync } from '../../componentes/IndicadorSync';
import { entorno } from '../../lib/entorno';
import type { SeccionAdmin } from '../../lib/navegacion';
import type { Perfil } from '../../lib/powersync/esquema';
import { TablaPartos } from './TablaPartos';
import { TablaCorderos } from './TablaCorderos';
import { Revision } from './Revision';
import { Exportar } from './Exportar';
import '../../estilos/admin.css';

/**
 * El tablero va detrás de su propio `lazy()`, anidado dentro del chunk admin.
 *
 * No es por el peso de la pantalla sino por el de Recharts: son ~400 kB que solo
 * hacen falta acá. Workbox precachea `**\/*.js`, así que sin este corte los
 * cinco aparatos del campo se los bajarían para una sección que ni siquiera
 * pueden abrir. El `globIgnores` de vite.config.ts lo saca del precache, y para
 * eso necesita que el chunk exista y se llame `Tablero-*`.
 */
const Tablero = lazy(() => import('./Tablero'));

/**
 * El armazón de la web admin.
 *
 * Cuatro secciones fijas en una barra lateral, cada una con su número al lado.
 * La lateral se eligió sobre las pestañas por ese número y no por gusto: si hay
 * siete cosas para revisar, el siete tiene que verse desde cualquier sección, y
 * una fila de pestañas es el lugar donde menos se mira de toda la pantalla.
 *
 * Lleva el mismo `IndicadorSync` que el campo, con su pastilla roja. No es
 * decoración: la web existe para corregir, y una corrección que viola un CHECK
 * se descarta sin decir nada en pantalla —`clasificarErrorSubida` la trata como
 * error de dato— y termina en la bandeja de rechazados de ESTE navegador, que
 * es la única copia que queda.
 */

interface Contadores {
  partos: number;
  corderos: number;
}

const SECCIONES: readonly { clave: SeccionAdmin; titulo: string }[] = [
  { clave: 'partos', titulo: 'Partos' },
  { clave: 'corderos', titulo: 'Corderos' },
  { clave: 'revision', titulo: 'Revisión' },
  { clave: 'tableros', titulo: 'Tableros' },
  { clave: 'exportar', titulo: 'Exportar' },
];

export default function WebAdmin({
  seccion,
  perfil,
  onSeccion,
  onSalirAlCampo,
  onVerRechazados,
  onAbrirParto,
  onAbrirCordero,
}: {
  seccion: SeccionAdmin;
  perfil: Perfil;
  onSeccion: (seccion: SeccionAdmin) => void;
  onSalirAlCampo: () => void;
  onVerRechazados: () => void;
  onAbrirParto: (partoId: string) => void;
  onAbrirCordero: (corderoId: string) => void;
}) {
  const { data } = useQuery<Contadores>(
    `SELECT
       (SELECT count() FROM partos p
          JOIN ovejas o ON o.id = p.oveja_id
        WHERE o.temporada = ?)                                      AS partos,
       (SELECT count() FROM corderos
        WHERE temporada = ? AND anulado_en IS NULL)                 AS corderos`,
    [entorno.temporada, entorno.temporada],
  );

  const contadores = data[0];
  const cuentaDe = (clave: SeccionAdmin): number | null => {
    if (clave === 'partos') return contadores?.partos ?? null;
    if (clave === 'corderos') return contadores?.corderos ?? null;
    return null;
  };

  return (
    <div className="admin">
      <div className="admin-barra">
        <div className="admin-marca">
          <img src="/emblema.png" alt="" />
          <div>
            <div className="nombre">Petra</div>
            <div className="raza">Merino Australiano</div>
          </div>
        </div>
        <span className="admin-temporada">TEMPORADA {entorno.temporada}</span>
        <span className="empuje" />
        <IndicadorSync onVerRechazados={onVerRechazados} />
        <span className="admin-quien">{perfil.nombre}</span>
      </div>

      <p className="admin-angosto">
        Pensada para pantalla grande. Las tablas se pueden mover de costado.
      </p>

      <div className="admin-marco">
        <nav className="admin-lateral">
          {SECCIONES.map(({ clave, titulo }) => {
            const cuenta = cuentaDe(clave);
            return (
              <button
                key={clave}
                type="button"
                aria-current={clave === seccion ? 'page' : undefined}
                onClick={() => onSeccion(clave)}
              >
                <span>{titulo}</span>
                {cuenta !== null && <span className="cuenta">{cuenta}</span>}
              </button>
            );
          })}

          <div className="salida">
            <button type="button" onClick={onSalirAlCampo}>
              <span>← A la app de campo</span>
            </button>
          </div>
        </nav>

        <main className="admin-lienzo">
          <Seccion
            seccion={seccion}
            onAbrirParto={onAbrirParto}
            onAbrirCordero={onAbrirCordero}
          />
        </main>
      </div>
    </div>
  );
}

const TITULOS: Record<SeccionAdmin, string> = {
  partos: 'Partos',
  corderos: 'Corderos',
  revision: 'Revisión',
  tableros: 'Tableros',
  exportar: 'Exportar',
};

function Seccion({
  seccion,
  onAbrirParto,
  onAbrirCordero,
}: {
  seccion: SeccionAdmin;
  onAbrirParto: (partoId: string) => void;
  onAbrirCordero: (corderoId: string) => void;
}) {
  return (
    <>
      <h1 className="admin-titulo">{TITULOS[seccion]}</h1>
      {/* Los tableros son la única sección que no sale de la réplica, así que
          es la única que no puede prometer «lo sincronizado». Va sin bajada:
          decirlo cada vez es explicarle la arquitectura a quien vino a mirar
          cómo viene la parición. */}
      <p className="admin-bajada">
        Temporada {entorno.temporada}
        {seccion !== 'tableros' && ' · lo que este navegador tiene sincronizado'}
      </p>
      {seccion === 'partos' && <TablaPartos onAbrir={onAbrirParto} />}
      {seccion === 'corderos' && <TablaCorderos onAbrir={onAbrirCordero} />}
      {seccion === 'revision' && (
        <Revision onAbrirParto={onAbrirParto} onAbrirCordero={onAbrirCordero} />
      )}
      {seccion === 'tableros' && (
        <Suspense fallback={<p className="admin-espera">Cargando los tableros…</p>}>
          <Tablero />
        </Suspense>
      )}
      {seccion === 'exportar' && <Exportar />}
    </>
  );
}
