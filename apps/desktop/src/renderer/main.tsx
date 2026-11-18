import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './estilos.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <h1>GulaWeb</h1>
  </StrictMode>,
);
