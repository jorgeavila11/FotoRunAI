/**
 * Link de divulgação do fotógrafo.
 *
 * O link principal é sempre o do EVENTO (um para todos os fotógrafos).
 * O fotógrafo divulga o mesmo link com a marca dele no final (&f=apelido).
 * Se o atleta comprar depois de chegar por esse link, o pedido registra
 * quem indicou — e, se REFERRAL_FEE_PERCENT estiver definido, as fotos
 * DESSE fotógrafo naquele pedido pagam uma taxa menor (bônus).
 */
import type { Express } from 'express';
import { db, requireUser, requirePhotographer, AuthedRequest } from './supabase';
import { PLATFORM_FEE_PERCENT, REFERRAL_FEE_PERCENT } from './fees';

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED = new Set(['admin', 'fotorun', 'suporte', 'api', 'evento', 'eventos', 'taxas', 'login']);

/** "Ana Ribeiro Júnior" -> "ana-ribeiro-junior" */
export function slugify(name: string) {
  const s = (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
  return s.length >= 3 ? s : `foto-${s || 'grafo'}`.slice(0, 30);
}

export function validateSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return 'Use de 3 a 40 letras minúsculas, números ou hífen (sem acento e sem espaço).';
  if (RESERVED.has(slug)) return 'Esse apelido é reservado. Escolha outro.';
  return null;
}

/** Garante que o fotógrafo tem um apelido público; cria a partir do nome se faltar. */
export async function ensureSlug(profileId: string, fullName: string): Promise<string> {
  const { data: me } = await db.from('profiles').select('public_slug').eq('id', profileId).maybeSingle();
  if (me?.public_slug) return me.public_slug;
  const base = slugify(fullName);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 36)}-${i + 1}`;
    if (RESERVED.has(candidate)) continue;
    const { error } = await db.from('profiles').update({ public_slug: candidate }).eq('id', profileId).is('public_slug', null);
    if (!error) {
      const { data } = await db.from('profiles').select('public_slug').eq('id', profileId).maybeSingle();
      if (data?.public_slug) return data.public_slug;
    }
    // erro de unicidade: tenta o próximo número
  }
  throw new Error('Não foi possível gerar o apelido público.');
}


/**
 * Descobre quem indicou a compra. Só vale se: o apelido existe, é de um
 * fotógrafo ativo, ele tem fotos nesse evento e não é o próprio comprador.
 */
export async function resolveReferrer(slug: unknown, eventId: string, buyerId: string): Promise<string | null> {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null;
  const { data: p } = await db.from('profiles').select('id, role, suspended_at').eq('public_slug', slug).maybeSingle();
  if (!p || p.role !== 'photographer' || p.suspended_at || p.id === buyerId) return null;
  const { count } = await db
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('photographer_id', p.id)
    .is('purged_at', null);
  return (count || 0) > 0 ? p.id : null;
}

export function registerReferralRoutes(app: Express) {
  // Fotógrafo: seus links de divulgação e quanto vendeu por eles
  app.get('/api/me/share-links', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
    try {
      const u = req.user!;
      const slug = await ensureSlug(u.id, u.profile.full_name || 'fotografo');
      const { data: events } = await db
        .from('events')
        .select('id, title, event_date, owner_id')
        .is('disabled_at', null)
        .order('event_date', { ascending: false });

      // Eventos em que ele tem fotos (ou é o responsável)
      const withPhotos = await Promise.all(
        (events || []).map(async (e) => {
          const { count } = await db
            .from('photos')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', e.id)
            .eq('photographer_id', u.id)
            .is('purged_at', null);
          return { ...e, myPhotos: count || 0 };
        }),
      );
      const mine = withPhotos.filter((e) => e.myPhotos > 0 || e.owner_id === u.id);

      // Vendas que vieram pelo link dele
      const { data: refOrders } = await db
        .from('orders')
        .select('id, event_id, total_paid')
        .eq('referred_by', u.id)
        .eq('status', 'pago');
      const ids = (refOrders || []).map((o) => o.id);
      const { data: myItems } = ids.length
        ? await db.from('order_items').select('order_id, photographer_net').in('order_id', ids).eq('photographer_id', u.id)
        : { data: [] as { order_id: string; photographer_net: number }[] };
      const orderEvent = new Map((refOrders || []).map((o) => [o.id, o.event_id]));
      const byEvent = new Map<string, { orders: number; total: number; myNet: number }>();
      for (const o of refOrders || []) {
        const s = byEvent.get(o.event_id) || { orders: 0, total: 0, myNet: 0 };
        s.orders += 1;
        s.total += Number(o.total_paid);
        byEvent.set(o.event_id, s);
      }
      for (const it of myItems || []) {
        const ev = orderEvent.get(it.order_id);
        if (ev && byEvent.has(ev)) byEvent.get(ev)!.myNet += Number(it.photographer_net);
      }
      const r2 = (n: number) => Math.round(n * 100) / 100;

      res.json({
        slug,
        referralFeePercent: REFERRAL_FEE_PERCENT,
        platformFeePercent: PLATFORM_FEE_PERCENT,
        totals: {
          orders: (refOrders || []).length,
          total: r2((refOrders || []).reduce((s, o) => s + Number(o.total_paid), 0)),
          myNet: r2([...byEvent.values()].reduce((s, e) => s + e.myNet, 0)),
        },
        events: mine.map((e) => {
          const s = byEvent.get(e.id);
          return {
            id: e.id,
            title: e.title,
            eventDate: e.event_date,
            myPhotos: e.myPhotos,
            orders: s?.orders || 0,
            total: r2(s?.total || 0),
            myNet: r2(s?.myNet || 0),
          };
        }),
      });
    } catch (err) {
      console.error('[links de divulgação]', err);
      res.status(500).json({ error: 'Não foi possível carregar seus links.' });
    }
  });

  // Fotógrafo: trocar o apelido do link
  app.patch('/api/me/share-slug', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
    const slug = String(req.body?.slug || '').trim().toLowerCase();
    const problem = validateSlug(slug);
    if (problem) return res.status(400).json({ error: problem });
    const { data: taken } = await db.from('profiles').select('id').eq('public_slug', slug).neq('id', req.user!.id).maybeSingle();
    if (taken) return res.status(409).json({ error: 'Esse apelido já está em uso. Tente outro.' });
    const { error } = await db.from('profiles').update({ public_slug: slug }).eq('id', req.user!.id);
    if (error) return res.status(500).json({ error: 'Não foi possível salvar.' });
    res.json({ slug });
  });
}
