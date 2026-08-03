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
import { Senalada } from './pantallas/Senalada';
import { SenalarParto } from './pantallas/SenalarParto';
import { SenalarCordero } from './pantallas/SenalarCordero';
import { Rechazados } from './pantallas/Rechazados';

function Ruteo() {
  const { pantalla, ir, volver, reemplazar, alInicio } = useNavegacion();

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
      return (
        <FichaCordero
          corderoId={pantalla.corderoId}
          onVolver={volver}
          onSenalar={(corderoId) => ir({ nombre: 'senalar-cordero', corderoId })}
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
        />
      );

    case 'rechazados':
      return <Rechazados onVolver={volver} />;

    default:
      return (
        <Inicio
          onRegistrarParto={() => ir({ nombre: 'registrar-parto' })}
          onSenalada={() => ir({ nombre: 'senalada' })}
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
