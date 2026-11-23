import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Request, Response, NextFunction } from 'express';

/** Aceita o endereço com ou sem "/rest/v1/" no final: o Supabase espera só https://xxxx.supabase.co */
function baseUrl(value?: string) {
  if (!value) return undefined;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return value.trim();
  }
}

const SUPABASE_URL = baseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '\n[FotoRun] Faltam variáveis do Supabase. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env (veja .env.example).\n'
  );
}

/**
 * Cliente administrativo (service_role). Ignora o RLS — use SOMENTE no servidor.
 * Nunca envie esta chave para o navegador.
 */
export const db: SupabaseClient = createClient(SUPABASE_URL || 'http://localhost', SERVICE_ROLE_KEY || 'missing', {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const BUCKET_ORIGINALS = 'originals';
export const BUCKET_PREVIEWS = 'previews';

export interface Profile {
  id: string;
  role: 'athlete' | 'photographer' | 'admin';
  full_name: string;
  phone: string | null;
  bib_number: string | null;
  pix_key: string | null;
  individual_price: number;
  watermark_text: string;
  watermark_opacity: number;
  onboarded_at?: string | null;
}

export interface AuthedRequest extends Request {
  user?: { id: string; email: string; profile: Profile };
}

/** Exige um usuário logado (token do Supabase no header Authorization: Bearer ...). */
export async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Faça login para continuar.' });
  }

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ error: 'Perfil não encontrado para este usuário.' });
  }
  if (profile.suspended_at && profile.role !== 'admin') {
    return res.status(403).json({ error: 'Sua conta está suspensa. Fale com o suporte do FotoRun.', code: 'conta_suspensa' });
  }

  req.user = {
    id: data.user.id,
    email: data.user.email || '',
    profile: {
      ...profile,
      individual_price: Number(profile.individual_price),
    } as Profile,
  };
  next();
}

/** Exige que o usuário logado seja fotógrafo (ou admin). Use depois de requireUser. */
export function requirePhotographer(req: AuthedRequest, res: Response, next: NextFunction) {
  const role = req.user?.profile.role;
  if (role !== 'photographer' && role !== 'admin') {
    return res.status(403).json({ error: 'Área exclusiva para fotógrafos cadastrados.' });
  }
  next();
}

/** Exige que o usuário logado seja administrador da plataforma. Use depois de requireUser. */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Área exclusiva para administradores.' });
  }
  next();
}
