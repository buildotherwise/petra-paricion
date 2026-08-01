import { useState } from 'react';
import { PowerSyncContext } from '@powersync/react';
import { db } from './lib/powersync/db';
import { ProveedorSesion, useSesion } from './lib/sesion';
import { Login } from './pantallas/Login';
import { Inicio } from './pantallas/Inicio';
import { RegistrarParto } from './pantallas/RegistrarParto';

type Pantalla = 'inicio' | 'registrar-parto';

function Ruteo() {
  const { sesion, cargando } = useSesion();
  const [pantalla, setPantalla] = useState<Pantalla>('inicio');

  if (cargando) return <div className="login" />;
  if (sesion === null) return <Login />;

  if (pantalla === 'registrar-parto') {
    return <RegistrarParto onSalir={() => setPantalla('inicio')} />;
  }

  return <Inicio onRegistrarParto={() => setPantalla('registrar-parto')} />;
}

export function App() {
  return (
    <PowerSyncContext.Provider value={db}>
      <ProveedorSesion>
        <Ruteo />
      </ProveedorSesion>
    </PowerSyncContext.Provider>
  );
}
