import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, MessageCircle, Pencil, Share2 } from 'lucide-react';
import { apiFetch } from '../lib/supabase';
import { eventUrl, shareOrCopy, whatsappLink } from '../lib/share';

interface ShareData {
  slug: string;
  referralFeePercent: number | null;
  platformFeePercent: number;
  totals: { orders: number; total: number; myNet: number };
  events: { id: string; title: string; eventDate: string | null; myPhotos: number; orders: number; total: number; myNet: number }[];
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Painel do fotógrafo: "Divulgue suas fotos" — um link por evento com a marca dele. */
export const ShareLinksPanel: React.FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [slugDraft, setSlugDraft] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/me/share-links');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
      setSlugDraft(d.slug);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível carregar seus links.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const copy = async (id: string, url: string, title: string) => {
    const r = await shareOrCopy(url, title);
    if (r === 'copied') {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2500);
    }
  };

  const saveSlug = async () => {
    setSaving(true);
    setSlugError(null);
    try {
      const res = await apiFetch('/api/me/share-slug', { method: 'PATCH', body: JSON.stringify({ slug: slugDraft.trim().toLowerCase() }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setEditing(false);
      await load();
    } catch (err) {
      setSlugError(err instanceof Error && err.message ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (error) return null; // painel opcional: não atrapalha o resto do painel
  if (!data)
    return (
      <section className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando seus links de divulgação...
      </section>
    );

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4" aria-labelledby="share-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="share-title" className="text-base font-extrabold text-[#0F172A] flex items-center gap-2">
            <Share2 className="w-5 h-5 text-[#D04400]" /> Divulgue suas fotos
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            Mande o seu link no WhatsApp, Instagram ou grupo da corrida. O atleta abre o evento já vendo as suas fotos, e a busca por selfie
            continua procurando em todo o evento. Toda compra feita por quem chegou pelo seu link fica registrada como trazida por você.
            {data.referralFeePercent !== null && (
              <>
                {' '}
                <strong className="text-emerald-700">
                  Bônus: nas suas fotos vendidas por esse caminho a taxa cai de {data.platformFeePercent}% para {data.referralFeePercent}%.
                </strong>
              </>
            )}
          </p>
        </div>
        <dl className="flex gap-4 text-right">
          <div>
            <dt className="text-[11px] text-slate-500">Vendas pelo seu link</dt>
            <dd className="font-extrabold font-mono-num text-[#0F172A]">{data.totals.orders}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Você recebeu delas</dt>
            <dd className="font-extrabold font-mono-num text-emerald-700">{brl(data.totals.myNet)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Seu apelido no link:</span>
        {editing ? (
          <>
            <input
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              maxLength={40}
              aria-label="Apelido do link"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm font-mono-num w-48"
            />
            <button type="button" onClick={saveSlug} disabled={saving} className="px-3 py-1.5 rounded-lg bg-[#0F172A] text-white text-xs font-bold disabled:opacity-60">
              Salvar
            </button>
            <button type="button" onClick={() => { setEditing(false); setSlugDraft(data.slug); setSlugError(null); }} className="px-2 py-1.5 text-xs font-semibold text-slate-600">
              Cancelar
            </button>
            {slugError && <span className="w-full text-xs text-red-600">{slugError}</span>}
          </>
        ) : (
          <>
            <code className="px-2 py-1 rounded bg-slate-100 text-[#0F172A] font-mono-num">{data.slug}</code>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-[#D04400]">
              <Pencil className="w-3.5 h-3.5" /> Trocar
            </button>
          </>
        )}
      </div>

      {data.events.length === 0 ? (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          Seus links aparecem aqui assim que você enviar fotos para um evento.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {data.events.map((e) => {
            const url = eventUrl(e.id, data.slug);
            const text = `Saiu as fotos da ${e.title}! Ache as suas com uma selfie: ${url}`;
            return (
              <li key={e.id} className="p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-bold text-[#0F172A] truncate">{e.title}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0">
                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate font-mono-num">{url}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {e.myPhotos} foto(s) suas · {e.orders} venda(s) pelo link{e.orders > 0 ? ` · você recebeu ${brl(e.myNet)}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copy(e.id, url, e.title)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copied === e.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    {copied === e.id ? 'Copiado!' : 'Copiar link'}
                  </button>
                  <a
                    href={whatsappLink(text)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#128C4A] hover:bg-[#0E6E3A] text-white text-sm font-bold"
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
