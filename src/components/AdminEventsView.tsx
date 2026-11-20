import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarPlus,
  Pencil,
  Trash2,
  Loader2,
  X,
  ImagePlus,
  MapPin,
  Images,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Inbox,
} from 'lucide-react';
import { apiFetch } from '../lib/supabase';

interface AdminEvent {
  id: string;
  title: string;
  eventDate: string | null;
  city: string;
  state: string;
  location: string;
  distances: string;
  officialAgency: string;
  checkpoints: string[];
  packPrice: number;
  status: 'disponivel' | 'em_breve';
  ownerId: string | null;
  ownerName: string | null;
  coverImage: string;
  photoCount: number;
  orderCount: number;
}

interface PhotographerOption {
  id: string;
  name: string;
  isAdmin: boolean;
}

interface FormState {
  id: string;
  title: string;
  eventDate: string;
  city: string;
  state: string;
  location: string;
  distances: string;
  officialAgency: string;
  checkpointsText: string;
  packPrice: string;
  status: 'disponivel' | 'em_breve';
  ownerId: string;
  coverImage: string;
  coverBase64: string;
  /** Preenchido quando o evento nasce de uma solicitação de fotógrafo */
  requestId: string;
}

interface EventRequestRow {
  id: string;
  title: string;
  eventDate: string | null;
  city: string;
  state: string;
  location: string;
  distances: string;
  notes: string;
  createdAt: string;
  photographerId: string;
  photographerName: string | null;
  photographerCity: string | null;
}

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const EMPTY_FORM: FormState = {
  id: '',
  title: '',
  eventDate: '',
  city: '',
  state: '',
  location: '',
  distances: '',
  officialAgency: '',
  checkpointsText: 'Largada\nLinha de Chegada\nPódio & Premiação',
  packPrice: '39,90',
  status: 'em_breve',
  ownerId: '',
  coverImage: '',
  coverBase64: '',
  requestId: '',
};

/** "Corrida de Fortaleza 2026" -> "corrida-de-fortaleza-2026" */
function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatDate(iso: string | null) {
  if (!iso) return 'Data a definir';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]';
const labelClass = 'block text-xs font-semibold text-slate-700 mb-1';

interface AdminEventsViewProps {
  /** Recarrega o catálogo público depois de qualquer alteração. */
  onEventsChanged: () => void;
  onViewPublicEvent: (eventId: string) => void;
}

export const AdminEventsView: React.FC<AdminEventsViewProps> = ({ onEventsChanged, onViewPublicEvent }) => {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [photographers, setPhotographers] = useState<PhotographerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null); // null = fechado, '' = novo
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [requests, setRequests] = useState<EventRequestRow[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    const res = await apiFetch('/api/admin/event-requests');
    const data = await res.json();
    if (res.ok) setRequests(data.requests);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [evRes, phRes] = await Promise.all([apiFetch('/api/admin/events'), apiFetch('/api/admin/photographers')]);
      const evData = await evRes.json();
      const phData = await phRes.json();
      if (!evRes.ok) throw new Error(evData.error);
      if (!phRes.ok) throw new Error(phData.error);
      setEvents(evData.events);
      setPhotographers(phData.photographers);
    } catch (err) {
      setLoadError(err instanceof Error && err.message ? err.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadRequests();
  }, [load, loadRequests]);

  const isCreating = editingId === '';
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setFormError(null);
    setNotice(null);
    setEditingId('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Abre o formulário de novo evento já preenchido com os dados da solicitação. */
  const openFromRequest = (r: EventRequestRow) => {
    setForm({
      ...EMPTY_FORM,
      id: slugify(r.title),
      title: r.title,
      eventDate: r.eventDate || '',
      city: r.city,
      state: r.state,
      location: r.location,
      distances: r.distances,
      ownerId: r.photographerId,
      requestId: r.id,
    });
    setSlugTouched(false);
    setFormError(null);
    setNotice(null);
    setEditingId('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReject = async (r: EventRequestRow) => {
    setRejectError(null);
    if (!rejectNote.trim()) {
      setRejectError('Escreva o motivo; o fotógrafo vai ver essa mensagem.');
      return;
    }
    const res = await apiFetch(`/api/admin/event-requests/${r.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note: rejectNote }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRejectError(data.error || 'Não foi possível recusar.');
      return;
    }
    setRejectingId(null);
    setRejectNote('');
    setNotice(`Solicitação "${r.title}" recusada. O fotógrafo verá o motivo no painel dele.`);
    loadRequests();
  };

  const openEdit = (ev: AdminEvent) => {
    setForm({
      id: ev.id,
      title: ev.title,
      eventDate: ev.eventDate || '',
      city: ev.city,
      state: ev.state,
      location: ev.location,
      distances: ev.distances,
      officialAgency: ev.officialAgency,
      checkpointsText: ev.checkpoints.join('\n'),
      packPrice: ev.packPrice.toFixed(2).replace('.', ','),
      status: ev.status,
      ownerId: ev.ownerId || '',
      coverImage: ev.coverImage,
      coverBase64: '',
      requestId: '',
    });
    setSlugTouched(true);
    setFormError(null);
    setNotice(null);
    setEditingId(ev.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCoverFile = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('A capa deve ser JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError('A capa deve ter no máximo 10 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('coverBase64', String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const price = Number(form.packPrice.replace(/\./g, '').replace(',', '.'));
    if (!form.title.trim() || !form.city.trim() || !form.state) {
      setFormError('Preencha nome, cidade e estado.');
      return;
    }
    if (!(price > 0)) {
      setFormError('Informe um preço de pacote válido (ex: 39,90).');
      return;
    }

    const payload = {
      ...(isCreating ? { id: form.id } : {}),
      title: form.title,
      eventDate: form.eventDate || null,
      city: form.city,
      state: form.state,
      location: form.location,
      distances: form.distances,
      officialAgency: form.officialAgency,
      checkpoints: form.checkpointsText.split('\n').map((c) => c.trim()).filter(Boolean),
      packPrice: price,
      status: form.status,
      ownerId: form.ownerId || null,
      coverImage: form.coverImage,
      ...(form.coverBase64 ? { coverBase64: form.coverBase64 } : {}),
      ...(isCreating && form.requestId ? { requestId: form.requestId } : {}),
    };

    setSaving(true);
    try {
      const res = await apiFetch(isCreating ? '/api/admin/events' : `/api/admin/events/${encodeURIComponent(form.id)}`, {
        method: isCreating ? 'POST' : 'PATCH',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(
        isCreating
          ? `Evento "${form.title}" criado!${form.requestId ? ' A solicitação foi marcada como aprovada e o fotógrafo já pode enviar fotos.' : ''}`
          : `Evento "${form.title}" atualizado!`
      );
      setEditingId(null);
      await load();
      if (form.requestId) loadRequests();
      onEventsChanged();
    } catch (err) {
      setFormError(err instanceof Error && err.message ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev: AdminEvent) => {
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/events/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(`Evento "${ev.title}" excluído.`);
      await load();
      onEventsChanged();
    } catch (err) {
      setNotice(err instanceof Error && err.message ? err.message : 'Não foi possível excluir.');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const coverPreview = form.coverBase64 || form.coverImage;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#D04400]">Administração</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">Eventos</h1>
          <p className="text-sm text-slate-600">
            Crie e edite os eventos da plataforma. Os fotógrafos só conseguem enviar fotos para eventos cadastrados aqui.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold"
        >
          <CalendarPlus className="w-4 h-4" />
          Novo evento
        </button>
      </div>

      {notice && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* FORMULÁRIO */}
      {editingId !== null && (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-[#0F172A]">
              {isCreating ? (form.requestId ? 'Aprovar solicitação: novo evento' : 'Novo evento') : `Editar: ${form.title}`}
            </h2>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              aria-label="Fechar formulário"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="ev-title">Nome do evento *</label>
                <input
                  id="ev-title"
                  className={inputClass}
                  value={form.title}
                  onChange={(e) => {
                    set('title', e.target.value);
                    if (isCreating && !slugTouched) set('id', slugify(e.target.value));
                  }}
                  placeholder="Corrida de Fortaleza 2026"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="ev-slug">Endereço do evento *</label>
                <div className="flex items-center rounded-lg border border-slate-300 focus-within:border-[#D04400] overflow-hidden">
                  <span className="px-3 py-2 bg-slate-50 text-xs text-slate-500 border-r border-slate-300">/evento/</span>
                  <input
                    id="ev-slug"
                    className="flex-1 px-3 py-2 text-sm font-mono-num text-[#0F172A] focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                    value={form.id}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set('id', slugify(e.target.value));
                    }}
                    disabled={!isCreating}
                    required
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {isCreating ? 'Gerado a partir do nome. Não pode ser alterado depois.' : 'O endereço não pode ser alterado.'}
                </p>
              </div>

              <div>
                <label className={labelClass} htmlFor="ev-date">Data da prova</label>
                <input
                  id="ev-date"
                  type="date"
                  className={inputClass}
                  value={form.eventDate}
                  onChange={(e) => set('eventDate', e.target.value)}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="ev-distances">Distâncias</label>
                <input
                  id="ev-distances"
                  className={inputClass}
                  value={form.distances}
                  onChange={(e) => set('distances', e.target.value)}
                  placeholder="10K e 5K"
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="ev-city">Cidade *</label>
                <input id="ev-city" className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} required />
              </div>

              <div>
                <label className={labelClass} htmlFor="ev-state">Estado *</label>
                <select id="ev-state" className={inputClass} value={form.state} onChange={(e) => set('state', e.target.value)} required>
                  <option value="">Selecione</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="ev-location">Local da largada</label>
                <input
                  id="ev-location"
                  className={inputClass}
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  placeholder="Av. Beira-Mar, Fortaleza - CE"
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="ev-owner">Fotógrafo responsável</label>
                <select id="ev-owner" className={inputClass} value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
                  <option value="">Nenhum (só o administrador)</option>
                  {photographers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.isAdmin ? ' (admin)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">Pode alterar o preço do pacote deste evento no painel dele.</p>
              </div>

              <div>
                <label className={labelClass} htmlFor="ev-agency">Equipe de fotografia (exibida no site)</label>
                <input
                  id="ev-agency"
                  className={inputClass}
                  value={form.officialAgency}
                  onChange={(e) => set('officialAgency', e.target.value)}
                  placeholder="Seu Click Fotografia"
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="ev-price">Preço do pacote (R$) *</label>
                <input
                  id="ev-price"
                  inputMode="decimal"
                  className={`${inputClass} font-mono-num`}
                  value={form.packPrice}
                  onChange={(e) => set('packPrice', e.target.value.replace(/[^\d,.]/g, ''))}
                  required
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="ev-status">Situação</label>
                <select
                  id="ev-status"
                  className={inputClass}
                  value={form.status}
                  onChange={(e) => set('status', e.target.value as FormState['status'])}
                >
                  <option value="em_breve">Em breve (aparece, mas ainda sem fotos à venda)</option>
                  <option value="disponivel">Disponível (fotos à venda)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="ev-checkpoints">Pontos de foto do percurso (um por linha)</label>
                <textarea
                  id="ev-checkpoints"
                  rows={4}
                  className={inputClass}
                  value={form.checkpointsText}
                  onChange={(e) => set('checkpointsText', e.target.value)}
                />
                <p className="mt-1 text-[11px] text-slate-500">Aparecem como filtros na galeria e como opção no envio de fotos.</p>
              </div>
            </div>

            {/* CAPA */}
            <div className="space-y-2">
              <span className={labelClass}>Foto de capa</span>
              <label
                htmlFor="ev-cover"
                className="block aspect-[16/10] rounded-xl border-2 border-dashed border-slate-300 hover:border-[#D04400] bg-slate-50 overflow-hidden cursor-pointer relative"
              >
                {coverPreview ? (
                  <img src={coverPreview} alt="Prévia da capa" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
                    <ImagePlus className="w-8 h-8" />
                    <span>Clique para escolher a capa</span>
                  </div>
                )}
              </label>
              <input
                id="ev-cover"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleCoverFile(e.target.files?.[0])}
              />
              <p className="text-[11px] text-slate-500">JPG, PNG ou WEBP de até 10 MB. Ideal: horizontal, 1600 × 1000 px.</p>
              {coverPreview && (
                <label htmlFor="ev-cover" className="inline-block text-xs font-semibold text-[#D04400] hover:underline cursor-pointer">
                  Trocar capa
                </label>
              )}
            </div>
          </div>

          {formError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] disabled:opacity-60 text-white text-sm font-bold"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isCreating ? 'Criar evento' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      )}

      {/* SOLICITAÇÕES DE FOTÓGRAFOS */}
      {requests.length > 0 && (
        <section className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <Inbox className="w-4 h-4 text-amber-700" /> Solicitações de fotógrafos ({requests.length})
          </h2>
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0F172A]">{r.title}</p>
                    <p className="text-xs text-slate-600">
                      {formatDate(r.eventDate)} · {r.city} - {r.state}
                      {r.distances ? ` · ${r.distances}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">
                      Pedido por <strong>{r.photographerName || 'fotógrafo'}</strong>
                      {r.photographerCity ? ` (${r.photographerCity})` : ''} em{' '}
                      {new Date(r.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                    {r.notes && <p className="mt-1 text-xs text-slate-700 whitespace-pre-line">“{r.notes}”</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openFromRequest(r)}
                      className="px-3 py-2 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white text-sm font-bold"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(rejectingId === r.id ? null : r.id);
                        setRejectNote('');
                        setRejectError(null);
                      }}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Recusar
                    </button>
                  </div>
                </div>
                {rejectingId === r.id && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <label className={labelClass} htmlFor={`rej-${r.id}`}>Motivo da recusa (o fotógrafo verá)</label>
                    <textarea
                      id={`rej-${r.id}`}
                      rows={2}
                      maxLength={300}
                      className={inputClass}
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Ex.: este evento já está cadastrado como “Corrida de Sobral 2026”."
                    />
                    {rejectError && <p className="text-xs text-red-700">{rejectError}</p>}
                    <button
                      type="button"
                      onClick={() => handleReject(r)}
                      className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold"
                    >
                      Confirmar recusa
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* LISTA */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 py-10 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando eventos...
        </div>
      ) : loadError ? (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl text-sm text-slate-600">
          Nenhum evento cadastrado ainda. Clique em <strong>Novo evento</strong> para começar.
        </div>
      ) : (
        <div className="grid gap-3">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="w-full sm:w-36 aspect-[16/10] rounded-lg overflow-hidden bg-slate-100 shrink-0">
                {ev.coverImage && <img src={ev.coverImage} alt="" className="w-full h-full object-cover" />}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-extrabold text-[#0F172A] truncate">{ev.title}</h3>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      ev.status === 'disponivel' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {ev.status === 'disponivel' ? 'Disponível' : 'Em breve'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{formatDate(ev.eventDate)}</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {ev.city} - {ev.state}
                  </span>
                  <span>Pacote R$ {ev.packPrice.toFixed(2).replace('.', ',')}</span>
                  <span>Responsável: {ev.ownerName || '—'}</span>
                </p>
                <p className="text-xs text-slate-500 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <Images className="w-3.5 h-3.5" /> {ev.photoCount} foto(s)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ShoppingBag className="w-3.5 h-3.5" /> {ev.orderCount} pedido(s)
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onViewPublicEvent(ev.id)}
                  title="Ver no site"
                  aria-label={`Ver ${ev.title} no site`}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(ev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-[#0F172A] hover:bg-slate-50"
                >
                  <Pencil className="w-4 h-4" /> Editar
                </button>
                {confirmDeleteId === ev.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDelete(ev)}
                      className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold"
                    >
                      Confirmar exclusão
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(ev.id)}
                    title={ev.photoCount || ev.orderCount ? 'Eventos com fotos ou pedidos não podem ser excluídos' : 'Excluir'}
                    aria-label={`Excluir ${ev.title}`}
                    className="p-2 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
