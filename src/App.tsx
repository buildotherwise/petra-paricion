import { Suspense, lazy } from 'react';
import { PowerSyncContext } from '@powersync/react';
import { db } from './lib/powersync/db';
import { ProveedorSesion, useSesion } from './lib/sesion';
import { ProveedorNavegacion, useNavegacion, type SeccionAdmin } from './lib/navegacion';
import { usePerfil } from './lib/perfil';
import { Login } from './pantallas/Login';
import { Inicio } from './pantallas/Inicio';
import { RegistrarParto } from './pantallas/RegistrarParto';
import { PartosRegistrados } from './pantallas/PartosRegistrados';
import { FichaParto } from './pantallas/FichaParto';
import { FichaCordero } from './pantallas/FichaCordero';
import { Senalada } from './pantallas/Senalada';
import { SenalarParto } from './pantallas/SenalarParto';
import { SenalarCordero } from './pantallas/SenalarCordero';
import { Rechazados } from './pantallas/Rechazados';
import { TableroCampo } from './pantallas/TableroCampo';
import { HistorialDelRegistro } from './componentes/HistorialDelRegistro';

/**
 * La web admin no viaja en el bundle que abre el campo.
 *
 * Ojo con lo que ahorra: Workbox precachea `**​/*.js`, así que el chunk se
 * descarga igual en los teléfonos. Esto ahorra parseo, no descarga — y a cambio
 * la administración funciona sin señal, igual que todo lo demás. Para Recharts,
 * cuando llegue, ese trato deja de convenir y hay que sacarlo del precache.
 */
const WebAdmin = lazy(() => import('./pantallas/admin/WebAdmin'));

function Ruteo() {
  const { pantalla, enAdmin, ir, volver, reemplazar, alInicio } = useNavegacion();

  /**
   * El historial va al pie de las fichas, pero solo en la web.
   *
   * CLAUDE.md §7 lo saca del teléfono a propósito, y la ficha no tiene por qué
   * enterarse de por qué: recibe un nodo y lo pone abajo. Si lo decidiera ella,
   * tendría que conocer el rol y la superficie desde la que se la abrió.
   */
  const historialDe = (tabla: 'partos' | 'corderos', registroId: string) =>
    enAdmin ? <HistorialDelRegistro tabla={tabla} registroId={registroId} /> : undefined;

  switch (pantalla.nombre) {
    case 'registrar-parto':
      return (
        <RegistrarParto
          onSalir={volver}
          // Al guardar se vuelve al inicio y se descarta la pila: repetir el
          // formulario sería ofrecerle cargar el mismo parto de nuevo.
          onGuardado={alInicio}
          onAbrirParto={(partoId) => ir({ nombre: 'ficha-parto', partoId })}
        />
      );

    case 'partos':
      return (
        <PartosRegistrados
          onVolver={volver}
          onAbrir={(partoId) => ir({ nombre: 'ficha-parto', partoId })}
        />
      );

    case 'ficha-parto':
      return (
        <FichaParto
          partoId={pantalla.partoId}
          onVolver={volver}
          onAbrirCordero={(corderoId) => ir({ nombre: 'ficha-cordero', corderoId })}
          pie={historialDe('partos', pantalla.partoId)}
        />
      );

    case 'ficha-cordero':
      return (
        <FichaCordero
          corderoId={pantalla.corderoId}
          onVolver={volver}
          onSenalar={(corderoId) => ir({ nombre: 'senalar-cordero', corderoId })}
          admin={enAdmin}
          pie={historialDe('corderos', pantalla.corderoId)}
        />
      );

    case 'senalada':
      return (
        <Senalada
          onVolver={volver}
          onSenalarParto={(partoId) => ir({ nombre: 'senalar-parto', partoId })}
          onSenalarCordero={(corderoId) => ir({ nombre: 'senalar-cordero', corderoId })}
        />
      );

    case 'senalar-parto':
      return (
        <SenalarParto
          partoId={pantalla.partoId}
          onVolver={volver}
          onSenalar={(corderoId) => ir({ nombre: 'senalar-cordero', corderoId })}
          onAbrirCordero={(corderoId) => ir({ nombre: 'ficha-cordero', corderoId })}
        />
      );

    case 'senalar-cordero':
      return (
        <SenalarCordero
          corderoId={pantalla.corderoId}
          onVolver={volver}
          // Reemplaza en vez de apilar: al terminar el segundo mellizo, «volver»
          // tiene que llevar al parto y no al hermano ya señalado.
          onSenalarOtro={(corderoId) => reemplazar({ nombre: 'senalar-cordero', corderoId })}
          onElegirHermano={(partoId) => reemplazar({ nombre: 'senalar-parto', partoId })}
        />
      );

    case 'rechazados':
      return <Rechazados onVolver={volver} />;

    // Eager a propósito: es un cascarón chico y el peso —Recharts— queda
    // detrás de su lazy interno, en el mismo chunk que usa la web admin.
    case 'tablero':
      return <TableroCampo onVolver={volver} />;

    case 'admin':
      return (
        <PuertaAdmin
          seccion={pantalla.seccion}
          // Cambiar de sección reemplaza en vez de apilar: la lateral es una
          // botonera, no un camino. Si apilara, salir de la administración con
          // el botón atrás pediría deshacer cada clic de la barra.
          onSeccion={(seccion) => reemplazar({ nombre: 'admin', seccion })}
          onSalirAlCampo={alInicio}
          onVerRechazados={() => ir({ nombre: 'rechazados' })}
          // Se apila la ficha que ya existe, sin rehacerla: la web y el
          // teléfono muestran el mismo registro porque son el mismo componente,
          // no porque alguien mantenga dos vistas parecidas.
          onAbrirParto={(partoId) => ir({ nombre: 'ficha-parto', partoId })}
          onAbrirCordero={(corderoId) => ir({ nombre: 'ficha-cordero', corderoId })}
        />
      );

    default:
      return (
        <Inicio
          onRegistrarParto={() => ir({ nombre: 'registrar-parto' })}
          onSenalada={() => ir({ nombre: 'senalada' })}
          onVerPartos={() => ir({ nombre: 'partos' })}
          onAbrirParto={(partoId) => ir({ nombre: 'ficha-parto', partoId })}
          onTablero={() => ir({ nombre: 'tablero' })}
        />
      );
  }
}

/**
 * Quién puede abrir la administración.
 *
 * Por rol, nunca por ancho de pantalla: la tablet Android es el dispositivo
 * principal de captura y en horizontal mide 1024–1280px CSS, así que cualquier
 * umbral que sirva para una laptop se dispara en la tablet y le pone la
 * administración en las manos a quien registra partos a las seis de la mañana.
 *
 * Y no se decide nada mientras el perfil sea desconocido. Un rechazo que
 * parpadea y se convierte en la pantalla buena es peor que medio segundo de
 * espera: parece que la app se equivocó.
 */
function PuertaAdmin({
  seccion,
  onSeccion,
  onSalirAlCampo,
  onVerRechazados,
  onAbrirParto,
  onAbrirCordero,
}: {
  seccion: SeccionAdmin;
  onSeccion: (seccion: SeccionAdmin) => void;
  onSalirAlCampo: () => void;
  onVerRechazados: () => void;
  onAbrirParto: (partoId: string) => void;
  onAbrirCordero: (corderoId: string) => void;
}) {
  const perfil = usePerfil();

  if (perfil.estado === 'cargando') return <Esperando />;

  if (perfil.estado === 'sin-perfil' || perfil.perfil.rol !== 'admin') {
    // Con las clases de app.css a propósito: admin.css viaja en el chunk lazy
    // y esta pantalla es justamente la que se muestra en vez de cargarlo.
    return (
      <div className="app">
        <main className="contenido area-segura">
          <h1 className="titulo">Esta sección es para administradores</h1>
          <p className="subtitulo">
            {perfil.estado === 'sin-perfil'
              ? 'Tu cuenta todavía no está habilitada. Pedile al administrador que la active para poder cargar y ver datos.'
              : 'Tu cuenta está habilitada para el trabajo de campo.'}
          </p>
          <button
            type="button"
            className="boton boton--principal"
            style={{ marginTop: 'var(--sp-5)' }}
            onClick={onSalirAlCampo}
          >
            Ir a la app de campo
          </button>
        </main>
      </div>
    );
  }

  return (
    <Suspense fallback={<Esperando />}>
      <WebAdmin
        seccion={seccion}
        perfil={perfil.perfil}
        onSeccion={onSeccion}
        onSalirAlCampo={onSalirAlCampo}
        onVerRechazados={onVerRechazados}
        onAbrirParto={onAbrirParto}
        onAbrirCordero={onAbrirCordero}
      />
    </Suspense>
  );
}

/**
 * El mismo hueco para las dos esperas —el perfil y el chunk— para que quien
 * mira vea una sola pausa y no dos pantallas distintas encadenadas.
 */
function Esperando() {
  return <div className="login" />;
}

function Puerta() {
  const { sesion, cargando } = useSesion();

  if (cargando) return <div className="login" />;
  if (sesion === null) return <Login />;

  return (
    <ProveedorNavegacion>
      <Ruteo />
    </ProveedorNavegacion>
  );
}

export function App() {
  return (
    <PowerSyncContext.Provider value={db}>
      <ProveedorSesion>
        <Puerta />
      </ProveedorSesion>
    </PowerSyncContext.Provider>
  );
}
