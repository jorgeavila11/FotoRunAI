import React, { useState, useRef } from 'react';
import {
  CloudUpload,
  Eye,
  Wallet,
  CheckCircle2,
  Loader2,
  ImagePlus,
  Shield,
  Receipt,
  AlertCircle,
  CalendarPlus,
} from 'lucide-react';
import {
  EventItem,
  PhotoItem,
  PricingConfig,
  SaleTransaction,
  UploadBatch,
} from '../types';
import { SEEDED_IMAGES } from '../data/assets';
import { apiFetch } from '../lib/supabase';
import { PhotographerInsights } from './PhotographerInsights';
import { EventRequestsPanel } from './EventRequestsPanel';

interface PhotographerDashboardViewProps {
  events: EventItem[];
  batches: UploadBatch[];
  sales: SaleTransaction[];
  pricing: PricingConfig;
  stats: {
    totalPhotosUploaded: number;
    totalSold: number;
    grossRevenue: number;
    availablePixBalance: number;
  };
  onUploaded: (payload: {
    batch: UploadBatch;
    photos: PhotoItem[];
    photographerStats: {
      totalPhotosUploaded: number;
      totalSold: number;
      grossRevenue: number;
      availablePixBalance: number;
    };
  }) => void;
  onUpdatePricing: (pricing: PricingConfig, photos: PhotoItem[]) => void;
  onPayoutDone: (
    stats: {
      totalPhotosUploaded: number;
      totalSold: number;
      grossRevenue: number;
      availablePixBalance: number;
    },
    message: string
  ) => void;
  onViewPublicEvent: (eventId: string) => void;
  photographerName: string;
}

export const PhotographerDashboardView: React.FC<PhotographerDashboardViewProps> = ({
  events,
  batches,
  sales,
  pricing,
  stats,
  onUploaded,
  onUpdatePricing,
  onPayoutDone,
  onViewPublicEvent,
  photographerName,
}) => {
  const [targetEventId, setTargetEventId] = useState(events[0]?.id || 'sobral-online-run-2026');
  const [checkpoint, setCheckpoint] = useState('Linha de Chegada');
  const [batchName, setBatchName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Pricing form state
  const [indivPrice, setIndivPrice] = useState(pricing.individualPrice.toFixed(2).replace('.', ','));
  const [packPrice, setPackPrice] = useState(pricing.packPrice.toFixed(2).replace('.', ','));
  const [watermarkText, setWatermarkText] = useState(pricing.watermarkText);
  const [watermarkOpacity, setWatermarkOpacity] = useState(pricing.watermarkOpacity);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingFeedback, setPricingFeedback] = useState<string | null>(null);

  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);
  // Recarrega os indicadores depois de envios e saques
  const [insightsKey, setInsightsKey] = useState(0);
  // Abre o formulário de solicitação de evento
  const [requestSignal, setRequestSignal] = useState(0);
  const uploadSectionRef = useRef<HTMLElement>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedEvent = events.find((e) => e.id === targetEventId) || events[0];

  const readFileAsBase64 = (file: File): Promise<{ filename: string; base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve({
            filename: file.name,
            base64: reader.result,
            // O Windows não informa o tipo do .jxl; o servidor identifica o formato pelo conteúdo
            mimeType: file.type || (/\.jxl$/i.test(file.name) ? 'image/jxl' : 'image/jpeg'),
          });
        } else {
          reject(new Error('Falha ao ler arquivo'));
        }
      };
      reader.onerror = () => reject(new Error('Erro na leitura da imagem'));
      reader.readAsDataURL(file);
    });
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const validFiles = Array.from(fileList)
      .filter((f) => f.type.startsWith('image/') || /\.jxl$/i.test(f.name))
      .slice(0, 10);
    if (validFiles.length === 0) {
      setUploadError('Selecione arquivos de imagem válidos (JPG, PNG, WebP ou JPEG XL).');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadStatusMsg(`Enviando e indexando ${validFiles.length} foto(s) com IA facial e leitura de número de peito...`);

    try {
      const encoded = await Promise.all(validFiles.map(readFileAsBase64));
      const res = await apiFetch('/api/photos/upload', {
        method: 'POST',
        body: JSON.stringify({
          eventId: targetEventId,
          checkpoint,
          batchName: batchName || `Lote - ${checkpoint}`,
          files: encoded,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao enviar lote.');
      }
      onUploaded({
        batch: data.batch,
        photos: data.photos,
        photographerStats: data.photographerStats,
      });
      setBatchName('');
      setInsightsKey((k) => k + 1);
      setUploadStatusMsg(
        `${data.uploadedCount} foto(s) publicada(s) e indexada(s) na galeria de ${selectedEvent?.title}!` +
          (data.failed?.length ? ` ${data.failed.length} arquivo(s) falharam: ${data.failed.join(', ')}.` : '')
      );
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Falha no upload.');
      setUploadStatusMsg(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedIndiv = parseFloat(indivPrice.replace(',', '.'));
    const parsedPack = parseFloat(packPrice.replace(',', '.'));
    if (Number.isNaN(parsedIndiv) || Number.isNaN(parsedPack) || parsedIndiv <= 0 || parsedPack <= 0) {
      setPricingFeedback('Informe valores numéricos válidos.');
      return;
    }
    setSavingPricing(true);
    setPricingFeedback(null);
    try {
      const res = await apiFetch('/api/pricing', {
        method: 'PATCH',
        body: JSON.stringify({
          individualPrice: parsedIndiv,
          packPrice: parsedPack,
          watermarkText,
          watermarkOpacity,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdatePricing(data.pricing, data.photos);
        setPricingFeedback('Preços atualizados! A nova marca d’água vale para as próximas fotos enviadas.');
      } else {
        setPricingFeedback(data.error || 'Não foi possível salvar.');
      }
    } finally {
      setSavingPricing(false);
    }
  };

  const handleRequestPayout = async () => {
    if (stats.availablePixBalance <= 0) {
      setPayoutMsg('Não há saldo disponível para saque no momento.');
      return;
    }
    setPayoutLoading(true);
    setPayoutMsg(null);
    try {
      const res = await apiFetch('/api/payout', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        onPayoutDone(data.photographerStats, data.message);
        setPayoutMsg(data.message);
        setInsightsKey((k) => k + 1);
      } else {
        setPayoutMsg(data.error || 'Não foi possível solicitar o saque.');
      }
    } finally {
      setPayoutLoading(false);
    }
  };

  const parsedIndivPreview = parseFloat(indivPrice.replace(',', '.')) || 14.9;
  const parsedPackPreview = parseFloat(packPrice.replace(',', '.')) || 39.9;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#006577]">
            Portal do Fotógrafo Credenciado
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight mt-1">
            Painel de Upload, Indexação IA e Vendas
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Envie novas fotografias de corrida para indexação biométrica automática e acompanhe os repasses via Pix.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onViewPublicEvent(targetEventId)}
            className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#0F172A] text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Eye className="w-4 h-4" />
            <span>Ver Vitrine Pública</span>
          </button>

          <button
            type="button"
            onClick={() => setRequestSignal((n) => n + 1)}
            className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#0F172A] text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>Solicitar evento</span>
          </button>

          <button
            type="button"
            onClick={handleRequestPayout}
            disabled={payoutLoading || stats.availablePixBalance <= 0}
            className="px-5 py-2.5 rounded-lg bg-[#10B981] hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            {payoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            <span>Solicitar Saque Pix</span>
          </button>
        </div>
      </div>

      {payoutMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />
            {payoutMsg}
          </span>
          <button type="button" onClick={() => setPayoutMsg(null)} className="text-xs underline">
            Fechar
          </button>
        </div>
      )}

      {/* VISÃO GERAL: ganhos por período, desempenho mensal e vendas por ponto do percurso */}
      <PhotographerInsights refreshKey={insightsKey} />

      {/* SOLICITAÇÕES DE EVENTO */}
      <EventRequestsPanel
        openSignal={requestSignal}
        onUseEvent={(eventId) => {
          setTargetEventId(eventId);
          uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* MASSIVE UPLOAD & AI INDEXING SECTION */}
      <section ref={uploadSectionRef} className="bg-white rounded-xl border border-slate-200 p-6 space-y-6 scroll-mt-24">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <CloudUpload className="w-5 h-5 text-[#D04400]" />
              <span>Upload de Fotos & Indexação Facial Automática</span>
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Ao enviar, nossa IA identifica automaticamente rostos, números de peito e publica na galeria do evento.
            </p>
          </div>
        </div>

        {/* Upload Configuration Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="upload-event" className="block text-xs font-semibold text-slate-700 mb-1">
              Evento de Destino
            </label>
            <select
              id="upload-event"
              value={targetEventId}
              onChange={(e) => {
                const newId = e.target.value;
                setTargetEventId(newId);
                const ev = events.find((x) => x.id === newId);
                if (ev && ev.checkpoints.length > 0) setCheckpoint(ev.checkpoints[0]);
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-[#0F172A] bg-white focus:outline-none focus:border-[#D04400]"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="upload-checkpoint" className="block text-xs font-semibold text-slate-700 mb-1">
              Ponto do Percurso
            </label>
            <select
              id="upload-checkpoint"
              value={checkpoint}
              onChange={(e) => setCheckpoint(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-[#0F172A] bg-white focus:outline-none focus:border-[#D04400]"
            >
              {(selectedEvent?.checkpoints || ['Largada Oficial', 'Linha de Chegada']).map((cp) => (
                <option key={cp} value={cp}>
                  {cp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="upload-batch-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Nome do Lote
            </label>
            <input
              id="upload-batch-name"
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Ex: Lote #04 - Chegada Elite"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]"
            />
          </div>

          <div>
            <label htmlFor="upload-photographer" className="block text-xs font-semibold text-slate-700 mb-1">
              Fotógrafo Responsável
            </label>
            <input
              id="upload-photographer"
              type="text"
              value={photographerName}
              readOnly
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600"
            />
          </div>
        </div>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFilesSelected(e.dataTransfer.files);
          }}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-[#D04400] bg-orange-50'
              : 'border-slate-300 hover:border-[#D04400] bg-[#F8FAFC]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.jxl"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />

          {isUploading ? (
            <div className="space-y-2 py-2">
              <Loader2 className="w-9 h-9 text-[#D04400] animate-spin mx-auto" />
              <p className="text-sm font-bold text-[#0F172A]">{uploadStatusMsg}</p>
              <p className="text-xs text-slate-500">Detectando rostos e números de peito...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center mx-auto text-[#D04400]">
                <ImagePlus className="w-6 h-6" />
              </div>
              <div>
                <p className="text-base font-bold text-[#0F172A]">
                  Arraste fotos aqui ou clique para selecionar arquivos
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Suporta JPG, PNG, WebP e JPEG XL (.jxl) em lote · Indexação facial e leitura de número automáticas
                </p>
              </div>
              <span className="inline-block px-4 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-semibold">
                Selecionar Fotos do Dispositivo
              </span>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {uploadStatusMsg && !isUploading && !uploadError && (
          <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              {uploadStatusMsg}
            </span>
            <button
              type="button"
              onClick={() => onViewPublicEvent(targetEventId)}
              className="text-xs font-bold text-[#D04400] hover:underline whitespace-nowrap"
            >
              Ver na Galeria →
            </button>
          </div>
        )}

        {/* Batch History Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Lote</th>
                <th className="py-3 px-4">Checkpoint</th>
                <th className="py-3 px-4">Fotos</th>
                <th className="py-3 px-4">Rostos Indexados</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-semibold text-[#0F172A]">{b.name}</td>
                  <td className="py-3 px-4 text-slate-600">{b.checkpoint}</td>
                  <td className="py-3 px-4 font-mono-num">{b.photoCount.toLocaleString('pt-BR')}</td>
                  <td className="py-3 px-4 font-mono-num">{b.facesIndexed.toLocaleString('pt-BR')}</td>
                  <td className="py-3 px-4 text-xs font-semibold text-[#10B981]">{b.status}</td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => onViewPublicEvent(b.eventId)}
                      className="text-xs font-semibold text-[#D04400] hover:underline"
                    >
                      Abrir Galeria
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* PRICING CONFIG + WATERMARK LIVE PREVIEW */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSavePricing}
          className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between space-y-6"
        >
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Configuração de Preços e Marca d’Água</h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Ajuste os valores exibidos aos atletas na galeria e personalize o selo de proteção.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-slate-200 bg-[#F8FAFC] space-y-2">
                <label htmlFor="indiv-price" className="block text-sm font-bold text-[#0F172A]">
                  Foto Individual (300 DPI)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">R$</span>
                  <input
                    id="indiv-price"
                    type="text"
                    value={indivPrice}
                    onChange={(e) => setIndivPrice(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-white border border-slate-300 rounded-lg font-mono-num font-bold text-[#0F172A] focus:outline-none focus:border-[#D04400]"
                  />
                </div>
                <p className="text-xs text-slate-600 font-mono-num">
                  Líquido (85%): <strong className="text-[#10B981]">R$ {(parsedIndivPreview * 0.85).toFixed(2).replace('.', ',')}</strong>
                </p>
              </div>

              <div className="p-4 rounded-lg border border-[#D04400]/40 bg-orange-50/40 space-y-2">
                <label htmlFor="pack-price" className="block text-sm font-bold text-[#D04400]">
                  Combo Atleta Completo
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#D04400]">R$</span>
                  <input
                    id="pack-price"
                    type="text"
                    value={packPrice}
                    onChange={(e) => setPackPrice(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-white border border-[#D04400]/60 rounded-lg font-mono-num font-bold text-[#0F172A] focus:outline-none focus:border-[#D04400]"
                  />
                </div>
                <p className="text-xs text-slate-600 font-mono-num">
                  Líquido (85%): <strong className="text-[#10B981]">R$ {(parsedPackPreview * 0.85).toFixed(2).replace('.', ',')}</strong>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="wm-text" className="block text-xs font-semibold text-slate-700 mb-1">
                  Texto da Marca d’Água
                </label>
                <input
                  id="wm-text"
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0F172A]"
                />
              </div>
              <div>
                <label htmlFor="wm-opacity" className="block text-xs font-semibold text-slate-700 mb-1">
                  Opacidade ({watermarkOpacity}%)
                </label>
                <input
                  id="wm-opacity"
                  type="range"
                  min={15}
                  max={75}
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-full accent-[#D04400] mt-2"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-[#10B981] font-semibold">
              {pricingFeedback || 'Taxa de plataforma fixa de 15%'}
            </span>
            <button
              type="submit"
              disabled={savingPricing}
              className="px-5 py-2.5 rounded-lg bg-[#0F172A] hover:bg-[#D04400] text-white text-sm font-bold transition-colors whitespace-nowrap"
            >
              {savingPricing ? 'Salvando...' : 'Salvar Preços e Proteção'}
            </button>
          </div>
        </form>

        {/* Watermark Preview */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">Prévia da Marca d’Água</h3>
              <p className="text-xs text-slate-500">Aplicada automaticamente antes do pagamento</p>
            </div>
            <Shield className="w-5 h-5 text-[#10B981]" />
          </div>

          <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 select-none">
            <img
              src={SEEDED_IMAGES.heroMarathonRunner}
              alt="Prévia da marca d’água esportiva"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top"
            />
            <div
              className="absolute inset-0 watermark-scrim flex items-center justify-center pointer-events-none"
              style={{ opacity: watermarkOpacity / 100 + 0.35 }}
            >
              <span className="text-white/70 font-display font-extrabold text-lg tracking-[0.2em] -rotate-12 border border-white/30 px-4 py-1.5 bg-black/30 rounded">
                {watermarkText || 'FOTORUN PREVIEW'}
              </span>
            </div>
            <span className="absolute top-3 right-3 bg-[#0F172A]/90 text-[#38BDF8] font-mono-num text-xs font-bold px-2.5 py-1 rounded">
              BIB #1042
            </span>
          </div>
        </div>
      </section>

      {/* REAL-TIME SALES TABLE */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#10B981]" />
              <span>Vendas Recentes</span>
            </h2>
            <p className="text-sm text-slate-600">
              Compras confirmadas por atletas com crédito automático de 85% no saldo Pix.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Item Vendido</th>
                <th className="py-3 px-4">BIB</th>
                <th className="py-3 px-4">Atleta</th>
                <th className="py-3 px-4">Horário</th>
                <th className="py-3 px-4">Modalidade</th>
                <th className="py-3 px-4">Líquido Creditado</th>
                <th className="py-3 px-4">Pagamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={s.thumbnailUrl}
                        alt={s.photoLabel}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <span className="font-semibold text-[#0F172A]">{s.photoLabel}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono-num font-bold text-[#006577]">{s.bibNumber}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-[#0F172A]">{s.buyerName}</p>
                    <p className="text-xs text-slate-500">{s.buyerEmail}</p>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{s.timestamp}</td>
                  <td className="py-3 px-4 text-xs font-semibold text-slate-700">{s.purchaseType}</td>
                  <td className="py-3 px-4 font-mono-num font-bold text-[#10B981]">
                    + R$ {s.netAmount.toFixed(2).replace('.', ',')}
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold text-slate-700">{s.paymentMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
