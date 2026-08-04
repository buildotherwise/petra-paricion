import { Component, Suspense, lazy, useState, type ReactNode } from 'react';
import { Encabezado } from '../componentes/Encabezado';
import { usePerfil } from '../lib/perfil';
import { entorno } from '../lib/entorno';
import { mensajeDeLectura } from '../lib/rechazos';

/**
 * El único import de `Tablero` es dinámico, acá y en `WebAdmin.tsx`. Los dos
 * apuntan al mismo módulo, así que el empaquetador emite un solo chunk
 * `Tablero-*.js` — el que `globIgnores` de vite.config.ts saca del precache.
 * Un import estático desde cualquier lado izaría Recharts al bundle principal
 * y el patrón dejaría de coincidir sin avisar.
 */
const cargarTablero = () => import('./admin/Tablero');

/**
 * El tablero de la web admin, montado como pantalla de campo.
 *
 * Es la misma pieza —mismas ocho tarjetas, mismo chunk— dentro del cascarón del
 * campo: encabezado con Volver, una columna, y la escala tipográfica de
 * `.tablero-campo` en vez de la de escritorio. Es la única pantalla de la app
 * de campo que necesita señal, porque las métricas son vistas de Postgres
 * (CLAUDE.md §9); la bajada lo dice al entrar y cada tarjeta degrada sola.
 *
 * El guard por rol va acá adentro y no solo en el link del inicio:
 * `history.state` sobrevive a un cambio de usuario en la tablet compartida, así
 * que un operador puede aterrizar en esta pantalla con el botón atrás o una
 * recarga, sin haber visto nunca el link.
 */
export function TableroCampo({ onVolver }: { onVolver: () => void }) {
  const perfil = usePerfil();
  // El lazy vive en estado y no en módulo: React.lazy recuerda el rechazo, y
  // reintentar tras un import fallido sin señal necesita una instancia nueva.
  const [Tablero, setTablero] = useState(() => lazy(cargarTablero));

  // El mismo hueco que el resto de las esperas de arranque: no se decide nada
  // con el perfil desconocido (ver PuertaAdmin en App.tsx).
  if (perfil.estado === 'cargando') return <div className="login" />;

  const esAdmin = perfil.estado === 'listo' && perfil.perfil.rol === 'admin';

  return (
    <div className="app">
      <Encabezado atras={onVolver} />
      <main className="contenido area-segura tablero-campo">
        {esAdmin ? (
          <>
            <h1 className="titulo">Cómo viene la parición</h1>
            <p className="subtitulo">
              Temporada {entorno.temporada} · se calcula en el servidor, hace falta señal
            </p>
            <BordeDelChunk reintentar={() => setTablero(() => lazy(cargarTablero))}>
              <Suspense fallback={<p className="subtitulo">Cargando el tablero…</p>}>
                <Tablero />
              </Suspense>
            </BordeDelChunk>
          </>
        ) : (
          <>
            <h1 className="titulo">Esta pantalla es para administradores</h1>
            <p className="subtitulo">
              {perfil.estado === 'sin-perfil'
                ? 'Tu cuenta todavía no está habilitada. Pedile al administrador que la active para poder cargar y ver datos.'
                : 'Tu cuenta está habilitada para el trabajo de campo.'}
            </p>
            <button
              type="button"
              className="boton boton--principal"
              style={{ marginTop: 'var(--sp-5)' }}
              onClick={onVolver}
            >
              Volver al inicio
            </button>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Ataja el rechazo del `import()` del chunk.
 *
 * Sin señal y sin haberlo bajado nunca, el import rechaza — y sin este borde
 * React desmontaría el árbol entero: la app en blanco por tocar un link. No hay
 * otro ErrorBoundary en el repo porque ninguna otra pantalla carga código bajo
 * demanda fuera del precache.
 *
 * El fallback usa solo clases de app.css: las de tablero.css viajan con el
 * chunk que justamente acaba de fallar.
 */
class BordeDelChunk extends Component<
  { reintentar: () => void; children: ReactNode },
  { fallo: boolean }
> {
  state = { fallo: false };

  static getDerivedStateFromError(): { fallo: true } {
    return { fallo: true };
  }

  render(): ReactNode {
    if (!this.state.fallo) return this.props.children;
    return (
      <>
        <p className="subtitulo" style={{ marginTop: 'var(--sp-5)' }}>
          {mensajeDeLectura(undefined, navigator.onLine, 'el tablero')}
        </p>
        <button
          type="button"
          className="boton boton--secundario"
          style={{ marginTop: 'var(--sp-3)' }}
          onClick={() => {
            this.setState({ fallo: false });
            this.props.reintentar();
          }}
        >
          Reintentar
        </button>
      </>
    );
  }
}
