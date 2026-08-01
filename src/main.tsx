import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './estilos/tokens.css';
import './estilos/app.css';

const raiz = document.getElementById('root');
if (raiz === null) throw new Error('Falta el elemento #root en index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
