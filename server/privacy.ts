/**
 * "Remover minhas fotos" (LGPD, direito de eliminação do titular).
 *
 * Fluxo:
 *   1. O atleta logado envia uma selfie e confirma que é a pessoa da foto.
 *   2. O servidor encontra as fotos com o rosto dele (limiar mais rigoroso que o da busca)
 *      e as OCULTA na hora da vitrine e da busca. A selfie não é guardada.
 *   3. O administrador revisa: confirma (arquivos e biometria apagados) ou restaura (se foi engano).
 */
import type { Express } from 'express';
import { db, requireUser, requireAdmin, AuthedRequest } from './supabase';
import { embedSelfie, faceModelsAvailable, toPgVector, FACE_MATCH_THRESHOLD } from './faces';
import { decodeDataUrl, normalizeImage } from './image-formats';
import { previewPublicUrl } from './media';
import { purgePhotos } from './retention';

/** Mais rigoroso que a busca: só oculta fotos com alta semelhança, para não esconder fotos de outra pessoa. */
const REMOVAL_EXTRA_THRESHOLD = 0.06;
const MAX_REQUESTS_PER_DAY = 3;
const HIDDEN_REASON = 'pedido_titular';

export function registerPrivacyRoutes(app: Express) {
  app.post('/api/privacy/remove-my-photos', requireUser, async (req: AuthedRequest, res) => {
    try {
      const u = req.user!;
      const { selfieBase64, confirmed } = req.body ?? {};
      if (confirmed !== true) {
        return res.status(400).json({ error: 'Confirme que você é a pessoa da selfie.' });
      }
      if (!selfieBase64) return res.status(400).json({ error: 'Envie uma selfie do seu rosto.' });
      if (!faceModelsAvailable()) return res.status(500).json({ error: 'Reconhecimento facial indisponível no momento.' });

      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await db
        .from('removal_requests')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', u.id)
        .gte('created_at', since);
      if ((count || 0) >= MAX_REQUESTS_PER_DAY) {
        return res.status(429).json({ error: 'Você já fez vários pedidos hoje. Tente novamente amanhã ou fale com o suporte.' });
      }

      // A selfie é usada só aqui e descartada
      const selfie = await embedSelfie((await normalizeImage(decodeDataUrl(selfieBase64))).buffer);
      if (!selfie) {
        return res.status(422).json({ error: 'Não encontramos um rosto na selfie. Envie uma foto de frente, bem iluminada e sem óculos escuros.' });
      }

      const { data, error } = await db.rpc('match_photo_faces', {
        query_embedding: toPgVector(selfie.embedding),
        p_event_id: null,
        match_threshold: FACE_MATCH_THRESHOLD + REMOVAL_EXTRA_THRESHOLD,
        match_count: 1000,
      });
      if (error) throw error;
      const ids = ((data || []) as { photo_id: string }[]).map((r) => r.photo_id);

      if (ids.length === 0) {
        return res.json({ hidden: 0, message: 'Não encontramos fotos com o seu rosto no FotoRun.' });
      }

      const { error: hideError } = await db
        .from('photos')
        .update({ hidden_at: new Date().toISOString(), hidden_reason: HIDDEN_REASON })
        .in('id', ids)
        .is('hidden_at', null);
      if (hideError) throw hideError;

      const { error: insError } = await db.from('removal_requests').insert({ requester_id: u.id, photo_ids: ids });
      if (insError) throw insError;

      console.log(`[privacidade] pedido de remoção: ${ids.length} foto(s) ocultada(s)`);
      res.json({
        hidden: ids.length,
        message: `${ids.length} foto(s) com o seu rosto foram retiradas da vitrine e da busca. A exclusão definitiva será concluída após revisão.`,
      });
    } catch (err) {
      console.error('[privacidade] falha no pedido de remoção:', err);
      res.status(500).json({ error: 'Não foi possível concluir o pedido. Tente novamente.' });
    }
  });

  // ------------------------------------------------------------------ administrador
  app.get('/api/admin/removal-requests', requireUser, requireAdmin, async (_req, res) => {
    const { data, error } = await db
      .from('removal_requests')
      .select('*, profiles(full_name)')
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) return res.status(500).json({ error: 'Não foi possível carregar os pedidos de remoção.' });

    const allIds = [...new Set((data || []).flatMap((r) => r.photo_ids as string[]))];
    const previews = new Map<string, string>();
    const sold = new Set<string>();
    if (allIds.length > 0) {
      const { data: photos } = await db.from('photos').select('id, preview_path, purged_at').in('id', allIds);
      (photos || []).forEach((p) => {
        if (!p.purged_at) previews.set(p.id, previewPublicUrl(p.preview_path));
      });
      const { data: items } = await db
        .from('order_items')
        .select('photo_id, orders!inner(status)')
        .in('photo_id', allIds)
        .eq('orders.status', 'pago');
      (items || []).forEach((i) => sold.add(i.photo_id as string));
    }

    res.json({
      requests: (data || []).map((r) => ({
        id: r.id,
        requesterName: r.profiles?.full_name || 'Atleta',
        createdAt: r.created_at,
        photoCount: (r.photo_ids as string[]).length,
        soldCount: (r.photo_ids as string[]).filter((id) => sold.has(id)).length,
        previews: (r.photo_ids as string[]).map((id) => previews.get(id)).filter(Boolean).slice(0, 12),
      })),
    });
  });

  app.post('/api/admin/removal-requests/:id/confirm', requireUser, requireAdmin, async (req, res) => {
    try {
      const { data: request } = await db
        .from('removal_requests')
        .select('id, photo_ids, status')
        .eq('id', req.params.id)
        .maybeSingle();
      if (!request || request.status !== 'pendente') return res.status(404).json({ error: 'Pedido não encontrado ou já analisado.' });

      const { data: photos } = await db
        .from('photos')
        .select('id, original_path, preview_path')
        .in('id', request.photo_ids as string[])
        .is('purged_at', null);
      const purged = await purgePhotos(photos || []);

      await db
        .from('removal_requests')
        .update({ status: 'confirmado', decided_at: new Date().toISOString() })
        .eq('id', request.id);
      res.json({ ok: true, purged });
    } catch (err) {
      console.error('[privacidade] falha ao confirmar remoção:', err);
      res.status(500).json({ error: 'Não foi possível apagar as fotos.' });
    }
  });

  app.post('/api/admin/removal-requests/:id/restore', requireUser, requireAdmin, async (req, res) => {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : null;
    const { data: request } = await db
      .from('removal_requests')
      .select('id, photo_ids, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!request || request.status !== 'pendente') return res.status(404).json({ error: 'Pedido não encontrado ou já analisado.' });

    await db
      .from('photos')
      .update({ hidden_at: null, hidden_reason: null })
      .in('id', request.photo_ids as string[])
      .eq('hidden_reason', HIDDEN_REASON)
      .is('purged_at', null);
    await db
      .from('removal_requests')
      .update({ status: 'restaurado', admin_note: note, decided_at: new Date().toISOString() })
      .eq('id', request.id);
    res.json({ ok: true });
  });
}
