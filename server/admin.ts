/**
 * Painel de administração da plataforma:
 *  - visão geral (números, ganhos por mês, cadastros, pendências)
 *  - lista de fotógrafos e de usuários (com suspensão de conta)
 *  - desativar / reativar evento
 *
 * Os números são calculados aqui a partir das tabelas. Para o volume atual
 * isso é rápido; com dezenas de milhares de pedidos, vale trocar por uma
 * view/função SQL agregada.
 */
import type { Express } from 'express';
import { db, requireUser, requireAdmin, AuthedRequest } from './supabase';

const TZ = 'America/Sao_Paulo';
const monthKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' });
/** "2026-11" no fuso de Brasília */
export const monthKey = (iso: string | Date) => monthKeyFmt.format(new Date(iso)).slice(0, 7);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Últimos N meses (do mais antigo ao atual), no fuso de Brasília */
export function lastMonths(n: number, now = new Date()) {
  const [y, m] = monthKey(now).split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return `${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}`;
};

/** O Supabase devolve no máximo 1000 linhas por consulta: busca em páginas. */
async function fetchAll<T>(build: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...((data || []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

async function allAuthUsers() {
  const users: { id: string; email?: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null }[] = [];
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

/** Ids de fotógrafos suspensos — as fotos deles saem da vitrine. */
export async function suspendedIds(): Promise<Set<string>> {
  const { data } = await db.from('profiles').select('id').not('suspended_at', 'is', null);
  return new Set((data || []).map((p) => p.id));
}

/** Ids de eventos desativados. */
export async function disabledEventIds(): Promise<Set<string>> {
  const { data } = await db.from('events').select('id').not('disabled_at', 'is', null);
  return new Set((data || []).map((e) => e.id));
}

type PaidOrder = { id: string; event_id: string; buyer_id: string; total_paid: number; paid_at: string | null; created_at: string };
type PaidItem = { order_id: string; photographer_id: string; amount: number; photographer_net: number };
type ProfileRow = {
  id: string;
  role: 'athlete' | 'photographer' | 'admin';
  full_name: string;
  phone: string | null;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
};

async function loadSales() {
  const [orders, items] = await Promise.all([
    fetchAll<PaidOrder>(() =>
      db.from('orders').select('id, event_id, buyer_id, total_paid, paid_at, created_at').eq('status', 'pago').order('id'),
    ),
    fetchAll<PaidItem>(() =>
      db
        .from('order_items')
        .select('order_id, photographer_id, amount, photographer_net, orders!inner(status)')
        .eq('orders.status', 'pago')
        .order('id'),
    ),
  ]);
  return { orders, items };
}

export function registerAdminRoutes(app: Express) {
  // ------------------------------------------------------------------ Visão geral
  app.get('/api/admin/overview', requireUser, requireAdmin, async (_req, res) => {
    try {
      const [{ orders, items }, profiles, eventsRes, photosCount, payoutsRes, pendAccounts, pendRemovals, pendRequests] = await Promise.all([
        loadSales(),
        fetchAll<ProfileRow>(() => db.from('profiles').select('id, role, full_name, phone, created_at, suspended_at, suspended_reason').order('id')),
        db.from('events').select('id, title, disabled_at, event_date'),
        db.from('photos').select('id', { count: 'exact', head: true }).is('hidden_at', null).is('purged_at', null),
        db.from('payouts').select('amount, status'),
        db.from('payout_accounts').select('photographer_id', { count: 'exact', head: true }).eq('status', 'em_analise'),
        db.from('removal_requests').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        db.from('event_requests').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      ]);

      const orderById = new Map(orders.map((o) => [o.id, o]));
      const months = lastMonths(12);
      const series = new Map(
        months.map((k) => [k, { month: k, label: monthLabel(k), gmv: 0, platform: 0, photographers: 0, orders: 0, newAthletes: 0, newPhotographers: 0 }]),
      );

      let gmv = 0;
      for (const o of orders) {
        gmv += Number(o.total_paid);
        const s = series.get(monthKey(o.paid_at || o.created_at));
        if (s) {
          s.gmv += Number(o.total_paid);
          s.orders += 1;
        }
      }
      let platform = 0;
      let photographersNet = 0;
      const byPhotographer = new Map<string, { net: number; items: number }>();
      const byEvent = new Map<string, { gmv: number; orders: Set<string>; items: number }>();
      for (const it of items) {
        const amount = Number(it.amount);
        const net = Number(it.photographer_net);
        platform += amount - net;
        photographersNet += net;
        const o = orderById.get(it.order_id);
        const s = o ? series.get(monthKey(o.paid_at || o.created_at)) : undefined;
        if (s) {
          s.platform += amount - net;
          s.photographers += net;
        }
        const p = byPhotographer.get(it.photographer_id) || { net: 0, items: 0 };
        p.net += net;
        p.items += 1;
        byPhotographer.set(it.photographer_id, p);
        if (o) {
          const e = byEvent.get(o.event_id) || { gmv: 0, orders: new Set<string>(), items: 0 };
          e.gmv += amount;
          e.orders.add(o.id);
          e.items += 1;
          byEvent.set(o.event_id, e);
        }
      }
      for (const pr of profiles) {
        const s = series.get(monthKey(pr.created_at));
        if (!s) continue;
        if (pr.role === 'athlete') s.newAthletes += 1;
        if (pr.role === 'photographer') s.newPhotographers += 1;
      }

      const thisMonth = series.get(months[months.length - 1])!;
      const lastMonth = series.get(months[months.length - 2])!;
      const events = eventsRes.data || [];
      const nameOf = new Map(profiles.map((p) => [p.id, p.full_name || 'Sem nome']));
      const titleOf = new Map(events.map((e) => [e.id, e.title]));
      const payouts = payoutsRes.data || [];
      const pendingPayouts = payouts.filter((p) => p.status === 'solicitado');

      res.json({
        kpis: {
          gmv: round2(gmv),
          platformRevenue: round2(platform),
          photographersNet: round2(photographersNet),
          ordersCount: orders.length,
          itemsSold: items.length,
          avgTicket: orders.length ? round2(gmv / orders.length) : 0,
          gmvThisMonth: round2(thisMonth.gmv),
          gmvLastMonth: round2(lastMonth.gmv),
          platformThisMonth: round2(thisMonth.platform),
          platformLastMonth: round2(lastMonth.platform),
          athletes: profiles.filter((p) => p.role === 'athlete').length,
          photographers: profiles.filter((p) => p.role === 'photographer').length,
          suspended: profiles.filter((p) => p.suspended_at).length,
          eventsActive: events.filter((e) => !e.disabled_at).length,
          eventsDisabled: events.filter((e) => e.disabled_at).length,
          photos: photosCount.count || 0,
          paidOut: round2(payouts.filter((p) => p.status === 'pago').reduce((s, p) => s + Number(p.amount), 0)),
        },
        pending: {
          payouts: pendingPayouts.length,
          payoutsAmount: round2(pendingPayouts.reduce((s, p) => s + Number(p.amount), 0)),
          accounts: pendAccounts.count || 0,
          removals: pendRemovals.count || 0,
          eventRequests: pendRequests.count || 0,
        },
        monthly: [...series.values()].map((s) => ({
          ...s,
          gmv: round2(s.gmv),
          platform: round2(s.platform),
          photographers: round2(s.photographers),
        })),
        topEvents: [...byEvent.entries()]
          .sort((a, b) => b[1].gmv - a[1].gmv)
          .slice(0, 5)
          .map(([id, e]) => ({ id, title: titleOf.get(id) || id, gmv: round2(e.gmv), orders: e.orders.size, items: e.items })),
        topPhotographers: [...byPhotographer.entries()]
          .sort((a, b) => b[1].net - a[1].net)
          .slice(0, 5)
          .map(([id, p]) => ({ id, name: nameOf.get(id) || '—', net: round2(p.net), items: p.items })),
      });
    } catch (err) {
      console.error('[admin overview]', err);
      res.status(500).json({ error: 'Não foi possível carregar a visão geral.' });
    }
  });

  // ------------------------------------------------------------------ Usuários e fotógrafos
  app.get('/api/admin/users', requireUser, requireAdmin, async (_req, res) => {
    try {
      const [profiles, authUsers, { orders, items }, photos, accounts, events] = await Promise.all([
        fetchAll<ProfileRow>(() => db.from('profiles').select('id, role, full_name, phone, created_at, suspended_at, suspended_reason').order('id')),
        allAuthUsers(),
        loadSales(),
        fetchAll<{ photographer_id: string; event_id: string }>(() =>
          db.from('photos').select('photographer_id, event_id').is('purged_at', null).order('id'),
        ),
        db.from('payout_accounts').select('photographer_id, status'),
        db.from('events').select('id, owner_id'),
      ]);
      const auth = new Map(authUsers.map((u) => [u.id, u]));
      const acc = new Map((accounts.data || []).map((a) => [a.photographer_id, a.status]));

      const buyer = new Map<string, { orders: number; spent: number }>();
      for (const o of orders) {
        const b = buyer.get(o.buyer_id) || { orders: 0, spent: 0 };
        b.orders += 1;
        b.spent += Number(o.total_paid);
        buyer.set(o.buyer_id, b);
      }
      const seller = new Map<string, { sold: number; gross: number; net: number }>();
      for (const it of items) {
        const s = seller.get(it.photographer_id) || { sold: 0, gross: 0, net: 0 };
        s.sold += 1;
        s.gross += Number(it.amount);
        s.net += Number(it.photographer_net);
        seller.set(it.photographer_id, s);
      }
      const uploads = new Map<string, { photos: number; events: Set<string> }>();
      for (const p of photos) {
        const u = uploads.get(p.photographer_id) || { photos: 0, events: new Set<string>() };
        u.photos += 1;
        u.events.add(p.event_id);
        uploads.set(p.photographer_id, u);
      }
      const owned = new Map<string, number>();
      for (const e of events.data || []) if (e.owner_id) owned.set(e.owner_id, (owned.get(e.owner_id) || 0) + 1);

      res.json({
        users: profiles
          .map((p) => {
            const a = auth.get(p.id);
            const b = buyer.get(p.id);
            const s = seller.get(p.id);
            const u = uploads.get(p.id);
            return {
              id: p.id,
              name: p.full_name || 'Sem nome',
              email: a?.email || '',
              phone: p.phone,
              role: p.role,
              createdAt: p.created_at,
              lastSignInAt: a?.last_sign_in_at || null,
              emailConfirmed: Boolean(a?.email_confirmed_at),
              suspendedAt: p.suspended_at,
              suspendedReason: p.suspended_reason,
              orders: b?.orders || 0,
              spent: round2(b?.spent || 0),
              photos: u?.photos || 0,
              eventsCovered: u?.events.size || 0,
              eventsOwned: owned.get(p.id) || 0,
              sold: s?.sold || 0,
              gross: round2(s?.gross || 0),
              net: round2(s?.net || 0),
              payoutAccount: acc.get(p.id) || null,
            };
          })
          .sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || '')),
      });
    } catch (err) {
      console.error('[admin users]', err);
      res.status(500).json({ error: 'Não foi possível carregar os usuários.' });
    }
  });

  app.post('/api/admin/users/:id/suspend', requireUser, requireAdmin, async (req: AuthedRequest, res) => {
    const id = req.params.id;
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!reason) return res.status(400).json({ error: 'Escreva o motivo da suspensão.' });
    if (id === req.user!.id) return res.status(400).json({ error: 'Você não pode suspender a própria conta.' });
    const { data: target } = await db.from('profiles').select('role').eq('id', id).maybeSingle();
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (target.role === 'admin') return res.status(400).json({ error: 'Contas de administrador não podem ser suspensas por aqui.' });
    const { error } = await db.from('profiles').update({ suspended_at: new Date().toISOString(), suspended_reason: reason }).eq('id', id);
    if (error) return res.status(500).json({ error: 'Não foi possível suspender.' });
    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/reactivate', requireUser, requireAdmin, async (req, res) => {
    const { error } = await db.from('profiles').update({ suspended_at: null, suspended_reason: null }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: 'Não foi possível reativar.' });
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------ Desativar / reativar evento
  app.post('/api/admin/events/:id/disable', requireUser, requireAdmin, async (req, res) => {
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!reason) return res.status(400).json({ error: 'Escreva o motivo para desativar o evento.' });
    const { data, error } = await db
      .from('events')
      .update({ disabled_at: new Date().toISOString(), disabled_reason: reason })
      .eq('id', req.params.id)
      .select('id');
    if (error || !data?.length) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json({ ok: true });
  });

  app.post('/api/admin/events/:id/enable', requireUser, requireAdmin, async (req, res) => {
    const { data, error } = await db
      .from('events')
      .update({ disabled_at: null, disabled_reason: null })
      .eq('id', req.params.id)
      .select('id');
    if (error || !data?.length) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json({ ok: true });
  });
}
