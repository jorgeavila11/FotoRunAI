import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, X, Loader2, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/supabase';
import { EVENT_CATEGORIES, DEFAULT_CATEGORY, getCategory } from '../data/categories';

export interface EventRequest {
  id: string;
  title: string;
  eventDate: string | null;
  city: string;
  state: string;
  location: string;
  distances: string;
  notes: string;
  status: 'pendente' | 'aprovado' | 'recusado';
  adminNote: string | null;
  eventId: string | null;
  createdAt: string;
  category?: string;
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]';
const labelClass = 'block text-xs font-semibold text-slate-700 mb-1';

const EMPTY = { title: '', category: DEFAULT_CATEGORY, eventDate: '', city: '', state: '', location: '', distances: '', notes: '' };

const STATUS = {
  pendente: { label: 'Aguardando análise', icon: Clock, cls: 'bg-amber-100 text-amber-800' },
  aprovado: { label: 'Aprovado', icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-800' },
  recusado: { label: 'Recusado', icon: XCircle, cls: 'bg-red-100 text-red-700' },
} as const;

interface Props {
  /** Incrementar este número abre o formulário (usado pelo botão do topo do painel). */
  openSignal?: number;
  /** Chamado quando um evento aprovado deve ser aberto no envio de fotos. */
  onUseEvent?: (eventId: string) => void;
}

export const EventRequestsPanel: React.FC<Props> = ({ openSignal = 0, onUseEvent }) => {
  const [requests, setRequests] = useState<EventRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/event-requests/mine');
      const data = await res.json();
      if (res.ok) setRequests(data.requests);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (openSignal > 0) {
      setForm(EMPTY);
      setError(null);
      setOpen(true);
    }
  }, [openSignal]);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.city.trim() || !form.state) {
      setError('Preencha o nome da prova, a cidade e o estado.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/event-requests', { method: 'POST', body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRequests((r) => [data.request, ...r]);
      setOpen(false);
      setNotice(`Solicitação de "${data.request.title}" enviada! Você verá aqui quando o administrador responder.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível enviar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#0F172A]">Solicitações de evento</h2>
          <p className="text-xs text-slate-500">
            Vai cobrir uma prova que ainda não está no FotoRun? Peça a inclusão; o administrador cadastra e avisa você.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY);
            setError(null);
            setOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold"
        >
          <CalendarPlus className="w-4 h-4" /> Solicitar evento
        </button>
      </div>

      {notice && (
        <p className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-slate-500">Você ainda não fez nenhuma solicitação.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {requests.map((r) => {
            const st = STATUS[r.status];
            const Icon = st.icon;
            return (
              <li key={r.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#0F172A] text-sm">{r.title}</p>
                  <p className="text-xs text-slate-500">
                    {getCategory(r.category).label} ·{' '}
                    {r.eventDate ? new Date(`${r.eventDate}T12:00:00`).toLocaleDateString('pt-BR') : 'Data a definir'} · {r.city} - {r.state}
                  </p>
                  {r.status === 'recusado' && r.adminNote && (
                    <p className="mt-1 text-xs text-red-700">Motivo: {r.adminNote}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${st.cls}`}>
                    <Icon className="w-3.5 h-3.5" /> {st.label}
                  </span>
                  {r.status === 'aprovado' && r.eventId && onUseEvent && (
                    <button
                      type="button"
                      onClick={() => onUseEvent(r.eventId!)}
                      className="text-xs font-semibold text-[#D04400] hover:underline"
                    >
                      Enviar fotos
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="req-title">
          <form onSubmit={submit} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 id="req-title" className="text-lg font-extrabold text-[#0F172A]">Solicitar novo evento</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className={labelClass} htmlFor="rq-title">Nome do evento *</label>
              <input id="rq-title" className={inputClass} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Corrida Municipal de Sobral 2026" required />
            </div>
            <div>
              <label className={labelClass} htmlFor="rq-cat">Categoria *</label>
              <select id="rq-cat" className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="rq-date">Data</label>
                <input id="rq-date" type="date" className={inputClass} value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="rq-dist">Distâncias</label>
                <input id="rq-dist" className={inputClass} value={form.distances} onChange={(e) => set('distances', e.target.value)} placeholder="10K e 5K" />
              </div>
              <div>
                <label className={labelClass} htmlFor="rq-city">Cidade *</label>
                <input id="rq-city" className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} required />
              </div>
              <div>
                <label className={labelClass} htmlFor="rq-uf">Estado *</label>
                <select id="rq-uf" className={inputClass} value={form.state} onChange={(e) => set('state', e.target.value)} required>
                  <option value="">Selecione</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="rq-loc">Local da largada</label>
              <input id="rq-loc" className={inputClass} value={form.location} onChange={(e) => set('location', e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="rq-notes">Informações para o administrador</label>
              <textarea
                id="rq-notes"
                rows={3}
                className={inputClass}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Link da inscrição, organizadora da prova, se você é o fotógrafo oficial..."
                maxLength={500}
              />
            </div>

            {error && (
              <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] disabled:opacity-60 text-white text-sm font-bold">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Enviar solicitação
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
