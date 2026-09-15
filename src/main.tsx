import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ConnectionsProvider } from './lib/connections.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConnectionsProvider>
      <App />
    </ConnectionsProvider>
  </StrictMode>,
);
