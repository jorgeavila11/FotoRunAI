import React, { useState } from 'react';
import JSZip from 'jszip';
import {
  CheckCircle2,
  FolderArchive,
  Download,
  Share2,
  Cloud,
  ArrowLeft,
  Loader2,
  Play,
  X,
} from 'lucide-react';
import { OrderReceipt, PhotoItem } from '../types';

interface DownloadsViewProps {
  orders: OrderReceipt[];
  photos: PhotoItem[];
  onBackToGallery: () => void;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  orders,
  photos,
  onBackToGallery,
}) => {
  const latestOrder = orders[0] || null;
  const unlockedPhotos = latestOrder
    ? photos.filter((p) => latestOrder.unlockedPhotoIds.includes(p.id))
    : [];

  const [zipLoading, setZipLoading] = useState(false);
  const [selectedStoryPhotoId, setSelectedStoryPhotoId] = useState<string>(
    unlockedPhotos[0]?.id || photos[0]?.id || ''
  );
  const [frameStyle, setFrameStyle] = useState<'neon' | 'minimal' | 'orange'>('neon');
  const [storyFeedback, setStoryFeedback] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<PhotoItem | null>(null);

  if (!latestOrder || unlockedPhotos.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
          <Cloud className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold text-[#0F172A]">Você ainda não possui fotos compradas</h1>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Encontre suas fotos na galeria de um evento usando reconhecimento facial ou número de peito e finalize o pedido para desbloquear os downloads em 300 DPI.
        </p>
        <button
          type="button"
          onClick={onBackToGallery}
          className="px-5 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Ir para a Galeria do Evento</span>
        </button>
      </div>
    );
  }

  const activeStoryPhoto =
    unlockedPhotos.find((p) => p.id === selectedStoryPhotoId) || unlockedPhotos[0];

  const handleDownloadSingle = async (photo: PhotoItem) => {
    const resp = await fetch(photo.imageUrl);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${latestOrder.id}_${photo.filename.replace(/\s+/g, '_')}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    setZipLoading(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < unlockedPhotos.length; i++) {
        const photo = unlockedPhotos[i];
        const resp = await fetch(photo.imageUrl);
        const blob = await resp.blob();
        const ext = photo.filename.split('.').pop() || 'jpg';
        zip.file(`${String(i + 1).padStart(2, '0')}_${photo.checkpoint.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FotoRun_${latestOrder.id}_${latestOrder.bibNumber.replace('#', '')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setZipLoading(false);
    }
  };

  const handleExportStoryPng = async () => {
    if (!activeStoryPhoto) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = activeStoryPhoto.imageUrl;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw background photo covering 1080x1920
    const scale = Math.max(canvas.width / (img.width || 1080), canvas.height / (img.height || 1920));
    const w = (img.width || 1080) * scale;
    const h = (img.height || 1920) * scale;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

    // Gradient overlay
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, 'rgba(15,23,42,0.68)');
    grad.addColorStop(0.45, 'rgba(15,23,42,0.12)');
    grad.addColorStop(1, 'rgba(15,23,42,0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const accentColor =
      frameStyle === 'neon' ? '#38BDF8' : frameStyle === 'orange' ? '#D04400' : '#FFFFFF';

    // Top event title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText(latestOrder.eventTitle, 72, 130);
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 30px monospace';
    ctx.fillText(`FINISHER · ${latestOrder.bibNumber}`, 72, 185);

    // Bottom metric card
    ctx.fillStyle = 'rgba(15,23,42,0.82)';
    ctx.fillRect(64, 1450, 952, 360);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(64, 1450, 952, 360);

    ctx.fillStyle = '#CBD5E1';
    ctx.font = '600 32px sans-serif';
    ctx.fillText(`${latestOrder.athleteName} · ${latestOrder.category}`, 108, 1525);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 116px monospace';
    ctx.fillText(latestOrder.officialTime, 108, 1665);

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 34px monospace';
    ctx.fillText(`RITMO MÉDIO: ${latestOrder.officialPace}   ·   FOTORUN AI`, 108, 1750);

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Card_Finisher_${latestOrder.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setStoryFeedback('Card Finisher (1080×1920) exportado em PNG!');
    setTimeout(() => setStoryFeedback(null), 4000);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-8 space-y-8">
      {/* ORDER SUCCESS HERO */}
      <section className="bg-[#0F172A] text-white rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#10B981]">
              <CheckCircle2 className="w-4 h-4" />
              <span>Pagamento Confirmado · Pedido #{latestOrder.id}</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              Suas fotos de {latestOrder.eventTitle} estão liberadas!
            </h1>
            <p className="text-sm sm:text-base text-slate-300">
              {unlockedPhotos.length} arquivo(s) em resolução original 300 DPI desbloqueados sem marca d’água para {latestOrder.athleteName}.
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 min-w-[260px] space-y-2 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>Tempo Oficial</span>
              <span className="font-mono-num font-bold text-white">{latestOrder.officialTime}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Ritmo Médio</span>
              <span className="font-mono-num font-bold text-[#38BDF8]">{latestOrder.officialPace}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Total Pago</span>
              <span className="font-mono-num font-bold text-[#10B981]">
                R$ {latestOrder.totalPaid.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={zipLoading}
            className="px-6 py-3.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] disabled:opacity-60 text-white text-sm font-bold inline-flex items-center gap-2.5 transition-colors"
          >
            {zipLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FolderArchive className="w-5 h-5" />}
            <span>{zipLoading ? 'Compactando ZIP...' : `Baixar Tudo em ZIP (${unlockedPhotos.length} arquivos)`}</span>
          </button>

          <button
            type="button"
            onClick={onBackToGallery}
            className="px-4 py-3.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para a Galeria</span>
          </button>
        </div>
      </section>

      {/* FINISHER STORY CARD GENERATOR */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#006577]">
            Compartilhe sua Conquista
          </p>
          <h2 className="text-xl font-extrabold text-[#0F172A] mt-1">
            Gerador de Card Finisher (Stories 1080×1920)
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Escolha uma das suas fotos desbloqueadas e exporte um card pronto para Instagram Stories ou Strava.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-[#F8FAFC] p-6 rounded-xl border border-slate-200">
          {/* 9:16 Live Preview */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-64 h-[440px] rounded-2xl overflow-hidden bg-[#0F172A] border-4 border-[#0F172A] shadow-xl flex flex-col justify-between p-4">
              <img
                src={activeStoryPhoto?.imageUrl}
                alt="Prévia do Card Finisher"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/20 to-[#0F172A]/65" />

              <div className="relative z-10 flex items-center justify-between text-white">
                <span className="text-xs font-bold">{latestOrder.eventTitle}</span>
                <span
                  className={`text-[10px] font-mono-num font-bold px-2 py-0.5 rounded ${
                    frameStyle === 'neon'
                      ? 'bg-[#38BDF8]/20 text-[#38BDF8]'
                      : frameStyle === 'orange'
                      ? 'bg-[#D04400] text-white'
                      : 'bg-white/20 text-white'
                  }`}
                >
                  {latestOrder.bibNumber}
                </span>
              </div>

              <div
                className={`relative z-10 p-3.5 rounded-xl bg-[#0F172A]/85 backdrop-blur-md border ${
                  frameStyle === 'neon'
                    ? 'border-[#38BDF8]'
                    : frameStyle === 'orange'
                    ? 'border-[#D04400]'
                    : 'border-white/40'
                }`}
              >
                <p className="text-[11px] text-slate-300 font-medium">{latestOrder.athleteName}</p>
                <p className="text-2xl font-extrabold text-white font-mono-num mt-0.5">
                  {latestOrder.officialTime}
                </p>
                <p className="text-[11px] text-[#38BDF8] font-mono-num font-bold mt-1">
                  Pace {latestOrder.officialPace} · FotoRun AI
                </p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="lg:col-span-7 space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-bold text-[#0F172A]">Foto Principal</p>
              <div className="grid grid-cols-4 gap-2.5 max-w-md">
                {unlockedPhotos.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedStoryPhotoId(p.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      activeStoryPhoto?.id === p.id ? 'border-[#D04400] ring-2 ring-[#D04400]/20' : 'border-slate-200'
                    }`}
                  >
                    <img
                      src={p.imageUrl}
                      alt={p.caption}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-bold text-[#0F172A]">Estilo da Moldura</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFrameStyle('neon')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                    frameStyle === 'neon'
                      ? 'bg-[#0F172A] text-white'
                      : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  Finisher Neon
                </button>
                <button
                  type="button"
                  onClick={() => setFrameStyle('orange')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                    frameStyle === 'orange'
                      ? 'bg-[#D04400] text-white'
                      : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  Telemetry Orange
                </button>
                <button
                  type="button"
                  onClick={() => setFrameStyle('minimal')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                    frameStyle === 'minimal'
                      ? 'bg-slate-800 text-white'
                      : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  Minimalista
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleExportStoryPng}
                className="px-5 py-3 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold inline-flex items-center gap-2 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>Baixar Card em Alta Resolução (PNG)</span>
              </button>
              {storyFeedback && <span className="text-xs font-semibold text-[#10B981]">{storyFeedback}</span>}
            </div>
          </div>
        </div>
      </section>

      {/* UNLOCKED HIGH-RES PHOTO GRID */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#0F172A]">
            Arquivos Desbloqueados ({unlockedPhotos.length})
          </h2>
          <p className="text-sm text-slate-600">
            Todas as fotos abaixo já estão livres de marca d’água para download individual ou em lote.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {unlockedPhotos.map((photo) => (
            <article
              key={photo.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col"
            >
              <div className="relative aspect-[3/2] bg-slate-900 overflow-hidden">
                <img
                  src={photo.imageUrl}
                  alt={photo.caption}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                {photo.mediaType === 'video' && (
                  <button
                    type="button"
                    onClick={() => setVideoPreview(photo)}
                    aria-label="Reproduzir prévia de vídeo"
                    className="absolute inset-0 bg-black/35 flex items-center justify-center text-white"
                  >
                    <span className="w-12 h-12 rounded-full bg-[#D04400] flex items-center justify-center">
                      <Play className="w-5 h-5 ml-0.5" />
                    </span>
                  </button>
                )}
              </div>
              <div className="p-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#0F172A] truncate">{photo.checkpoint}</p>
                  <p className="text-xs text-slate-500 font-mono-num">{photo.resolution}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadSingle(photo)}
                  className="px-3 py-2 rounded-lg bg-[#0F172A] hover:bg-[#D04400] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {videoPreview && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/85 flex items-center justify-center p-4"
          onClick={() => setVideoPreview(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#0F172A]">{videoPreview.caption}</h3>
              <button
                type="button"
                onClick={() => setVideoPreview(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative aspect-video bg-black">
              <img
                src={videoPreview.imageUrl}
                alt={videoPreview.caption}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs bg-black/70 px-3 py-2 rounded-lg">
                <span>Clipe 4K 60fps · {videoPreview.checkpoint}</span>
                <button
                  type="button"
                  onClick={() => handleDownloadSingle(videoPreview)}
                  className="px-3 py-1 rounded bg-[#D04400] font-bold"
                >
                  Baixar Arquivo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
