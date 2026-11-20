/**
 * Painel do fotógrafo (Bloco 1):
 *   - Indicadores: ganhos por período, desempenho mensal e vendas por ponto do percurso
 *   - Solicitações de evento (fotógrafo pede, administrador aprova ou recusa)
 *   - Cadastro inicial do fotógrafo
 */
import type { Express } from 'express';
import { db, requireUser, requirePhotographer, requireAdmin, AuthedRequest } from './supabase';

const TZ = 'America/Sao_Paulo';
const round2 = (n: number) => Math.round(n * 100) / 100;
/** 'YYYY-MM-DD' no fuso de São Paulo */
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const PHOTOGRAPHER_TYPES = ['tempo_integral', 'parcial', 'hobby'] as const;
export const EXPERIENCE_LEVELS = ['menos_1', '1_3', '3_5', 'mais_5'] as const;
export const GOALS = ['vender', 'aumentar_ganhos', 'oportunidades', 'comunidade'] as const;
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const MAX_PENDING_REQUESTS = 5;

type SoldRow = {
  amount: number | string;
  photographer_net: number | string;
  photo_id: string;
  orders: { status: string; paid_at: string | null; created_at: string; event_id: string };
  photos: { checkpoint: string; event_id: string } | null;
};

/** Calcula todos os indicadores do painel de um fotógrafo. */
export async function photographerInsights(photographerId: string) {
  const [soldRes, photosRes, payoutsRes, eventsRes] = await Promise.all([
    db
      .from('order_items')
      .select('amount, photographer_net, photo_id, orders!inner(status, paid_at, created_at, event_id), photos(checkpoint, event_id)')
      .eq('photographer_id', photographerId)
      .eq('orders.status', 'pago')
      .limit(50000),
    db.from('photos').select('event_id, checkpoint, faces_count').eq('photographer_id', photographerId).limit(100000),
    db.from('payouts').select('amount').eq('photographer_id', photographerId).in('status', ['solicitado', 'pago']),
    db.from('events').select('id, title'),
  ]);
  if (soldRes.error) throw soldRes.error;
  if (photosRes.error) throw photosRes.error;

  const sold = (soldRes.data || []) as unknown as SoldRow[];
  const photos = (photosRes.data || []) as { event_id: string; checkpoint: string; faces_count: number | null }[];
  const titles = new Map((eventsRes.data || []).map((e) => [e.id as string, e.title as string]));

  // ---- Períodos ----
  const now = new Date();
  const todayKey = dayKey(now);
  const monthKey = todayKey.slice(0, 7);
  const sevenDaysAgo = now.getTime() - 7 * 24 * 3600 * 1000;
  const empty = () => ({ net: 0, gross: 0, items: 0 });
  const periods = { today: empty(), last7: empty(), month: empty(), total: empty() };

  // ---- Mensal ----
  const byMonth = new Map<string, { net: number; items: number }>();

  // ---- Por ponto do percurso ----
  type Cp = { eventId: string; checkpoint: string; photos: number; soldPhotos: Set<string>; items: number; net: number };
  const cps = new Map<string, Cp>();
  const cpKey = (eventId: string, checkpoint: string) => `${eventId}\u0000${checkpoint || 'Sem ponto definido'}`;
  const getCp = (eventId: string, checkpoint: string) => {
    const key = cpKey(eventId, checkpoint);
    let cp = cps.get(key);
    if (!cp) {
      cp = { eventId, checkpoint: checkpoint || 'Sem ponto definido', photos: 0, soldPhotos: new Set(), items: 0, net: 0 };
      cps.set(key, cp);
    }
    return cp;
  };

  let facesIndexed = 0;
  for (const p of photos) {
    getCp(p.event_id, p.checkpoint).photos++;
    facesIndexed += p.faces_count || 0;
  }

  let netTotal = 0;
  for (const s of sold) {
    const net = Number(s.photographer_net);
    const gross = Number(s.amount);
    const paid = new Date(s.orders.paid_at || s.orders.created_at);
    const key = dayKey(paid);
    netTotal += net;

    const add = (bucket: { net: number; gross: number; items: number }) => {
      bucket.net += net;
      bucket.gross += gross;
      bucket.items += 1;
    };
    add(periods.total);
    if (key === todayKey) add(periods.today);
    if (paid.getTime() >= sevenDaysAgo) add(periods.last7);
    if (key.slice(0, 7) === monthKey) add(periods.month);

    const m = byMonth.get(key.slice(0, 7)) || { net: 0, items: 0 };
    m.net += net;
    m.items += 1;
    byMonth.set(key.slice(0, 7), m);

    const cp = getCp(s.photos?.event_id || s.orders.event_id, s.photos?.checkpoint || '');
    cp.items++;
    cp.net += net;
    cp.soldPhotos.add(s.photo_id);
  }

  // Últimos 12 meses + mesmos meses do ano anterior
  const [cy, cm] = monthKey.split('-').map(Number);
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(cy, cm - 1 - i, 1));
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth();
    const k = `${y}-${String(mo + 1).padStart(2, '0')}`;
    const prev = `${y - 1}-${String(mo + 1).padStart(2, '0')}`;
    monthly.push({
      month: k,
      label: `${MONTH_LABELS[mo]}/${String(y).slice(2)}`,
      net: round2(byMonth.get(k)?.net || 0),
      items: byMonth.get(k)?.items || 0,
      prevNet: round2(byMonth.get(prev)?.net || 0),
      prevItems: byMonth.get(prev)?.items || 0,
    });
  }

  const paidOut = (payoutsRes.data || []).reduce((acc, r) => acc + Number(r.amount), 0);
  const fix = (b: { net: number; gross: number; items: number }) => ({ net: round2(b.net), gross: round2(b.gross), items: b.items });

  return {
    periods: {
      today: fix(periods.today),
      last7: fix(periods.last7),
      month: fix(periods.month),
      total: fix(periods.total),
    },
    balance: {
      available: round2(Math.max(0, netTotal - paidOut)),
      paidOut: round2(paidOut),
    },
    uploads: { photos: photos.length, facesIndexed },
    monthly,
    checkpoints: [...cps.values()]
      .map((c) => ({
        eventId: c.eventId,
        eventTitle: titles.get(c.eventId) || c.eventId,
        checkpoint: c.checkpoint,
        photos: c.photos,
        soldPhotos: c.soldPhotos.size,
        items: c.items,
        net: round2(c.net),
        conversion: c.photos > 0 ? Math.round((c.soldPhotos.size / c.photos) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.net - a.net || b.photos - a.photos),
  };
}

function toRequest(r: {
  id: string;
  title: string;
  event_date: string | null;
  city: string;
  state: string;
  location: string;
  distances: string;
  notes: string;
  status: string;
  admin_note: string | null;
  event_id: string | null;
  created_at: string;
  decided_at: string | null;
  photographer_id: string;
  profiles?: { full_name: string; city: string | null; state: string | null } | null;
}) {
  return {
    id: r.id,
    title: r.title,
    eventDate: r.event_date,
    city: r.city,
    state: r.state,
    location: r.location,
    distances: r.distances,
    notes: r.notes,
    status: r.status,
    adminNote: r.admin_note,
    eventId: r.event_id,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    photographerId: r.photographer_id,
    photographerName: r.profiles?.full_name || null,
    photographerCity: r.profiles?.city ? `${r.profiles.city}${r.profiles.state ? ` - ${r.profiles.state}` : ''}` : null,
  };
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function registerPainelRoutes(app: Express) {
  // ------------------------------------------------------------------ indicadores
  app.get('/api/photographer/insights', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
    try {
      res.json(await photographerInsights(req.user!.id));
    } catch (err) {
      console.error('[painel] insights:', err);
      res.status(500).json({ error: 'Não foi possível carregar os indicadores.' });
    }
  });

  // ------------------------------------------------------------------ cadastro inicial
  app.patch('/api/me/onboarding', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
    const { photographerType, experience, city, state, goals } = req.body ?? {};
    if (!PHOTOGRAPHER_TYPES.includes(photographerType)) return res.status(400).json({ error: 'Escolha o que melhor descreve você.' });
    if (!EXPERIENCE_LEVELS.includes(experience)) return res.status(400).json({ error: 'Informe há quanto tempo você fotografa.' });
    const uf = clean(state, 2).toUpperCase();
    if (!clean(city, 80) || !UFS.has(uf)) return res.status(400).json({ error: 'Informe sua cidade e estado.' });
    const validGoals = Array.isArray(goals) ? goals.filter((g: string) => (GOALS as readonly string[]).includes(g)) : [];

    const { error } = await db
      .from('profiles')
      .update({
        photographer_type: photographerType,
        experience,
        city: clean(city, 80),
        state: uf,
        goals: validGoals,
        onboarded_at: new Date().toISOString(),
      })
      .eq('id', req.user!.id);
    if (error) return res.status(500).json({ error: 'Não foi possível salvar.' });
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------ solicitações (fotógrafo)
  app.get('/api/event-requests/mine', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
    const { data, error } = await db
      .from('event_requests')
      .select('*')
      .eq('photographer_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) return res.status(500).json({ error: 'Não foi possível carregar suas solicitações.' });
    res.json({ requests: (data || []).map(toRequest) });
  });

  app.post('/api/event-requests', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const title = clean(b.title, 120);
    const city = clean(b.city, 80);
    const state = clean(b.state, 2).toUpperCase();
    const eventDate = typeof b.eventDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.eventDate) ? b.eventDate : null;
    if (!title) return res.status(400).json({ error: 'Informe o nome da prova.' });
    if (!city || !UFS.has(state)) return res.status(400).json({ error: 'Informe a cidade e o estado da prova.' });

    const { count } = await db
      .from('event_requests')
      .select('id', { count: 'exact', head: true })
      .eq('photographer_id', req.user!.id)
      .eq('status', 'pendente');
    if ((count || 0) >= MAX_PENDING_REQUESTS) {
      return res.status(429).json({ error: `Você já tem ${MAX_PENDING_REQUESTS} solicitações aguardando análise. Aguarde a resposta do administrador.` });
    }

    const { data, error } = await db
      .from('event_requests')
      .insert({
        photographer_id: req.user!.id,
        title,
        event_date: eventDate,
        city,
        state,
        location: clean(b.location, 160),
        distances: clean(b.distances, 80),
        notes: clean(b.notes, 500),
      })
      .select('*')
      .single();
    if (error || !data) return res.status(500).json({ error: 'Não foi possível enviar a solicitação.' });
    res.json({ request: toRequest(data) });
  });

  // ------------------------------------------------------------------ solicitações (admin)
  app.get('/api/admin/event-requests', requireUser, requireAdmin, async (req, res) => {
    let query = db
      .from('event_requests')
      .select('*, profiles(full_name, city, state)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (req.query.status !== 'all') query = query.eq('status', 'pendente');
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Não foi possível carregar as solicitações.' });
    res.json({ requests: (data || []).map(toRequest) });
  });

  app.post('/api/admin/event-requests/:id/reject', requireUser, requireAdmin, async (req, res) => {
    const note = clean(req.body?.note, 300);
    if (!note) return res.status(400).json({ error: 'Escreva o motivo da recusa — o fotógrafo vai ver essa mensagem.' });
    const { data, error } = await db
      .from('event_requests')
      .update({ status: 'recusado', admin_note: note, decided_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('status', 'pendente')
      .select('id')
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'Não foi possível recusar.' });
    if (!data) return res.status(404).json({ error: 'Solicitação não encontrada ou já analisada.' });
    res.json({ ok: true });
  });
}

/** Chamado pela rota de criação de evento do admin quando o evento nasce de uma solicitação. */
export async function markRequestApproved(requestId: string, eventId: string) {
  await db
    .from('event_requests')
    .update({ status: 'aprovado', event_id: eventId, admin_note: null, decided_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pendente');
}
