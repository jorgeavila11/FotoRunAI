import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Camera,
  Upload,
  Search,
  Check,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  X,
  Video,
  Award,
  Images,
  Maximize2,
  ShieldCheck,
  Zap,
  Loader2,
  AlertCircle,
  Share2,
  UserRound,
} from 'lucide-react';
import { eventUrl, shareOrCopy } from '../lib/share';
import { getCategory } from '../data/categories';
import { EventItem, FacialMatchResult, PhotoItem, PricingConfig } from '../types';
import { SAMPLE_SELFIES, SEEDED_IMAGES } from '../data/assets';

interface EventGalleryViewProps {
  events: EventItem[];
  activeEvent: EventItem;
  onChangeEvent: (eventId: string) => void;
  photos: PhotoItem[];
  pricing: PricingConfig;
  selectedPhotoIds: string[];
  onToggleSelectPhoto: (photoId: string) => void;
  onSelectAllMatched: (photoIds: string[]) => void;
  onClearSelection: () => void;
  onStartCheckout: (mode: 'pack' | 'selected' | 'single', photoIds: string[]) => void;
  onBackToEvents: () => void;
  initialOpenFacial?: boolean;
  initialBib?: string;
  /** Abre o pedido "Remover minhas fotos" (LGPD) */
  onOpenPrivacy?: () => void;
  /** Apelido do fotógrafo quando o atleta chegou pelo link de divulgação */
  linkedPhotographerSlug?: string | null;
}

export const EventGalleryView: React.FC<EventGalleryViewProps> = ({
  events,
  activeEvent,
  onChangeEvent,
  photos,
  pricing,
  selectedPhotoIds,
  onToggleSelectPhoto,
  onSelectAllMatched,
  onClearSelection,
  onStartCheckout,
  onBackToEvents,
  initialOpenFacial = false,
  initialBib = '',
  onOpenPrivacy,
  linkedPhotographerSlug = null,
}) => {
  // Link de divulgação: começa mostrando as fotos de quem divulgou (dá para ver todas)
  const linkedPhotographer =
    (linkedPhotographerSlug &&
      photos.find((p) => p.eventId === activeEvent.id && p.photographerSlug === linkedPhotographerSlug)?.photographer) ||
    null;
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const shareEvent = async () => {
    const r = await shareOrCopy(eventUrl(activeEvent.id), `Fotos da ${activeEvent.title} no FotoRun`);
    setShareMsg(r === 'copied' ? 'Link copiado! Cole no WhatsApp ou nas redes.' : r === 'failed' ? 'Não deu para copiar. Copie da barra de endereço.' : null);
    if (r !== 'shared') setTimeout(() => setShareMsg(null), 4000);
  };
  const [categoryTab, setCategoryTab] = useState<'all' | 'videos' | 'podium'>('all');
  const [bibQuery, setBibQuery] = useState(initialBib);
  const [checkpointFilter, setCheckpointFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 't1' | 't2' | 't3'>('all');
  const [photographerFilter, setPhotographerFilter] = useState(linkedPhotographer || 'all');
  const [sortBy, setSortBy] = useState<'recent' | 'price' | 'checkpoint'>('recent');

  // Facial recognition state
  const [facialMatches, setFacialMatches] = useState<FacialMatchResult[] | null>(null);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);
  const [selfieSummary, setSelfieSummary] = useState<string | null>(null);
  const [isSearchingFace, setIsSearchingFace] = useState(false);
  const [facialError, setFacialError] = useState<string | null>(null);

  // Camera modal state
  const [cameraModalOpen, setCameraModalOpen] = useState(initialOpenFacial);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Lightbox state
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoItem | null>(null);

  useEffect(() => {
    setBibQuery(initialBib);
  }, [initialBib]);

  useEffect(() => {
    if (initialOpenFacial) {
      setCameraModalOpen(true);
    }
  }, [initialOpenFacial]);

  // Reset facial matches when changing event
  useEffect(() => {
    setFacialMatches(null);
    setSelfiePreviewUrl(null);
    setSelfieSummary(null);
    setFacialError(null);
    setCheckpointFilter('all');
    // Se veio pelo link de divulgação, mantém as fotos de quem divulgou
    setPhotographerFilter(linkedPhotographer || 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvent.id]);

  // Cleanup camera stream on close or unmount
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setCameraError(
        'Não foi possível acessar sua câmera neste navegador. Use o envio de foto abaixo ou teste com um dos atletas de exemplo.'
      );
      setCameraActive(false);
    }
  };

  const runFacialSearch = async (base64DataUrl: string, mimeType = 'image/jpeg') => {
    setIsSearchingFace(true);
    setFacialError(null);
    setSelfiePreviewUrl(base64DataUrl);
    setCameraModalOpen(false);
    stopCamera();

    // Se o servidor não responder em 110s, encerra a espera e mostra o erro
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110_000);
    try {
      const res = await fetch('/api/search/facial', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: activeEvent.id,
          selfieBase64: base64DataUrl,
          mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao executar reconhecimento facial.');
      }
      setFacialMatches(data.matches || []);
      setSelfieSummary(data.selfieSummary || null);
      // A selfie procura em todos os fotógrafos do evento
      setPhotographerFilter('all');
      if (Array.isArray(data.matches) && data.matches.length > 0) {
        onSelectAllMatched(data.matches.map((m: FacialMatchResult) => m.photoId));
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setFacialError('A busca demorou demais e foi interrompida. Tente novamente em instantes.');
      } else {
        setFacialError(err instanceof Error ? err.message : 'Falha na busca facial.');
      }
    } finally {
      clearTimeout(timer);
      setIsSearchingFace(false);
    }
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    runFacialSearch(dataUrl, 'image/jpeg');
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        runFacialSearch(reader.result, file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSampleSelfie = async (imageUrl: string) => {
    try {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          runFacialSearch(reader.result, blob.type || 'image/jpeg');
        }
      };
      reader.readAsDataURL(blob);
    } catch {
      setFacialError('Não foi possível carregar a foto de exemplo.');
    }
  };

  const eventPhotos = photos.filter((p) => p.eventId === activeEvent.id);
  // Categoria define se há número de peito e como chamar os pontos de foto
  const category = getCategory(activeEvent.category);
  const photographers = Array.from(new Set(eventPhotos.map((p) => p.photographer)));
  const matchMap = new Map<string, FacialMatchResult>(
    (facialMatches || []).map((m) => [m.photoId, m])
  );

  const filteredPhotos = eventPhotos
    .filter((photo) => {
      if (categoryTab === 'videos' && photo.mediaType !== 'video') return false;
      if (categoryTab === 'podium' && !photo.isPodium) return false;
      if (facialMatches !== null && !matchMap.has(photo.id)) return false;

      const bibClean = bibQuery.trim().replace('#', '').toLowerCase();
      if (bibClean) {
        const matchesBib = photo.bibNumbers.some((b) => b.toLowerCase().includes(bibClean));
        const matchesCaption = photo.caption.toLowerCase().includes(bibClean);
        if (!matchesBib && !matchesCaption) return false;
      }

      if (checkpointFilter !== 'all' && photo.checkpoint !== checkpointFilter) return false;
      if (timeFilter !== 'all' && photo.timeRange !== timeFilter) return false;
      if (photographerFilter !== 'all' && photo.photographer !== photographerFilter) return false;

      return true;
    })
    .sort((a, b) => {
      if (facialMatches !== null) {
        return (matchMap.get(b.id)?.confidence ?? 0) - (matchMap.get(a.id)?.confidence ?? 0);
      }
      if (sortBy === 'price') return a.price - b.price;
      if (sortBy === 'checkpoint') return a.checkpoint.localeCompare(b.checkpoint);
      return 0;
    });

  const selectedInEvent = eventPhotos.filter((p) => selectedPhotoIds.includes(p.id));
  const selectedTotal = selectedInEvent.reduce((sum, p) => sum + p.price, 0);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-6 sm:py-8 space-y-6">
      {/* Breadcrumb & Event Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToEvents}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#D04400] transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar aos eventos</span>
        </button>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <button
            type="button"
            onClick={shareEvent}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-[#0F172A] hover:border-[#D04400] hover:text-[#D04400]"
          >
            <Share2 className="w-3.5 h-3.5" /> Compartilhar evento
          </button>
          {shareMsg && (
            <span role="status" className="text-emerald-700 font-semibold">
              {shareMsg}
            </span>
          )}
          <label htmlFor="event-switcher" className="font-medium">
            Evento ativo:
          </label>
          <select
            id="event-switcher"
            value={activeEvent.id}
            onChange={(e) => onChangeEvent(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#0F172A] focus:outline-none focus:border-[#D04400]"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({ev.dateLabel})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* EVENT HERO HEADER */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="text-[#10B981]">Evento Concluído · Fotos Disponíveis</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#006577]">Indexação Facial Pronta</span>
            <span aria-hidden="true">·</span>
            <span>{activeEvent.distances}</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#0F172A] tracking-tight">
            {activeEvent.title} <span className="text-[#D04400]">({activeEvent.dateLabel})</span>
          </h1>
          <p className="text-sm text-slate-600">
            {activeEvent.location} · Cobertura oficial por <strong className="text-[#0F172A]">{activeEvent.officialAgency}</strong> ({activeEvent.photographersCount} fotógrafos credenciados)
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 shrink-0">
          <div className="bg-[#0F172A] text-white px-5 py-3.5 rounded-xl">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Acervo Total</p>
            <p className="text-xl font-extrabold font-mono-num mt-0.5">
              {activeEvent.totalArchivePhotos.toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-slate-300">Fotos em 300 DPI</p>
          </div>
          <div className="bg-[#0F172A] text-white px-5 py-3.5 rounded-xl">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Vídeos Ultra HD</p>
            <p className="text-xl font-extrabold font-mono-num mt-0.5 text-[#38BDF8]">
              {activeEvent.totalVideos.toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-slate-300">{category.usesBib ? 'Clipes 4K de chegada' : 'Clipes em vídeo'}</p>
          </div>
        </div>
      </section>

      {/* BIOMETRIC FACIAL SEARCH HERO + TRADITIONAL FILTERS */}
      <section className="bg-[#0F172A] text-white rounded-xl p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
              Reconhecimento Facial Biométrico
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight [text-wrap:balance]">
              Encontre suas fotos instantaneamente enviando uma selfie
            </h2>
            <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
              Tire uma foto pela câmera ou envie uma imagem do seu rosto. Nossa IA compara sua biometria facial com todos os registros do evento em segundos.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setCameraModalOpen(true);
                  startCamera();
                }}
                disabled={isSearchingFace}
                className="px-5 py-3 rounded-lg bg-[#D04400] hover:bg-[#A63500] disabled:opacity-60 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Camera className="w-4 h-4" />
                <span>Tirar Selfie com a Câmera</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSearchingFace}
                className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Upload className="w-4 h-4 text-[#38BDF8]" />
                <span>Enviar Foto do Rosto</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
              />
            </div>

            {onOpenPrivacy && (
              <p className="text-[11px] text-slate-400">
                Não quer aparecer nas fotos?{' '}
                <button type="button" onClick={onOpenPrivacy} className="underline font-semibold text-slate-300 hover:text-white">
                  Remover minhas fotos
                </button>
              </p>
            )}

            {/* Instant sample tests */}
            {category.usesBib && (
            <div className="pt-3 border-t border-white/10 space-y-2">
              <p className="text-xs text-slate-400 font-medium">
                Ou teste agora com um corredor da prova:
              </p>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_SELFIES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    disabled={isSearchingFace}
                    onClick={() => handleSampleSelfie(sample.imageUrl)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-left transition-colors"
                  >
                    <img
                      src={sample.imageUrl}
                      alt={sample.name}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover object-top"
                    />
                    <span className="text-xs font-semibold text-white whitespace-nowrap">{sample.name}</span>
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>

          {/* Right Scanner Preview */}
          <div className="lg:col-span-5">
            <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700 h-64">
              <img
                src={selfiePreviewUrl || SEEDED_IMAGES.athleteSelfiePortrait}
                alt="Visualização biométrica facial do atleta"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/90 via-transparent to-transparent" />

              {isSearchingFace ? (
                <div className="absolute inset-0 bg-[#0F172A]/75 flex flex-col items-center justify-center gap-3 p-4 text-center">
                  <Loader2 className="w-8 h-8 text-[#38BDF8] animate-spin" />
                  <p className="text-sm font-bold text-white">Analisando assinatura facial com IA...</p>
                  <p className="text-xs text-slate-300">Comparando biometria nas fotos de {activeEvent.title}</p>
                </div>
              ) : (
                <>
                  <div
                    className="absolute border-2 border-[#38BDF8] rounded-lg pointer-events-none"
                    style={{ top: '14%', left: '34%', width: '32%', height: '48%' }}
                  >
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-[#38BDF8] animate-scan-beam" />
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs">
                    <span className="text-slate-200 font-medium flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                      {facialMatches !== null
                        ? `${facialMatches.length} registro(s) compatíveis`
                        : 'Biometria LGPD criptografada'}
                    </span>
                    <span className="font-mono-num text-[#38BDF8] font-bold">
                      {facialMatches !== null && facialMatches[0]
                        ? `${facialMatches[0].confidence.toFixed(1)}% Match`
                        : 'Pronto'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Facial search result banner / error */}
        {facialError && (
          <div className="p-4 rounded-lg bg-red-950/60 border border-red-400/40 text-red-100 text-sm flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {facialError}
            </span>
            <button type="button" onClick={() => setFacialError(null)} className="text-xs underline">
              Fechar
            </button>
          </div>
        )}

        {facialMatches !== null && !isSearchingFace && (
          <div className="p-4 rounded-lg bg-slate-800/90 border border-[#38BDF8]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-white">
                {facialMatches.length > 0
                  ? `Encontramos ${facialMatches.length} foto(s) compatíveis com sua biometria facial!`
                  : 'Nenhuma foto compatível foi encontrada neste evento com essa selfie.'}
              </p>
              {selfieSummary && <p className="text-xs text-slate-300">{selfieSummary}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {facialMatches.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onStartCheckout(
                      'pack',
                      facialMatches.map((m) => m.photoId)
                    )
                  }
                  className="px-4 py-2 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-xs font-bold whitespace-nowrap"
                >
                  Levar Todas por R$ {pricing.packPrice.toFixed(2).replace('.', ',')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setFacialMatches(null);
                  setSelfiePreviewUrl(null);
                  setSelfieSummary(null);
                }}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold whitespace-nowrap"
              >
                Ver Todas da Prova
              </button>
            </div>
          </div>
        )}

        {/* Secondary Traditional Filters */}
        <div className="pt-5 border-t border-white/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            {category.usesBib && (
            <div className="lg:col-span-4">
              <label htmlFor="bib-search" className="block text-xs font-semibold text-slate-300 mb-1">
                Número de Peito (Bib Number)
              </label>
              <input
                id="bib-search"
                type="text"
                value={bibQuery}
                onChange={(e) => setBibQuery(e.target.value)}
                placeholder="Ex: 1042, 3821, 731..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-white text-[#0F172A] placeholder:text-slate-400 text-sm font-mono-num font-bold focus:outline-none focus:ring-2 focus:ring-[#D04400]"
              />
            </div>
            )}

            <div className={category.usesBib ? 'lg:col-span-3' : 'lg:col-span-5'}>
              <label htmlFor="checkpoint-select" className="block text-xs font-semibold text-slate-300 mb-1">
                {category.checkpointLabel}
              </label>
              <select
                id="checkpoint-select"
                value={checkpointFilter}
                onChange={(e) => setCheckpointFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white text-[#0F172A] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D04400]"
              >
                <option value="all">Todos</option>
                {activeEvent.checkpoints.map((cp) => (
                  <option key={cp} value={cp}>
                    {cp}
                  </option>
                ))}
              </select>
            </div>

            <div className={category.usesBib ? 'lg:col-span-3' : 'lg:col-span-5'}>
              <label htmlFor="time-select" className="block text-xs font-semibold text-slate-300 mb-1">
                Horário Aproximado
              </label>
              <select
                id="time-select"
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as 'all' | 't1' | 't2' | 't3')}
                className="w-full px-3 py-2.5 rounded-lg bg-white text-[#0F172A] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D04400]"
              >
                <option value="all">Qualquer horário</option>
                {category.usesBib ? (
                  <>
                    <option value="t1">06:00 - 06:45 (Pelotão Elite)</option>
                    <option value="t2">06:45 - 07:30 (Pelotão Geral)</option>
                    <option value="t3">07:30 - 08:30 (Chegada & Pódio)</option>
                  </>
                ) : (
                  <>
                    <option value="t1">Início</option>
                    <option value="t2">Meio</option>
                    <option value="t3">Final</option>
                  </>
                )}
              </select>
            </div>

            <div className="lg:col-span-2">
              <button
                type="button"
                onClick={() => {
                  setBibQuery('');
                  setCheckpointFilter('all');
                  setTimeFilter('all');
                  setPhotographerFilter('all');
                  setFacialMatches(null);
                  setSelfiePreviewUrl(null);
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
              >
                Limpar Filtros
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ATHLETE COMPLETE PACK CALLOUT */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-[#D04400]">
            {category.usesBib ? 'Pacote Atleta Completo' : 'Pacote Completo'} · Economize até 70%
          </p>
          <h3 className="text-lg font-extrabold text-[#0F172A]">
            Leve todas as suas fotos de {activeEvent.title} em 300 DPI sem marca d’água
          </h3>
          <p className="text-sm text-slate-600">
            Inclui liberação instantânea via Pix, download em arquivo ZIP único, disponível por 12 meses.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <span className="block text-xs text-slate-400 line-through font-mono-num">De R$ 149,00</span>
            <span className="text-2xl font-extrabold text-[#D04400] font-mono-num">
              R$ {pricing.packPrice.toFixed(2).replace('.', ',')}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              onStartCheckout(
                'pack',
                filteredPhotos.length > 0 ? filteredPhotos.map((p) => p.id) : eventPhotos.map((p) => p.id)
              )
            }
            className="px-5 py-3 rounded-lg bg-[#0F172A] hover:bg-[#D04400] text-white text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Zap className="w-4 h-4 text-[#38BDF8]" />
            <span>Garantir Pacote</span>
          </button>
        </div>
      </section>

      {/* GALLERY TOOLBAR & FILTERS */}
      <section className="space-y-5">
        {linkedPhotographer && photographerFilter === linkedPhotographer && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <span className="flex items-center gap-2">
              <UserRound className="w-4 h-4 shrink-0" />
              <span>
                Mostrando as fotos de <strong>{linkedPhotographer}</strong>. A busca por selfie procura em todos os fotógrafos do evento.
              </span>
            </span>
            <button type="button" onClick={() => setPhotographerFilter('all')} className="font-bold underline whitespace-nowrap self-start sm:self-auto">
              Ver fotos de todos os fotógrafos
            </button>
          </div>
        )}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
            <button
              type="button"
              onClick={() => setCategoryTab('all')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2 transition-colors ${
                categoryTab === 'all'
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Images className="w-4 h-4" />
              <span>Todas ({eventPhotos.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setCategoryTab('videos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2 transition-colors ${
                categoryTab === 'videos'
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Vídeos ({eventPhotos.filter((p) => p.mediaType === 'video').length})</span>
            </button>
            <button
              type="button"
              onClick={() => setCategoryTab('podium')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2 transition-colors ${
                categoryTab === 'podium'
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>Pódio ({eventPhotos.filter((p) => p.isPodium).length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-400" />
              <select
                value={photographerFilter}
                onChange={(e) => setPhotographerFilter(e.target.value)}
                aria-label="Filtrar por fotógrafo"
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]"
              >
                <option value="all">Todos os Fotógrafos</option>
                {photographers.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'recent' | 'price' | 'checkpoint')}
              aria-label="Ordenar fotos"
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]"
            >
              <option value="recent">Mais recentes primeiro</option>
              <option value="checkpoint">Por ponto do percurso</option>
              <option value="price">Menor preço</option>
            </select>

            {filteredPhotos.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  selectedInEvent.length === filteredPhotos.length
                    ? onClearSelection()
                    : onSelectAllMatched(filteredPhotos.map((p) => p.id))
                }
                className="text-xs font-semibold text-[#D04400] hover:underline whitespace-nowrap"
              >
                {selectedInEvent.length === filteredPhotos.length ? 'Desmarcar exibidas' : 'Selecionar exibidas'}
              </button>
            )}
          </div>
        </div>

        {/* GALLERY GRID */}
        {filteredPhotos.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
            <Search className="w-8 h-8 text-slate-400 mx-auto" />
            <h3 className="text-lg font-bold text-[#0F172A]">Nenhuma foto corresponde aos filtros atuais</h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Tente remover o filtro de número de peito ou usar a busca por selfie facial para localizar seus registros.
            </p>
            <button
              type="button"
              onClick={() => {
                setBibQuery('');
                setCheckpointFilter('all');
                setTimeFilter('all');
                setPhotographerFilter('all');
                setCategoryTab('all');
                setFacialMatches(null);
              }}
              className="px-4 py-2 rounded-lg bg-[#D04400] text-white text-sm font-semibold"
            >
              Mostrar Todas as Fotos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredPhotos.map((photo) => {
              const isSelected = selectedPhotoIds.includes(photo.id);
              const matchInfo = matchMap.get(photo.id);
              return (
                <article
                  key={photo.id}
                  className={`bg-white rounded-xl overflow-hidden border transition-all flex flex-col group ${
                    isSelected ? 'border-[#D04400] ring-2 ring-[#D04400]/20' : 'border-slate-200 hover:shadow-md'
                  }`}
                >
                  {/* Protected Image Preview */}
                  <div
                    className="relative aspect-[3/2] bg-slate-900 overflow-hidden cursor-pointer select-none"
                    onClick={() => setLightboxPhoto(photo)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <img
                      src={photo.imageUrl}
                      alt={photo.caption}
                      referrerPolicy="no-referrer"
                      draggable={false}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* A marca d’água já vem gravada na prévia gerada pelo servidor */}

                    {/* Top Bib & Match overlays */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
                      {photo.mediaType === 'video' || category.usesBib ? (
                        <span className="bg-[#0F172A]/90 text-[#38BDF8] font-mono-num text-[11px] font-bold px-2 py-0.5 rounded">
                          {photo.mediaType === 'video'
                            ? 'VÍDEO 4K'
                            : photo.bibNumbers.length > 0
                            ? `BIB #${photo.bibNumbers[0]}`
                            : 'SEM BIB'}
                        </span>
                      ) : (
                        <span />
                      )}

                      {matchInfo && (
                        <span className="bg-[#10B981] text-white font-mono-num text-[11px] font-bold px-2 py-0.5 rounded">
                          {matchInfo.confidence.toFixed(1)}% Match
                        </span>
                      )}
                    </div>

                    {/* Selection Checkbox + Zoom Icon */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelectPhoto(photo.id);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                          isSelected
                            ? 'bg-[#D04400] text-white'
                            : 'bg-white/95 text-[#0F172A] hover:bg-white'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                            isSelected ? 'border-white bg-white/20' : 'border-slate-400'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span>{isSelected ? 'Selecionada' : 'Selecionar'}</span>
                      </button>

                      <span className="w-7 h-7 rounded-full bg-[#0F172A]/75 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Foto por {photo.photographer}</span>
                        <span className="font-mono-num">{photo.capturedAt}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#0F172A] mt-1 line-clamp-1">
                        {photo.checkpoint}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{photo.caption}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div>
                        <span className="block text-[11px] text-slate-500">Download 300 DPI</span>
                        <span className="text-base font-extrabold text-[#0F172A] font-mono-num">
                          R$ {photo.price.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onStartCheckout('single', [photo.id])}
                        className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-[#D04400] text-[#0F172A] hover:text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Comprar</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* FLOATING SELECTION BAR (Capped cleanly for mobile & desktop) */}
      {selectedInEvent.length > 0 && (
        <div className="sticky bottom-3 z-30 bg-[#0F172A] text-white rounded-xl px-4 sm:px-6 py-3 shadow-xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold font-mono-num">{selectedInEvent.length} foto(s) selecionada(s)</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-300 font-mono-num">
              Total avulso: <strong className="text-white">R$ {selectedTotal.toFixed(2).replace('.', ',')}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() =>
                onStartCheckout(
                  'pack',
                  selectedInEvent.length >= 2
                    ? selectedInEvent.map((p) => p.id)
                    : eventPhotos.map((p) => p.id)
                )
              }
              className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-xs font-bold whitespace-nowrap transition-colors"
            >
              Pacote Completo (R$ {pricing.packPrice.toFixed(2).replace('.', ',')})
            </button>
            <button
              type="button"
              onClick={() => onStartCheckout('selected', selectedInEvent.map((p) => p.id))}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Pagar Seleção
            </button>
          </div>
        </div>
      )}

      {/* CAMERA / SELFIE MODAL */}
      {cameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#0F172A]">Busca Facial por Selfie</h3>
                <p className="text-xs text-slate-500">Enquadre seu rosto com boa iluminação</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCameraModalOpen(false);
                  stopCamera();
                }}
                aria-label="Fechar câmera"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="relative aspect-[4/3] rounded-xl bg-slate-900 overflow-hidden flex items-center justify-center">
                {cameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover -scale-x-100"
                  />
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <Camera className="w-10 h-10 text-[#38BDF8] mx-auto" />
                    <p className="text-sm text-white font-medium">
                      {cameraError || 'Ative sua câmera ou envie uma foto de rosto'}
                    </p>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-4 py-2 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-xs font-bold"
                    >
                      Ativar Câmera
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {cameraActive && (
                  <button
                    type="button"
                    onClick={handleCaptureSnapshot}
                    className="flex-1 py-3 px-4 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold inline-flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capturar Selfie e Buscar</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-3 px-4 rounded-lg border border-slate-300 hover:bg-slate-50 text-[#0F172A] text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>Escolher Foto do Dispositivo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">
                  {lightboxPhoto.checkpoint} · {lightboxPhoto.capturedAt} · {lightboxPhoto.photographer}
                </p>
                <h3 className="text-base font-bold text-[#0F172A]">{lightboxPhoto.caption}</h3>
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                aria-label="Fechar pré-visualização"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className="relative bg-slate-950 flex items-center justify-center max-h-[62vh] overflow-hidden select-none"
              onContextMenu={(e) => e.preventDefault()}
            >
              <img
                src={lightboxPhoto.imageUrl}
                alt={lightboxPhoto.caption}
                referrerPolicy="no-referrer"
                draggable={false}
                className="max-h-[62vh] w-auto object-contain"
              />
            </div>

            <div className="p-5 bg-[#F8FAFC] border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-600 space-y-0.5">
                <p>
                  <strong className="text-[#0F172A]">Especificações:</strong> {lightboxPhoto.resolution} · {lightboxPhoto.cameraSpec}
                </p>
                <p>Arquivo original liberado sem marca d’água imediatamente após o pagamento.</p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const id = lightboxPhoto.id;
                    setLightboxPhoto(null);
                    onStartCheckout('single', [id]);
                  }}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#0F172A] text-sm font-semibold whitespace-nowrap"
                >
                  Comprar Foto (R$ {lightboxPhoto.price.toFixed(2).replace('.', ',')})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const evIds = eventPhotos.map((p) => p.id);
                    setLightboxPhoto(null);
                    onStartCheckout('pack', evIds);
                  }}
                  className="px-4 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold whitespace-nowrap"
                >
                  Pacote Completo (R$ {pricing.packPrice.toFixed(2).replace('.', ',')})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
