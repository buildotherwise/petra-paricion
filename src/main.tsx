import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Tipografías embebidas en la app, no traídas de internet: en el campo no hay
// señal y una fuente que no carga degrada toda la pantalla. Se usa el eje de
// peso (`wght`) y no el de tamaño óptico, que pesa el triple sin aportar acá.
import '@fontsource-variable/newsreader/wght.css';
import '@fontsource-variable/manrope/wght.css';

import { App } from './App';
import { BordeGlobal } from './componentes/BordeGlobal';
import { registrarServiceWorker } from './lib/actualizacion-sw';
import './estilos/tokens.css';
import './estilos/app.css';

registrarServiceWorker();

const raiz = document.getElementById('root');
if (raiz === null) throw new Error('Falta el elemento #root en index.html');

createRoot(raiz).render(
  <StrictMode>
    <BordeGlobal>
      <App />
    </BordeGlobal>
  </StrictMode>,
);
