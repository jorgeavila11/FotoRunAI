/**
 * Links de evento e de divulgação.
 *   Link do evento:          https://site/?evento=sobral-2026
 *   Link de divulgação:      https://site/?evento=sobral-2026&f=ana-ribeiro
 * Quem chega pelo link de divulgação fica "marcado" por 30 dias para aquele
 * evento: se comprar, a venda conta como trazida por esse fotógrafo.
 */
const KEY = 'fotorun:ref';
const DAYS = 30;
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;

type RefMap = Record<string, { slug: string; at: number }>;

function readMap(): RefMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as RefMap;
  } catch {
    return {};
  }
}

export function eventUrl(eventId: string, slug?: string | null) {
  const u = new URL(window.location.origin + '/');
  u.searchParams.set('evento', eventId);
  if (slug) u.searchParams.set('f', slug);
  return u.toString();
}

/** Lê ?evento= e ?f= da barra de endereço e guarda a indicação. */
export function captureFromUrl(): { eventId: string | null; slug: string | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('evento');
    const rawSlug = (params.get('f') || '').toLowerCase();
    const slug = SLUG_RE.test(rawSlug) ? rawSlug : null;
    if (eventId && slug) {
      const map = readMap();
      map[eventId] = { slug, at: Date.now() }; // último link clicado vale
      localStorage.setItem(KEY, JSON.stringify(map));
    }
    return { eventId, slug };
  } catch {
    return { eventId: null, slug: null };
  }
}

/** Apelido do fotógrafo que trouxe o atleta para este evento (se ainda válido). */
export function getReferral(eventId: string): string | null {
  const r = readMap()[eventId];
  if (!r) return null;
  return Date.now() - r.at <= DAYS * 86400000 ? r.slug : null;
}

/** Compartilha pelo celular (WhatsApp, Instagram...) ou copia o link. */
export async function shareOrCopy(url: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await navigator.share({ title, url });
      return 'shared';
    }
  } catch {
    /* cancelado: cai na cópia */
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
