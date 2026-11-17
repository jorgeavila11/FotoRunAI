import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Aceita o endereço com ou sem "/rest/v1/" no final
const url = rawUrl ? (() => { try { return new URL(rawUrl.trim()).origin; } catch { return rawUrl.trim(); } })() : undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.error('[FotoRun] Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env');
}

/** Cliente do navegador: usa a chave pública (anon). Serve só para login/sessão. */
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** fetch para a API do servidor já com o token do usuário logado. */
export async function apiFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}
