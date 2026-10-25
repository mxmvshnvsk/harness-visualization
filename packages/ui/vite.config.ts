// Vite: сборка и сервер разработки интерфейса. Запросы к /api проксируются на сервер харнесса,
// поэтому браузер видит один адрес, и SSE, POST и страница живут на одном origin.

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import harnessConfig from '../../harness.config.json' with { type: 'json' };

const UI_PORT = 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    // Как и сервер харнесса — только локальный адрес.
    host: '127.0.0.1',
    port: UI_PORT,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${String(harnessConfig.server.port)}`,
    },
  },
});
