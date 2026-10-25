// Точка входа интерфейса. Шрифты — из npm-пакетов @fontsource, а не с Google Fonts:
// интерфейс локального стенда не должен ходить за ресурсами в интернет.

import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('В index.html нет элемента #root');
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
