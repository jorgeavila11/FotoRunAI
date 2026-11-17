import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/**
 * Trava de segurança: variáveis VITE_ vão para dentro do site e ficam visíveis a qualquer visitante.
 * Se a chave SECRETA do Supabase for colocada em VITE_SUPABASE_ANON_KEY, o build é interrompido.
 */
function assertPublicSupabaseKey(key: string | undefined) {
  if (!key) return;
  let isSecret = key.startsWith('sb_secret_');
  if (!isSecret && key.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      isSecret = payload.role === 'service_role';
    } catch {
      /* não é JWT: ignora */
    }
  }
  if (isSecret) {
    throw new Error(
      '\n\n[FotoRun] VITE_SUPABASE_ANON_KEY está com a chave SECRETA do Supabase.\n' +
        'Use a chave pública (publishable, começa com "sb_publishable_" ou é a "anon").\n' +
        'A chave secreta vai SOMENTE em SUPABASE_SERVICE_ROLE_KEY.\n'
    );
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  assertPublicSupabaseKey(env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
