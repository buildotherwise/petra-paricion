import { PowerSyncContext } from '@powersync/react';
import { db } from './lib/powersync/db';
import { ProveedorSesion, useSesion } from './lib/sesion';
import { ProveedorNavegacion, useNavegacion } from './lib/navegacion';
import { Login } from './pantallas/Login';
import { Inicio } from './pantallas/Inicio';
import { RegistrarParto } from './pantallas/RegistrarParto';
import { PartosRegistrados } from './pantallas/PartosRegistrados';
import { FichaParto } from './pantallas/FichaParto';
import { FichaCordero } from './pantallas/FichaCordero';
import { Rechazados } from './pantallas/Rechazados';

function Ruteo() {
  const { pantalla, ir, volver, alInicio } = useNavegacion();

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
        />
      );

    case 'ficha-cordero':
      return <FichaCordero corderoId={pantalla.corderoId} onVolver={volver} />;

    case 'rechazados':
      return <Rechazados onVolver={volver} />;

    default:
      return (
        <Inicio
          onRegistrarParto={() => ir({ nombre: 'registrar-parto' })}
          onVerPartos={() => ir({ nombre: 'partos' })}
          onAbrirParto={(partoId) => ir({ nombre: 'ficha-parto', partoId })}
        />
      );
  }
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
