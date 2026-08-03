import { useQuery } from '@powersync/react';
import { IndicadorSync } from '../../componentes/IndicadorSync';
import { entorno } from '../../lib/entorno';
import type { SeccionAdmin } from '../../lib/navegacion';
import type { Perfil } from '../../lib/powersync/esquema';
import { TablaPartos } from './TablaPartos';
import '../../estilos/admin.css';

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
  { clave: 'exportar', titulo: 'Exportar' },
];

export default function WebAdmin({
  seccion,
  perfil,
  onSeccion,
  onSalirAlCampo,
  onVerRechazados,
  onAbrirParto,
}: {
  seccion: SeccionAdmin;
  perfil: Perfil;
  onSeccion: (seccion: SeccionAdmin) => void;
  onSalirAlCampo: () => void;
  onVerRechazados: () => void;
  onAbrirParto: (partoId: string) => void;
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
          <Seccion seccion={seccion} onAbrirParto={onAbrirParto} />
        </main>
      </div>
    </div>
  );
}

const TITULOS: Record<SeccionAdmin, string> = {
  partos: 'Partos',
  corderos: 'Corderos',
  revision: 'Revisión',
  exportar: 'Exportar',
};

function Seccion({
  seccion,
  onAbrirParto,
}: {
  seccion: SeccionAdmin;
  onAbrirParto: (partoId: string) => void;
}) {
  return (
    <>
      <h1 className="admin-titulo">{TITULOS[seccion]}</h1>
      <p className="admin-bajada">
        Temporada {entorno.temporada} · lo que este navegador tiene sincronizado
      </p>
      {seccion === 'partos' ? (
        <TablaPartos onAbrir={onAbrirParto} />
      ) : (
        <p className="admin-espera">Todavía no está construida.</p>
      )}
    </>
  );
}
