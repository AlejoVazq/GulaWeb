import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Carta } from './paginas/Carta';
import '@gula/ui/base.css';
import '@gula/ui/fuentes-carta.css';
import '@gula/ui/papel.css';
import './estilos.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/:slug" element={<Carta />} />
        <Route path="/:slug/m/:token" element={<Carta />} />
        <Route
          path="*"
          element={<p className="aviso">Escaneá el QR de tu mesa para ver la carta.</p>}
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
