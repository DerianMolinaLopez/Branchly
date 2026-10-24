import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The native context menu makes no sense in a desktop app; ours replace it.
// Text fields keep it for copy and paste.
document.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest('input, textarea, [data-selectable]')) event.preventDefault();
});

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
