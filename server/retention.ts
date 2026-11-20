/**
 * Prazos de guarda de dados (LGPD).
 *
 * Regras, contadas a partir da data do evento (ou da criação do evento, se não tiver data):
 *   - Impressões faciais (photo_faces): apagadas após events.faces_retention_months (padrão 6).
 *   - Fotos (original + prévia): apagadas após events.photos_retention_months (padrão 12),
 *     EXCETO se algum comprador ainda estiver dentro do prazo de download.
 *   - Download das fotos compradas: válido por DOWNLOAD_RETENTION_MONTHS (padrão 12) após o pagamento.
 *
 * Uma foto apagada continua como registro (purged_at) para o histórico de vendas, sem arquivos nem biometria.
 */
import { db, BUCKET_ORIGINALS, BUCKET_PREVIEWS } from './supabase';

export const DOWNLOAD_RETENTION_MONTHS = Number(process.env.DOWNLOAD_RETENTION_MONTHS) || 12;

export function addMonths(date: Date, months: number) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export interface RetentionEvent {
  id: string;
  event_date: string | null;
  created_at: string;
  faces_retention_months: number;
  photos_retention_months: number;
}

/** Data de referência do evento: o dia da prova (fim do dia) ou, sem data, a criação do evento. */
function eventBase(e: RetentionEvent) {
  return e.event_date ? new Date(`${e.event_date}T23:59:59Z`) : new Date(e.created_at);
}

/** Decide, sem tocar no banco, quais eventos já passaram de cada prazo. */
export function expiredEvents(events: RetentionEvent[], now = new Date()) {
  return {
    facesExpired: events.filter((e) => addMonths(eventBase(e), e.faces_retention_months) < now).map((e) => e.id),
    photosExpired: events.filter((e) => addMonths(eventBase(e), e.photos_retention_months) < now).map((e) => e.id),
  };
}

/** Das fotos candidatas, separa as que ainda têm download válido para algum comprador. */
export function photosToPurge(candidateIds: string[], activeDownloadIds: Set<string>) {
  return candidateIds.filter((id) => !activeDownloadIds.has(id));
}

type PhotoFiles = { id: string; original_path: string; preview_path: string };

/** Apaga arquivos e impressões faciais e marca as fotos como expurgadas. */
export async function purgePhotos(photos: PhotoFiles[]) {
  if (photos.length === 0) return 0;
  const ids = photos.map((p) => p.id);

  // Remove os arquivos (em lotes; arquivos já inexistentes são ignorados pelo Storage)
  for (let i = 0; i < photos.length; i += 100) {
    const chunk = photos.slice(i, i + 100);
    await db.storage.from(BUCKET_ORIGINALS).remove(chunk.map((p) => p.original_path));
    await db.storage.from(BUCKET_PREVIEWS).remove(chunk.map((p) => p.preview_path));
  }
  const { error: facesError } = await db.from('photo_faces').delete().in('photo_id', ids);
  if (facesError) throw facesError;
  const { error } = await db
    .from('photos')
    .update({ purged_at: new Date().toISOString(), faces_count: 0, face_box: null })
    .in('id', ids);
  if (error) throw error;
  return ids.length;
}

/** Fotos (entre as informadas) que ainda estão dentro do prazo de download de algum pedido pago. */
async function activeDownloadPhotoIds(photoIds: string[]) {
  const active = new Set<string>();
  for (let i = 0; i < photoIds.length; i += 200) {
    const { data, error } = await db
      .from('order_items')
      .select('photo_id, orders!inner(status, download_expires_at)')
      .in('photo_id', photoIds.slice(i, i + 200))
      .eq('orders.status', 'pago')
      .gt('orders.download_expires_at', new Date().toISOString());
    if (error) throw error;
    (data || []).forEach((r) => active.add(r.photo_id as string));
  }
  return active;
}

/**
 * Executa a limpeza. Com dryRun = true só informa o que seria apagado.
 * Processa no máximo `batch` fotos por vez para não sobrecarregar o servidor gratuito.
 */
export async function runRetention({ dryRun = false, batch = 500 } = {}) {
  const { data: events, error } = await db
    .from('events')
    .select('id, event_date, created_at, faces_retention_months, photos_retention_months');
  if (error) throw error;

  const { facesExpired, photosExpired } = expiredEvents((events || []) as RetentionEvent[]);
  const summary = { facesDeleted: 0, photosPurged: 0, photosKeptForDownload: 0, facesEvents: facesExpired, photosEvents: photosExpired };

  // 1. Impressões faciais vencidas
  if (facesExpired.length > 0) {
    const { count } = await db
      .from('photo_faces')
      .select('id', { count: 'exact', head: true })
      .in('event_id', facesExpired);
    summary.facesDeleted = count || 0;
    if (!dryRun && summary.facesDeleted > 0) {
      const { error: delError } = await db.from('photo_faces').delete().in('event_id', facesExpired);
      if (delError) throw delError;
    }
  }

  // 2. Fotos vencidas (respeitando quem comprou e ainda pode baixar)
  if (photosExpired.length > 0) {
    const { data: candidates, error: candError } = await db
      .from('photos')
      .select('id, original_path, preview_path')
      .in('event_id', photosExpired)
      .is('purged_at', null)
      .limit(batch);
    if (candError) throw candError;

    const rows = (candidates || []) as PhotoFiles[];
    const active = await activeDownloadPhotoIds(rows.map((r) => r.id));
    const toPurge = photosToPurge(
      rows.map((r) => r.id),
      active
    );
    summary.photosKeptForDownload = rows.length - toPurge.length;
    summary.photosPurged = toPurge.length;
    if (!dryRun) {
      const set = new Set(toPurge);
      await purgePhotos(rows.filter((r) => set.has(r.id)));
    }
  }

  return summary;
}

/** Agenda a limpeza: 1 minuto depois de o servidor subir e depois a cada 24 horas. */
export function scheduleRetention() {
  if (process.env.RETENTION_ENABLED === 'false') {
    console.log('[retenção] desativada (RETENTION_ENABLED=false)');
    return;
  }
  const run = async () => {
    try {
      const s = await runRetention();
      if (s.facesDeleted || s.photosPurged) {
        console.log(
          `[retenção] ${s.facesDeleted} impressão(ões) facial(is) e ${s.photosPurged} foto(s) apagada(s); ` +
            `${s.photosKeptForDownload} mantida(s) por download ainda válido.`
        );
      }
    } catch (err) {
      console.error('[retenção] falha na limpeza automática:', err);
    }
  };
  setTimeout(run, 60_000);
  setInterval(run, 24 * 3600 * 1000);
}
