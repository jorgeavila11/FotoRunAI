import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { db, requireUser, requirePhotographer, requireAdmin, AuthedRequest, BUCKET_PREVIEWS } from './server/supabase';
import { makeAnalysisImage, previewPublicUrl, signedOriginalUrl, storeEventCover, storePhotoFiles } from './server/media';
import { embedSelfie, faceModelsAvailable, similarityToConfidence, toPgVector } from './server/faces';
import { indexPhotoFaces, FACE_MATCH_THRESHOLD } from './server/face-index';
import { decodeDataUrl, normalizeImage } from './server/image-formats';
import { registerPainelRoutes, markRequestApproved } from './server/painel';
import { getCategory, isValidCategory } from './src/data/categories';
import { registerPrivacyRoutes } from './server/privacy';
import { registerAdminRoutes, suspendedIds, disabledEventIds } from './server/admin';
import { PHOTOGRAPHER_SHARE, REFERRAL_SHARE, MIN_PAYOUT, PAYOUT_BUSINESS_DAYS, feesInfo } from './server/fees';
import { registerReferralRoutes, resolveReferrer } from './server/referral';
import { registerPayoutAccountRoutes, getPayoutAccount, maskPixKey } from './server/payout-account';
import { scheduleRetention, addMonths, DOWNLOAD_RETENTION_MONTHS } from './server/retention';

const PORT = Number(process.env.PORT) || 3000;
// Modelos do Gemini em ordem de preferência. Se um estiver sobrecarregado, lento ou indisponível,
// o servidor tenta o próximo automaticamente. Para mudar a ordem, use GEMINI_MODELS no .env
// (separados por vírgula) ou GEMINI_MODEL para colocar um modelo na frente da lista.
const GEMINI_MODELS = Array.from(
  new Set(
    [
      process.env.GEMINI_MODEL,
      ...(process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite').split(','),
    ]
      .map((m) => (m || '').trim())
      .filter(Boolean)
  )
);
const GEMINI_MODEL = GEMINI_MODELS[0];
// Tempo total que uma operação pode gastar somando todas as tentativas
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 80_000;
const MAX_FILES_PER_UPLOAD = 10;
const MAX_FACIAL_CANDIDATES = 14; // limite atual por chamada; o Passo 4 troca por busca vetorial

const app = express();
app.use(express.json({ limit: '50mb' }));

// Imagens de demonstração (capas dos eventos de exemplo)
const SEEDED_DIR = path.resolve(process.cwd(), 'src', 'assets', 'images');
app.use('/media/seeded', express.static(SEEDED_DIR));

/** Traduz erros do Gemini em mensagens que explicam o que fazer. */
function describeGeminiError(err: unknown) {
  const e = err as { name?: string; status?: number; message?: string };
  const msg = String(e?.message || err);
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || /aborted|timeout/i.test(msg)) {
    return `A IA do Gemini não respondeu em ${GEMINI_TIMEOUT_MS / 1000} segundos (todos os modelos estavam lentos). Tente novamente em alguns minutos.`;
  }
  if (e?.status === 401 || e?.status === 403 || /API key|ACCESS_TOKEN|UNAUTHENTICATED|PERMISSION_DENIED/i.test(msg)) {
    return 'A chave do Gemini (GEMINI_API_KEY) foi recusada. Rode "npm run check:gemini" para diagnosticar.';
  }
  if (e?.status === 404 || /not found|NOT_FOUND/i.test(msg)) {
    return `Nenhum dos modelos (${GEMINI_MODELS.join(', ')}) está disponível na sua conta. Rode "npm run check:gemini" e ajuste GEMINI_MODELS no .env.`;
  }
  if (e?.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return 'Limite de uso do Gemini atingido. Aguarde um minuto e tente de novo.';
  }
  if (e?.status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(msg)) {
    return 'Os servidores do Gemini estão sobrecarregados no momento. Tente novamente em alguns minutos.';
  }
  return 'Falha ao executar a busca facial. Tente novamente.';
}

/** Erros em que vale tentar outro modelo: sobrecarga, limite, modelo inexistente ou demora. */
function isRetryableGeminiError(err: unknown) {
  const e = err as { name?: string; status?: number; message?: string };
  const msg = String(e?.message || err);
  if (e?.status === 401 || e?.status === 403 || /API key|ACCESS_TOKEN|UNAUTHENTICATED|PERMISSION_DENIED/i.test(msg)) {
    return false; // chave recusada: trocar de modelo não resolve
  }
  return (
    [404, 429, 500, 503].includes(Number(e?.status)) ||
    e?.name === 'AbortError' ||
    e?.name === 'TimeoutError' ||
    /aborted|timeout|UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED|NOT_FOUND|INTERNAL/i.test(msg)
  );
}

type GenerateParams = Parameters<GoogleGenAI['models']['generateContent']>[0];

/**
 * Chama o Gemini tentando os modelos de GEMINI_MODELS em ordem.
 * Cada tentativa recebe parte do tempo restante; a última recebe todo o resto.
 */
async function generateWithFallback(label: string, params: Omit<GenerateParams, 'model'>) {
  if (!ai) throw new Error('GEMINI_API_KEY não configurada.');
  const deadline = Date.now() + GEMINI_TIMEOUT_MS;
  let lastError: unknown;

  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];
    const remaining = deadline - Date.now();
    if (remaining < 3_000) break;
    const isLast = i === GEMINI_MODELS.length - 1;
    // AbortSignal.timeout exige número inteiro de milissegundos
    const budget = Math.floor(isLast ? remaining : Math.min(remaining, Math.max(15_000, remaining * 0.55)));
    const t0 = Date.now();
    try {
      const response = await ai.models.generateContent({
        ...params,
        model,
        config: {
          ...params.config,
          abortSignal: AbortSignal.timeout(budget),
          // thinkingLevel só existe nos modelos 3.x
          ...(model.startsWith('gemini-3') ? {} : { thinkingConfig: undefined }),
        },
      });
      console.log(`[${label}] modelo ${model} respondeu em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return response;
    } catch (err) {
      lastError = err;
      const reason = String((err as Error)?.message || err).slice(0, 120);
      console.warn(`[${label}] modelo ${model} falhou em ${((Date.now() - t0) / 1000).toFixed(1)}s: ${reason}`);
      if (!isRetryableGeminiError(err)) break;
    }
  }
  throw lastError ?? new Error('Nenhum modelo do Gemini respondeu a tempo.');
}

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    })
  : null;

// ---------------------------------------------------------------------------
// Conversões banco -> formato usado pelo frontend
// ---------------------------------------------------------------------------

type PhotoRow = {
  id: string;
  event_id: string;
  photographer_id: string;
  filename: string;
  original_path: string;
  preview_path: string;
  media_type: 'photo' | 'video';
  bib_numbers: string[];
  checkpoint: string;
  time_range: 't1' | 't2' | 't3';
  captured_at: string;
  camera_spec: string;
  resolution: string;
  caption: string;
  face_descriptor: string;
  face_box: { top: number; left: number; width: number; height: number } | null;
  is_podium: boolean;
  price: number | string;
  profiles?: { full_name: string; public_slug?: string | null } | null;
};

const PUBLIC_PHOTO_COLUMNS =
  'id, event_id, photographer_id, filename, preview_path, media_type, bib_numbers, checkpoint, time_range, captured_at, camera_spec, resolution, caption, face_descriptor, face_box, is_podium, price, profiles(full_name, public_slug)';

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function relativeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) ===
    now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  if (now.getTime() - d.getTime() < 60_000) return 'Agora mesmo';
  return sameDay ? `Hoje, ${hm}` : `${d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}, ${hm}`;
}

/** Nunca inclui original_path: o original só sai do servidor por link temporário após pagamento. */
function toPublicPhoto(p: PhotoRow) {
  return {
    id: p.id,
    eventId: p.event_id,
    filename: p.filename,
    imageUrl: previewPublicUrl(p.preview_path),
    mediaType: p.media_type,
    bibNumbers: p.bib_numbers || [],
    checkpoint: p.checkpoint,
    timeRange: p.time_range,
    capturedAt: timeLabel(p.captured_at),
    photographer: p.profiles?.full_name || 'Fotógrafo FotoRun',
    photographerSlug: p.profiles?.public_slug || null,
    cameraSpec: p.camera_spec,
    resolution: p.resolution,
    caption: p.caption,
    faceDescriptor: p.face_descriptor,
    faceBox: p.face_box || undefined,
    isPodium: p.is_podium || undefined,
    price: Number(p.price),
  };
}

function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, Math.min(8, Math.max(1, user.length - 3)))}***@${domain}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function photographerStats(photographerId: string) {
  const [{ count: uploaded }, items, payouts] = await Promise.all([
    db.from('photos').select('id', { count: 'exact', head: true }).eq('photographer_id', photographerId),
    db
      .from('order_items')
      .select('amount, photographer_net, orders!inner(status)')
      .eq('photographer_id', photographerId)
      .eq('orders.status', 'pago'),
    db.from('payouts').select('amount').eq('photographer_id', photographerId).in('status', ['solicitado', 'pago']),
  ]);

  const soldRows = items.data || [];
  const gross = soldRows.reduce((s, r) => s + Number(r.amount), 0);
  const net = soldRows.reduce((s, r) => s + Number(r.photographer_net), 0);
  const paidOut = (payouts.data || []).reduce((s, r) => s + Number(r.amount), 0);

  return {
    totalPhotosUploaded: uploaded || 0,
    totalSold: soldRows.length,
    grossRevenue: round2(gross),
    availablePixBalance: round2(Math.max(0, net - paidOut)),
  };
}

async function photographerSales(photographerId: string) {
  const { data } = await db
    .from('order_items')
    .select(
      'id, amount, photographer_net, photos(filename, preview_path), orders!inner(id, event_id, status, bib_number, athlete_name, athlete_email, purchase_type, payment_method, paid_at, created_at)'
    )
    .eq('photographer_id', photographerId)
    .eq('orders.status', 'pago')
    .order('id', { ascending: false })
    .limit(50);

  type SaleRow = {
    id: string;
    amount: number;
    photographer_net: number;
    photos: { filename: string; preview_path: string } | null;
    orders: {
      id: string;
      event_id: string;
      bib_number: string | null;
      athlete_name: string;
      athlete_email: string;
      purchase_type: string;
      payment_method: string;
      paid_at: string | null;
      created_at: string;
    };
  };

  return ((data || []) as unknown as SaleRow[])
    .map((r) => ({
      id: r.id,
      eventId: r.orders.event_id,
      photoLabel: r.photos?.filename || 'Foto Digital',
      thumbnailUrl: r.photos ? previewPublicUrl(r.photos.preview_path) : '',
      bibNumber: r.orders.bib_number || '—',
      buyerName: r.orders.athlete_name,
      buyerEmail: maskEmail(r.orders.athlete_email),
      timestamp: relativeLabel(r.orders.paid_at || r.orders.created_at),
      sortKey: r.orders.paid_at || r.orders.created_at,
      purchaseType:
        r.orders.purchase_type === 'pack' ? 'Combo Atleta' : r.orders.purchase_type === 'selected' ? 'Seleção' : 'Individual',
      grossAmount: Number(r.amount),
      netAmount: Number(r.photographer_net),
      paymentMethod: r.orders.payment_method === 'pix' ? 'Pix' : 'Cartão',
    }))
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .map(({ sortKey: _s, ...rest }) => rest);
}

async function photographerBatches(photographerId: string) {
  const { data } = await db
    .from('upload_batches')
    .select('*')
    .eq('photographer_id', photographerId)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data || []).map(toBatch);
}

function toBatch(b: {
  id: string;
  event_id: string;
  name: string;
  checkpoint: string;
  photo_count: number;
  faces_indexed: number;
  status: string;
  created_at: string;
}) {
  return {
    id: b.id,
    eventId: b.event_id,
    name: b.name,
    checkpoint: b.checkpoint,
    photoCount: b.photo_count,
    facesIndexed: b.faces_indexed,
    status: b.status,
    createdAt: relativeLabel(b.created_at),
  };
}

function pricingFromProfile(p: { individual_price: number; watermark_text: string; watermark_opacity: number }, packPrice = 39.9) {
  return {
    individualPrice: Number(p.individual_price),
    packPrice,
    videoPrice: 19.9,
    watermarkText: p.watermark_text,
    watermarkOpacity: p.watermark_opacity,
  };
}

async function ordersForBuyer(buyerId: string) {
  const { data } = await db
    .from('orders')
    .select('*, events(title), order_items(photo_id)')
    .eq('buyer_id', buyerId)
    .eq('status', 'pago')
    .order('created_at', { ascending: false });

  return (data || []).map((o) => ({
    id: o.id,
    eventId: o.event_id,
    eventTitle: o.events?.title || '',
    athleteName: o.athlete_name,
    athleteEmail: o.athlete_email,
    athletePhone: o.athlete_phone || '',
    bibNumber: o.bib_number || '',
    purchaseType: o.purchase_type,
    paymentMethod: o.payment_method,
    totalPaid: Number(o.total_paid),
    discountApplied: Number(o.discount),
    createdAt: relativeLabel(o.paid_at || o.created_at),
    unlockedPhotoIds: (o.order_items || []).map((i: { photo_id: string }) => i.photo_id),
    downloadExpiresAt: o.download_expires_at as string | null,
    // Tempo oficial ainda não integrado com a cronometragem da prova
    officialTime: '--:--:--',
    officialPace: '—',
    category: '',
  }));
}

// ---------------------------------------------------------------------------
// Rotas públicas
// ---------------------------------------------------------------------------

// Usado pela hospedagem para saber se o servidor está no ar
// Taxas públicas (página "Taxas e serviços")
app.get('/api/fees', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(feesInfo());
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, faceModels: faceModelsAvailable(), gemini: Boolean(ai) });
});

app.get('/api/bootstrap', async (_req, res) => {
  try {
    const [eventsRes, photosRes, suspended] = await Promise.all([
      // Eventos desativados pela administração não aparecem na vitrine
      db.from('events').select('*').is('disabled_at', null).order('event_date', { ascending: false }),
      db.from('photos').select(PUBLIC_PHOTO_COLUMNS).is('hidden_at', null).is('purged_at', null).order('captured_at', { ascending: false }).limit(2000),
      suspendedIds(),
    ]);
    if (eventsRes.error) throw eventsRes.error;
    if (photosRes.error) throw photosRes.error;

    // Só fotos de eventos ativos e de fotógrafos não suspensos
    const activeEvents = new Set((eventsRes.data || []).map((e) => e.id));
    const rawPhotos = (photosRes.data as unknown as PhotoRow[]).filter(
      (p) => activeEvents.has(p.event_id) && !suspended.has(p.photographer_id),
    );
    const photos = rawPhotos.map(toPublicPhoto);

    const events = (eventsRes.data || []).map((e) => {
      const ofEvent = rawPhotos.filter((p) => p.event_id === e.id);
      return {
        id: e.id,
        slug: e.id,
        title: e.title,
        dateLabel: e.event_date ? new Date(`${e.event_date}T12:00:00`).toLocaleDateString('pt-BR') : 'Data a definir',
        city: e.city,
        state: e.state,
        location: e.location,
        distances: e.distances,
        coverImage: e.cover_image,
        officialAgency: e.official_agency,
        photographersCount: new Set(ofEvent.map((p) => p.photographer_id)).size,
        totalArchivePhotos: ofEvent.filter((p) => p.media_type === 'photo').length,
        totalVideos: ofEvent.filter((p) => p.media_type === 'video').length,
        checkpoints: e.checkpoints || [],
        status: e.status,
        category: e.category || 'corrida_rua',
        packPrice: Number(e.pack_price),
      };
    });

    res.json({
      events,
      photos,
      pricing: { individualPrice: 14.9, packPrice: 39.9, videoPrice: 19.9, watermarkText: 'FOTORUN PREVIEW', watermarkOpacity: 35 },
    });
  } catch (err) {
    console.error('bootstrap error:', err);
    res.status(500).json({ error: 'Não foi possível carregar o catálogo. Verifique a conexão com o Supabase.' });
  }
});

app.get('/api/coupons/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const { data } = await db.from('coupons').select('code, percent_off').eq('code', code).eq('active', true).maybeSingle();
  if (!data) return res.status(404).json({ error: 'Cupom inválido ou expirado.' });
  res.json({ code: data.code, percentOff: Number(data.percent_off) });
});

app.post('/api/search/facial', async (req, res) => {
  try {
    const { eventId, selfieBase64 } = req.body as { eventId?: string; selfieBase64: string };

    if (!selfieBase64) {
      return res.status(400).json({ error: 'Envie ou capture uma selfie para iniciar a busca facial.' });
    }
    if (!faceModelsAvailable()) {
      return res.status(500).json({ error: 'Reconhecimento facial não configurado no servidor. Rode "npm run models:download".' });
    }

    // LGPD: a selfie e a impressão digital dela são usadas só nesta requisição e não são gravadas.
    const started = Date.now();
    const selfie = await embedSelfie((await normalizeImage(decodeDataUrl(selfieBase64))).buffer);
    if (!selfie) {
      return res.status(422).json({
        error: 'Não encontramos um rosto na sua selfie. Tente outra foto, de frente, com o rosto bem iluminado e sem óculos escuros.',
      });
    }

    const scopedEvent = eventId && eventId !== 'all' ? eventId : null;
    const { data, error } = await db.rpc('match_photo_faces', {
      query_embedding: toPgVector(selfie.embedding),
      p_event_id: scopedEvent,
      match_threshold: FACE_MATCH_THRESHOLD,
    });
    if (error) throw error;

    type MatchRow = { photo_id: string; similarity: number; box: PhotoRow['face_box']; face_px: number };
    // Tira resultados de eventos desativados e de fotógrafos suspensos
    let rows = (data || []) as MatchRow[];
    if (rows.length) {
      const [{ data: info }, disabled, suspended] = await Promise.all([
        db.from('photos').select('id, event_id, photographer_id').in('id', rows.map((m) => m.photo_id)),
        disabledEventIds(),
        suspendedIds(),
      ]);
      const ok = new Set((info || []).filter((p) => !disabled.has(p.event_id) && !suspended.has(p.photographer_id)).map((p) => p.id));
      rows = rows.filter((m) => ok.has(m.photo_id));
    }
    const matches = rows.map((m) => {
      const confidence = similarityToConfidence(Number(m.similarity), FACE_MATCH_THRESHOLD);
      return {
        photoId: m.photo_id,
        confidence,
        reason: confidence >= 85 ? 'Rosto muito semelhante ao da selfie.' : 'Rosto semelhante ao da selfie.',
        faceBox: m.box || undefined,
      };
    });

    // Avisa se ainda há fotos do evento que não passaram pela análise facial
    let pendingQuery = db
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .is('faces_indexed_at', null)
      .is('hidden_at', null)
      .is('purged_at', null);
    if (scopedEvent) pendingQuery = pendingQuery.eq('event_id', scopedEvent);
    const { count: pending } = await pendingQuery;

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[busca facial] evento=${scopedEvent ?? 'todos'} concluída em ${seconds}s — ${matches.length} foto(s) encontrada(s)`);

    res.json({
      selfieSummary:
        (matches.length > 0
          ? `Comparamos seu rosto com todos os rostos ${scopedEvent ? 'deste evento' : 'dos eventos'} em ${seconds}s.`
          : 'Nenhuma foto com o seu rosto foi encontrada. Tente outra selfie, de frente e sem óculos escuros, ou busque pelo número de peito.') +
        (pending ? ` (${pending} foto(s) ainda em análise.)` : ''),
      pendingPhotos: pending || 0,
      matches,
    });
  } catch (err: unknown) {
    console.error('[busca facial] ERRO:', err);
    res.status(500).json({ error: 'Falha ao executar a busca facial. Tente novamente.' });
  }
});

// ---------------------------------------------------------------------------
// Rotas do usuário logado
// ---------------------------------------------------------------------------

/** Dados da conta: perfil, pedidos e, se for fotógrafo, painel completo. */
app.get('/api/me', requireUser, async (req: AuthedRequest, res) => {
  const u = req.user!;
  const base = {
    user: {
      name: u.profile.full_name || u.email.split('@')[0],
      email: u.email,
      phone: u.profile.phone || '',
      role: u.profile.role === 'admin' ? 'photographer' : u.profile.role,
      isAdmin: u.profile.role === 'admin',
      // Fotógrafo que ainda não preencheu o cadastro inicial
      needsOnboarding: u.profile.role !== 'athlete' && !u.profile.onboarded_at,
      bibNumber: u.profile.bib_number || undefined,
      pixKey: u.profile.pix_key || undefined,
    },
    orders: await ordersForBuyer(u.id),
  };

  if (u.profile.role === 'athlete') return res.json(base);

  const [stats, sales, batches] = await Promise.all([
    photographerStats(u.id),
    photographerSales(u.id),
    photographerBatches(u.id),
  ]);
  const { data: ownEvent } = await db.from('events').select('pack_price').eq('owner_id', u.id).limit(1).maybeSingle();

  res.json({
    ...base,
    photographer: {
      stats,
      sales,
      batches,
      pricing: pricingFromProfile(u.profile, ownEvent ? Number(ownEvent.pack_price) : 39.9),
    },
  });
});

app.patch('/api/pricing', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
  const u = req.user!;
  const { individualPrice, packPrice, watermarkText, watermarkOpacity } = req.body ?? {};
  const update: Record<string, unknown> = {};

  if (typeof individualPrice === 'number' && individualPrice > 0) update.individual_price = round2(individualPrice);
  if (typeof watermarkText === 'string' && watermarkText.trim()) update.watermark_text = watermarkText.trim().slice(0, 32);
  if (typeof watermarkOpacity === 'number') update.watermark_opacity = Math.max(10, Math.min(80, Math.round(watermarkOpacity)));

  const { data: profile, error } = await db.from('profiles').update(update).eq('id', u.id).select('*').single();
  if (error) return res.status(500).json({ error: 'Não foi possível salvar a configuração.' });

  // O novo preço vale para todas as fotos deste fotógrafo
  if (update.individual_price) {
    await db.from('photos').update({ price: update.individual_price }).eq('photographer_id', u.id).eq('media_type', 'photo');
  }
  // Preço do pacote: aplicado aos eventos que este fotógrafo administra
  let effectivePack = 39.9;
  if (typeof packPrice === 'number' && packPrice > 0) {
    effectivePack = round2(packPrice);
    await db.from('events').update({ pack_price: effectivePack }).eq('owner_id', u.id);
  }

  const { data: photos } = await db.from('photos').select(PUBLIC_PHOTO_COLUMNS).is('hidden_at', null).is('purged_at', null).order('captured_at', { ascending: false }).limit(2000);
  res.json({
    pricing: pricingFromProfile(profile, effectivePack),
    photos: ((photos || []) as unknown as PhotoRow[]).map(toPublicPhoto),
  });
});

app.post('/api/photos/upload', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
  const u = req.user!;
  try {
    const { eventId, checkpoint, batchName, files } = req.body as {
      eventId: string;
      checkpoint: string;
      batchName: string;
      files: { filename: string; base64: string; mimeType: string }[];
    };

    if (!eventId || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Selecione um evento e ao menos uma foto para enviar.' });
    }
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return res.status(400).json({ error: `Envie no máximo ${MAX_FILES_PER_UPLOAD} fotos por vez.` });
    }

    const { data: eventObj } = await db.from('events').select('id, checkpoints, category, disabled_at').eq('id', eventId).maybeSingle();
    if (!eventObj) return res.status(404).json({ error: 'Evento não encontrado.' });
    if (eventObj.disabled_at) return res.status(403).json({ error: 'Este evento foi desativado pela administração e não aceita novas fotos.' });

    const { data: batch, error: batchError } = await db
      .from('upload_batches')
      .insert({
        event_id: eventId,
        photographer_id: u.id,
        name: batchName?.trim() || `Lote - ${checkpoint || 'Upload Direto'}`,
        checkpoint: checkpoint || 'Percurso Geral',
        status: 'Processando',
      })
      .select('*')
      .single();
    if (batchError || !batch) throw batchError || new Error('Falha ao criar lote.');

    const created: PhotoRow[] = [];
    let facesCount = 0;
    const failures: string[] = [];

    for (const file of files) {
      try {
        // Converte formatos especiais (ex.: JPEG XL .jxl) para JPEG de alta qualidade
        const normalized = await normalizeImage(decodeDataUrl(file.base64), file.filename || 'foto.jpg', file.mimeType);
        const { mimeType, buffer: original } = normalized;
        if (normalized.convertedFrom) console.log(`[upload] ${file.filename}: convertido de ${normalized.convertedFrom.toUpperCase()} para JPEG`);

        const stored = await storePhotoFiles({
          original,
          mimeType,
          photographerId: u.id,
          eventId,
          watermarkText: u.profile.watermark_text,
          watermarkOpacity: u.profile.watermark_opacity,
        });

        let bibNumbers: string[] = [];
        let faceDescriptor = '';
        let caption = `Registro oficial em ${checkpoint || 'Percurso'}`;
        let detectedCheckpoint = checkpoint || eventObj.checkpoints?.[0] || 'Percurso';
        let faceBox: PhotoRow['face_box'] = null;

        // A leitura do número de peito pelo Gemini só roda em categorias que têm número (ex.: não em passeios)
        if (ai && getCategory(eventObj.category).usesBib) {
          try {
            const analysis = await makeAnalysisImage(original);
            const response = await generateWithFallback('upload', {
              contents: {
                parts: [
                  { inlineData: { mimeType: 'image/jpeg', data: analysis.toString('base64') } },
                  {
                    text:
                      'Analise esta fotografia esportiva de corrida de rua. ' +
                      '1) Extraia todos os números de peito (bib numbers) claramente visíveis como strings numéricas. ' +
                      '2) Descreva em português as características do(s) atleta(s) principal(is) (cabelo, óculos/boné, cor da camiseta) para indexação. ' +
                      '3) Estime a caixa delimitadora aproximada do rosto principal em porcentagens 0-100 (top, left, width, height). ' +
                      '4) Gere uma legenda curta em português.',
                  },
                ],
              },
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    bibNumbers: { type: Type.ARRAY, items: { type: Type.STRING } },
                    faceDescriptor: { type: Type.STRING },
                    caption: { type: Type.STRING },
                    suggestedCheckpoint: { type: Type.STRING },
                    faceBox: {
                      type: Type.OBJECT,
                      properties: {
                        top: { type: Type.NUMBER },
                        left: { type: Type.NUMBER },
                        width: { type: Type.NUMBER },
                        height: { type: Type.NUMBER },
                      },
                    },
                  },
                  required: ['bibNumbers', 'faceDescriptor', 'caption'],
                },
              },
            });
            const parsed = JSON.parse((response.text ?? '{}').trim());
            if (Array.isArray(parsed.bibNumbers)) {
              bibNumbers = parsed.bibNumbers.filter((b: unknown) => typeof b === 'string' && b.trim()).map((b: string) => b.trim());
            }
            if (typeof parsed.faceDescriptor === 'string' && parsed.faceDescriptor.trim()) {
              faceDescriptor = parsed.faceDescriptor;
            }
            if (typeof parsed.caption === 'string' && parsed.caption.trim()) caption = parsed.caption;
            if (!checkpoint && typeof parsed.suggestedCheckpoint === 'string' && parsed.suggestedCheckpoint.trim()) {
              detectedCheckpoint = parsed.suggestedCheckpoint;
            }
            if (parsed.faceBox && typeof parsed.faceBox.top === 'number') {
              faceBox = {
                top: Math.max(0, Math.min(95, parsed.faceBox.top)),
                left: Math.max(0, Math.min(95, parsed.faceBox.left)),
                width: Math.max(3, Math.min(60, parsed.faceBox.width)),
                height: Math.max(3, Math.min(60, parsed.faceBox.height)),
              };
            }
          } catch (geminiErr) {
            console.error(`[upload] Falha na indexação por IA (foto salva sem índice): ${describeGeminiError(geminiErr)}`, geminiErr);
          }
        }

        const { data: photo, error: insertError } = await db
          .from('photos')
          .insert({
            event_id: eventId,
            photographer_id: u.id,
            batch_id: batch.id,
            filename: normalized.filename.slice(0, 200),
            original_path: stored.originalPath,
            preview_path: stored.previewPath,
            media_type: 'photo',
            bib_numbers: bibNumbers,
            checkpoint: detectedCheckpoint,
            camera_spec: 'Upload Profissional',
            resolution: stored.resolution,
            caption,
            face_descriptor: faceDescriptor,
            face_box: faceBox,
            price: u.profile.individual_price,
          })
          .select(PUBLIC_PHOTO_COLUMNS)
          .single();
        if (insertError || !photo) throw insertError || new Error('Falha ao registrar foto.');
        const photoRow = photo as unknown as PhotoRow;

        // Reconhecimento facial: encontra todos os rostos e grava a impressão digital de cada um
        try {
          const faces = await indexPhotoFaces(photoRow.id, eventId, original);
          facesCount += faces.count;
          if (faces.largestBox) photoRow.face_box = faces.largestBox;
          console.log(`[upload] ${photoRow.filename}: ${faces.count} rosto(s) indexado(s)`);
        } catch (faceErr) {
          console.error('[upload] Falha na análise facial (foto salva sem rostos; rode "npm run faces:reindex"):', faceErr);
        }

        created.push(photoRow);
      } catch (fileErr) {
        console.error('Falha em um arquivo do lote:', fileErr);
        failures.push(file.filename || 'arquivo');
      }
    }

    const { data: finalBatch } = await db
      .from('upload_batches')
      .update({
        photo_count: created.length,
        faces_indexed: facesCount,
        status: created.length > 0 ? 'Concluído' : 'Em Revisão',
      })
      .eq('id', batch.id)
      .select('*')
      .single();

    if (created.length === 0) {
      return res.status(500).json({ error: 'Nenhuma foto pôde ser processada. Verifique os arquivos e tente novamente.' });
    }

    res.json({
      uploadedCount: created.length,
      failed: failures,
      batch: toBatch(finalBatch || batch),
      photos: created.map(toPublicPhoto),
      photographerStats: await photographerStats(u.id),
    });
  } catch (err: unknown) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Erro ao processar upload das fotos.' });
  }
});

/**
 * Cria o pedido.
 * ATENÇÃO (Passo 3): o pagamento ainda NÃO é cobrado. O pedido é marcado como pago na hora.
 * Quando o gateway (Mercado Pago / Asaas / Pagar.me) for integrado, o pedido nascerá 'pendente'
 * e só passará a 'pago' pelo webhook de confirmação.
 */
app.post('/api/orders', requireUser, async (req: AuthedRequest, res) => {
  const u = req.user!;
  try {
    const { eventId, athleteName, athleteEmail, athletePhone, bibNumber, purchaseType, paymentMethod, photoIds, couponCode, ref } =
      req.body as {
        eventId: string;
        athleteName: string;
        athleteEmail: string;
        athletePhone: string;
        bibNumber?: string;
        purchaseType: 'pack' | 'selected' | 'single';
        paymentMethod: 'pix' | 'card';
        photoIds: string[];
        couponCode?: string;
        /** apelido do fotógrafo que trouxe o atleta (link de divulgação) */
        ref?: string;
      };

    if (!['pack', 'selected', 'single'].includes(purchaseType) || !['pix', 'card'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Pedido inválido.' });
    }

    const { data: eventObj } = await db.from('events').select('id, title, pack_price, disabled_at').eq('id', eventId).maybeSingle();
    if (!eventObj) return res.status(404).json({ error: 'Evento não encontrado.' });
    if (eventObj.disabled_at) return res.status(403).json({ error: 'Este evento não está mais disponível para compra.' });

    const ids = Array.from(new Set((photoIds || []).filter((id) => typeof id === 'string')));
    if (ids.length === 0) return res.status(400).json({ error: 'Selecione ao menos uma foto para concluir o pedido.' });
    if (purchaseType === 'single' && ids.length !== 1) return res.status(400).json({ error: 'Compra avulsa deve ter uma foto.' });

    // Só fotos que existem e pertencem a este evento
    const { data: photos } = await db
      .from('photos')
      .select('id, photographer_id, price')
      .eq('event_id', eventObj.id)
      .is('hidden_at', null)
      .is('purged_at', null)
      .in('id', ids);
    const suspendedSellers = await suspendedIds();
    if (photos) {
      for (let i = photos.length - 1; i >= 0; i--) if (suspendedSellers.has(photos[i].photographer_id)) photos.splice(i, 1);
    }
    if (!photos || photos.length === 0) return res.status(400).json({ error: 'Fotos não encontradas neste evento.' });

    // Não cobra de novo fotos que o atleta já comprou
    const { data: owned } = await db
      .from('order_items')
      .select('photo_id, orders!inner(buyer_id, status)')
      .eq('orders.buyer_id', u.id)
      .eq('orders.status', 'pago')
      .in('photo_id', photos.map((p) => p.id));
    const ownedIds = new Set((owned || []).map((o) => o.photo_id));
    const toBuy = photos.filter((p) => !ownedIds.has(p.id));
    if (toBuy.length === 0) return res.status(400).json({ error: 'Você já comprou estas fotos. Veja em Minhas Fotos.' });

    // Valores por item antes do desconto
    const packPrice = Number(eventObj.pack_price);
    const baseItems = toBuy.map((p) => ({ ...p, base: purchaseType === 'pack' ? packPrice / toBuy.length : Number(p.price) }));
    const subtotal = round2(purchaseType === 'pack' ? packPrice : baseItems.reduce((s, i) => s + i.base, 0));

    let percentOff = 0;
    let appliedCoupon: string | null = null;
    const normalizedCoupon = (couponCode || '').trim().toUpperCase();
    if (normalizedCoupon) {
      const { data: coupon } = await db
        .from('coupons')
        .select('code, percent_off')
        .eq('code', normalizedCoupon)
        .eq('active', true)
        .maybeSingle();
      if (coupon) {
        percentOff = Number(coupon.percent_off);
        appliedCoupon = coupon.code;
      }
    }
    const discount = round2((subtotal * percentOff) / 100);
    const total = round2(Math.max(0.01, subtotal - discount));

    // Quem indicou (link de divulgação). Nunca bloqueia a compra.
    const referredBy = await resolveReferrer(ref, eventObj.id, u.id).catch(() => null);

    // Rateio do total entre os itens (o último absorve a diferença de centavos)
    let allocated = 0;
    const items = baseItems.map((i, idx) => {
      const amount = idx === baseItems.length - 1 ? round2(total - allocated) : round2((i.base / subtotal) * total);
      allocated = round2(allocated + amount);
      // Bônus (se ligado): fotos do próprio fotógrafo que trouxe o atleta pagam taxa menor
      const share = referredBy && REFERRAL_SHARE !== null && i.photographer_id === referredBy ? REFERRAL_SHARE : PHOTOGRAPHER_SHARE;
      return { photo_id: i.id, photographer_id: i.photographer_id, amount, photographer_net: round2(amount * share) };
    });

    const orderId = `FR-${crypto.randomInt(100000, 999999)}`;
    const now = new Date().toISOString();
    const { error: orderError } = await db.from('orders').insert({
      id: orderId,
      buyer_id: u.id,
      event_id: eventObj.id,
      athlete_name: athleteName?.trim() || u.profile.full_name || u.email,
      athlete_email: athleteEmail?.trim() || u.email,
      athlete_phone: athletePhone?.trim() || u.profile.phone,
      bib_number: bibNumber?.trim() || u.profile.bib_number,
      purchase_type: purchaseType,
      payment_method: paymentMethod,
      subtotal,
      discount,
      total_paid: total,
      coupon_code: appliedCoupon,
      referred_by: referredBy,
      status: 'pago', // TODO Passo 3: 'pendente' até o webhook do gateway confirmar
      paid_at: now,
      // Prazo para baixar as fotos (LGPD: os arquivos não ficam guardados para sempre)
      download_expires_at: addMonths(new Date(now), DOWNLOAD_RETENTION_MONTHS).toISOString(),
    });
    if (orderError) throw orderError;

    const { error: itemsError } = await db.from('order_items').insert(items.map((i) => ({ ...i, order_id: orderId })));
    if (itemsError) {
      await db.from('orders').delete().eq('id', orderId);
      throw itemsError;
    }

    const orders = await ordersForBuyer(u.id);
    res.json({ receipt: orders.find((o) => o.id === orderId) });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ error: 'Não foi possível concluir o pedido.' });
  }
});

/** Links temporários (1h) para baixar os originais de um pedido pago do próprio usuário. */
app.get('/api/orders/:id/downloads', requireUser, async (req: AuthedRequest, res) => {
  const u = req.user!;
  const { data: order } = await db
    .from('orders')
    .select('id, buyer_id, status, download_expires_at, order_items(photo_id, photos(id, filename, original_path, purged_at))')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!order || order.buyer_id !== u.id) return res.status(404).json({ error: 'Pedido não encontrado.' });
  if (order.status !== 'pago') return res.status(402).json({ error: 'Pagamento ainda não confirmado.' });
  if (order.download_expires_at && new Date(order.download_expires_at) < new Date()) {
    return res.status(410).json({
      error: `O prazo para baixar estas fotos terminou em ${new Date(order.download_expires_at).toLocaleDateString('pt-BR')}.`,
    });
  }

  type Item = { photo_id: string; photos: { id: string; filename: string; original_path: string; purged_at: string | null } | null };
  const links: Record<string, string> = {};
  for (const item of (order.order_items || []) as unknown as Item[]) {
    if (!item.photos || item.photos.purged_at) continue; // foto removida (prazo ou pedido do titular)
    const name = `${order.id}_${item.photos.filename.replace(/[^\w.\-]+/g, '_')}`;
    links[item.photo_id] = await signedOriginalUrl(item.photos.original_path, name);
  }
  res.json({ links, expiresInSeconds: 3600 });
});

/**
 * Registra o pedido de saque.
 * ATENÇÃO (Passo 3): a transferência Pix ainda não é feita automaticamente;
 * o pedido fica como 'solicitado' para ser pago (manualmente ou pelo gateway).
 */
app.post('/api/payout', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
  const u = req.user!;
  const stats = await photographerStats(u.id);
  if (stats.availablePixBalance <= 0) {
    return res.status(400).json({ error: 'Não há saldo disponível para saque.' });
  }
  if (stats.availablePixBalance < MIN_PAYOUT) {
    return res.status(400).json({ error: `O saque mínimo é de R$ ${MIN_PAYOUT.toFixed(2).replace('.', ',')}.` });
  }
  const account = await getPayoutAccount(u.id);
  if (!account) {
    return res.status(400).json({ error: 'Cadastre sua conta de recebimento antes de solicitar o saque.', code: 'sem_conta' });
  }
  if (account.status !== 'aprovada') {
    return res.status(400).json({
      error:
        account.status === 'recusada'
          ? 'Sua conta de recebimento precisa de correção. Abra "Conta de recebimento" para ver o motivo.'
          : 'Sua conta de recebimento está em análise. Assim que for aprovada, o saque é liberado.',
      code: 'conta_' + account.status,
    });
  }
  const { count: pending } = await db
    .from('payouts')
    .select('id', { count: 'exact', head: true })
    .eq('photographer_id', u.id)
    .eq('status', 'solicitado');
  if ((pending || 0) > 0) {
    return res.status(400).json({ error: 'Você já tem um saque em andamento. Aguarde ele ser pago para pedir outro.' });
  }

  const { error } = await db.from('payouts').insert({
    photographer_id: u.id,
    amount: stats.availablePixBalance,
    pix_key: account.pix_key,
    status: 'solicitado',
  });
  if (error) return res.status(500).json({ error: 'Não foi possível registrar o saque.' });

  const amountLabel = stats.availablePixBalance.toFixed(2).replace('.', ',');
  res.json({
    paidOut: stats.availablePixBalance,
    photographerStats: await photographerStats(u.id),
    message: `Saque de R$ ${amountLabel} solicitado para a chave Pix ${maskPixKey(account.pix_key_type, account.pix_key)}. Cai em até ${PAYOUT_BUSINESS_DAYS} dia(s) útil(eis).`,
  });
});

// ---------------------------------------------------------------------------
// Administração (somente role = 'admin')
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type EventInput = {
  id?: string;
  title?: string;
  eventDate?: string | null;
  city?: string;
  state?: string;
  location?: string;
  distances?: string;
  officialAgency?: string;
  checkpoints?: string[];
  packPrice?: number;
  status?: 'disponivel' | 'em_breve';
  ownerId?: string | null;
  coverImage?: string;
  coverBase64?: string;
  /** Quando o evento nasce de uma solicitação de fotógrafo */
  requestId?: string;
  category?: string;
  facesRetentionMonths?: number;
  photosRetentionMonths?: number;
};

/** Valida e converte o formulário do admin em colunas da tabela events. */
async function eventColumns(input: EventInput, creating: boolean) {
  const errors: string[] = [];
  const cols: Record<string, unknown> = {};

  const title = (input.title || '').trim();
  if (creating || input.title !== undefined) {
    if (!title) errors.push('Informe o nome do evento.');
    cols.title = title.slice(0, 120);
  }
  if (input.eventDate !== undefined) {
    if (input.eventDate && !DATE_RE.test(input.eventDate)) errors.push('Data inválida.');
    cols.event_date = input.eventDate || null;
  }
  for (const [key, col, required, max] of [
    ['city', 'city', true, 80],
    ['state', 'state', true, 2],
    ['location', 'location', false, 160],
    ['distances', 'distances', false, 80],
    ['officialAgency', 'official_agency', false, 120],
  ] as const) {
    const value = input[key];
    if (value === undefined && !creating) continue;
    const v = (value || '').trim();
    if (required && !v) errors.push(key === 'city' ? 'Informe a cidade.' : 'Informe o estado (UF).');
    cols[col] = key === 'state' ? v.toUpperCase().slice(0, max) : v.slice(0, max);
  }
  if (input.checkpoints !== undefined) {
    cols.checkpoints = (input.checkpoints || []).map((c) => String(c).trim()).filter(Boolean).slice(0, 30);
  }
  if (input.packPrice !== undefined) {
    if (!(typeof input.packPrice === 'number' && input.packPrice > 0)) errors.push('Preço do pacote inválido.');
    else cols.pack_price = round2(input.packPrice);
  }
  if (input.facesRetentionMonths !== undefined) {
    const v = Math.round(Number(input.facesRetentionMonths));
    if (!(v >= 1 && v <= 36)) errors.push('Prazo das impressões faciais deve ser de 1 a 36 meses.');
    else cols.faces_retention_months = v;
  }
  if (input.photosRetentionMonths !== undefined) {
    const v = Math.round(Number(input.photosRetentionMonths));
    if (!(v >= 1 && v <= 60)) errors.push('Prazo das fotos deve ser de 1 a 60 meses.');
    else cols.photos_retention_months = v;
  }
  if (input.category !== undefined) {
    if (!isValidCategory(input.category)) errors.push('Categoria inválida.');
    else cols.category = input.category;
  }
  if (input.status !== undefined) {
    if (!['disponivel', 'em_breve'].includes(input.status)) errors.push('Status inválido.');
    cols.status = input.status;
  }
  if (input.ownerId !== undefined) {
    if (input.ownerId) {
      const { data: owner } = await db.from('profiles').select('id, role').eq('id', input.ownerId).maybeSingle();
      if (!owner || !['photographer', 'admin'].includes(owner.role)) errors.push('Fotógrafo responsável inválido.');
    }
    cols.owner_id = input.ownerId || null;
  }
  if (input.coverImage !== undefined && !input.coverBase64) {
    cols.cover_image = (input.coverImage || '').trim();
  }
  return { cols, errors };
}

app.get('/api/admin/events', requireUser, requireAdmin, async (_req, res) => {
  const [{ data: events, error }, { data: photos }, { data: orders }] = await Promise.all([
    db.from('events').select('*, profiles(full_name)').order('event_date', { ascending: false, nullsFirst: true }),
    db.from('photos').select('event_id'),
    db.from('orders').select('event_id').eq('status', 'pago'),
  ]);
  if (error) return res.status(500).json({ error: 'Não foi possível carregar os eventos.' });

  const count = (rows: { event_id: string }[] | null, id: string) => (rows || []).filter((r) => r.event_id === id).length;
  res.json({
    events: (events || []).map((e) => ({
      id: e.id,
      title: e.title,
      eventDate: e.event_date,
      city: e.city,
      state: e.state,
      location: e.location,
      distances: e.distances,
      officialAgency: e.official_agency,
      checkpoints: e.checkpoints || [],
      packPrice: Number(e.pack_price),
      status: e.status,
      category: e.category || 'corrida_rua',
      ownerId: e.owner_id,
      ownerName: e.profiles?.full_name || null,
      facesRetentionMonths: e.faces_retention_months ?? 6,
      photosRetentionMonths: e.photos_retention_months ?? 12,
      disabledAt: e.disabled_at ?? null,
      disabledReason: e.disabled_reason ?? null,
      coverImage: e.cover_image,
      photoCount: count(photos, e.id),
      orderCount: count(orders, e.id),
    })),
  });
});

app.get('/api/admin/photographers', requireUser, requireAdmin, async (_req, res) => {
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['photographer', 'admin'])
    .order('full_name');
  if (error) return res.status(500).json({ error: 'Não foi possível carregar os fotógrafos.' });
  res.json({ photographers: (data || []).map((p) => ({ id: p.id, name: p.full_name || 'Sem nome', isAdmin: p.role === 'admin' })) });
});

app.post('/api/admin/events', requireUser, requireAdmin, async (req, res) => {
  try {
    const input = req.body as EventInput;
    const id = (input.id || '').trim();
    if (!SLUG_RE.test(id) || id.length > 80) {
      return res.status(400).json({ error: 'Endereço do evento inválido: use letras minúsculas, números e hífens (ex: corrida-fortaleza-2026).' });
    }
    const { data: exists } = await db.from('events').select('id').eq('id', id).maybeSingle();
    if (exists) return res.status(409).json({ error: 'Já existe um evento com esse endereço. Escolha outro.' });

    const { cols, errors } = await eventColumns(input, true);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    if (input.coverBase64) {
      cols.cover_image = await storeEventCover((await normalizeImage(decodeDataUrl(input.coverBase64))).buffer, id);
    }

    const { error } = await db.from('events').insert({ id, ...cols });
    if (error) throw error;
    if (input.requestId) await markRequestApproved(input.requestId, id);
    res.json({ ok: true, id });
  } catch (err) {
    console.error('Admin create event error:', err);
    res.status(500).json({ error: 'Não foi possível criar o evento.' });
  }
});

app.patch('/api/admin/events/:id', requireUser, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const input = req.body as EventInput;
    const { cols, errors } = await eventColumns(input, false);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    if (input.coverBase64) {
      cols.cover_image = await storeEventCover((await normalizeImage(decodeDataUrl(input.coverBase64))).buffer, id);
    }

    const { data, error } = await db.from('events').update(cols).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json({ ok: true, id });
  } catch (err) {
    console.error('Admin update event error:', err);
    res.status(500).json({ error: 'Não foi possível salvar o evento.' });
  }
});

app.delete('/api/admin/events/:id', requireUser, requireAdmin, async (req, res) => {
  const id = req.params.id;
  const [{ count: photos }, { count: orders }] = await Promise.all([
    db.from('photos').select('id', { count: 'exact', head: true }).eq('event_id', id),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('event_id', id),
  ]);
  if ((photos || 0) > 0 || (orders || 0) > 0) {
    return res.status(409).json({
      error: 'Este evento já tem fotos ou pedidos e não pode ser excluído. Para tirá-lo da vitrine, use o botão "Desativar".',
    });
  }
  const { error } = await db.from('events').delete().eq('id', id);
  if (error) return res.status(500).json({ error: 'Não foi possível excluir o evento.' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------

registerPainelRoutes(app);
registerPrivacyRoutes(app);
registerPayoutAccountRoutes(app);
registerAdminRoutes(app);
registerReferralRoutes(app);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FotoRun AI server running on http://0.0.0.0:${PORT}`);
  });

  // Limpeza automática de dados vencidos (LGPD)
  scheduleRetention();
}

startServer();
