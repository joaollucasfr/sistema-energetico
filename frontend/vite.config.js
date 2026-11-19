import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react';
// usePolling: no Docker com Windows o Vite não recebe aviso de arquivo alterado; verificar periodicamente resolve
export default defineConfig({ plugins: [react()], server: { watch: { usePolling: true, interval: 300 } } });
