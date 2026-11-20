import React, { useState } from 'react';
import { getCategory } from '../data/categories';
import {
  Camera,
  Hash,
  MapPin,
  Calendar,
  ArrowRight,
  ShieldCheck,
  QrCode,
  Sparkles,
  Check,
  Search,
} from 'lucide-react';
import { EventItem } from '../types';
import { SEEDED_IMAGES } from '../data/assets';

interface HomeViewProps {
  events: EventItem[];
  onSelectEvent: (eventId: string, options?: { openFacialModal?: boolean; initialBib?: string }) => void;
  onOpenPhotographer: () => void;
  onOpenAuth: (role?: 'athlete' | 'photographer') => void;
  showEventsOnly?: boolean;
}

export const HomeView: React.FC<HomeViewProps> = ({
  events,
  onSelectEvent,
  onOpenPhotographer,
  onOpenAuth,
  showEventsOnly = false,
}) => {
  const [searchMode, setSearchMode] = useState<'selfie' | 'bib' | 'event'>('selfie');
  const [bibInput, setBibInput] = useState('');
  const [eventQuery, setEventQuery] = useState('');
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('all');

  const cities = ['all', ...Array.from(new Set(events.map((e) => e.city)))];

  const filteredEvents = events.filter((ev) => {
    const matchesCity = selectedCityFilter === 'all' || ev.city === selectedCityFilter;
    const q = eventQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      ev.title.toLowerCase().includes(q) ||
      ev.city.toLowerCase().includes(q) ||
      ev.state.toLowerCase().includes(q) ||
      ev.distances.toLowerCase().includes(q) ||
      getCategory(ev.category).label.toLowerCase().includes(q);
    return matchesCity && matchesQuery;
  });

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchMode === 'bib' && bibInput.trim()) {
      onSelectEvent(events[0].id, { initialBib: bibInput.trim() });
      return;
    }
    if (searchMode === 'event' && filteredEvents.length > 0) {
      onSelectEvent(filteredEvents[0].id);
      return;
    }
    onSelectEvent(events[0].id, { openFacialModal: true });
  };

  if (showEventsOnly) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#D04400]">
              Calendário Oficial de Provas
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0F172A] tracking-tight mt-1">
              Eventos Disponíveis no Brasil
            </h1>
            <p className="text-slate-600 mt-1.5 max-w-2xl">
              Selecione sua corrida para abrir a galeria oficial e localizar seus registros por reconhecimento facial ou número de peito.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={eventQuery}
                onChange={(e) => setEventQuery(e.target.value)}
                placeholder="Filtrar por prova ou cidade..."
                className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400] w-full sm:w-64"
              />
            </div>
          </div>
        </div>

        {/* City filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {cities.map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => setSelectedCityFilter(city)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                selectedCityFilter === city
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              {city === 'all' ? 'Todas as Cidades' : city}
            </button>
          ))}
        </div>

        {filteredEvents.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <p className="text-lg font-bold text-[#0F172A]">Nenhum evento encontrado</p>
            <p className="text-sm text-slate-600">Tente limpar os filtros de cidade ou buscar por outro termo.</p>
            <button
              type="button"
              onClick={() => {
                setEventQuery('');
                setSelectedCityFilter('all');
              }}
              className="px-4 py-2 rounded-lg bg-[#D04400] text-white text-sm font-semibold"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((ev) => (
              <article
                key={ev.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-slate-900">
                  <img
                    src={ev.coverImage}
                    alt={ev.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white text-xs font-medium">
                    <span>{[getCategory(ev.category).label, ev.distances].filter(Boolean).join(' · ')}</span>
                    <span className="font-mono-num">{ev.totalArchivePhotos.toLocaleString('pt-BR')} fotos</span>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                      <span>{ev.dateLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {ev.city}, {ev.state}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-[#0F172A] group-hover:text-[#D04400] transition-colors">
                      {ev.title}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">{ev.location}</p>
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      {ev.photographersCount} fotógrafos · {ev.officialAgency}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectEvent(ev.id)}
                      className="px-4 py-2 rounded-lg bg-[#0F172A] hover:bg-[#D04400] text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors inline-flex items-center gap-1.5"
                    >
                      <span>Ver Fotos</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* HERO SPLIT SECTION */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* Left Column: Headline & Interactive Search Box */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[#D04400]">
                  Reconhecimento Biométrico · Indexação Instantânea
                </p>
                <h1 className="text-3xl sm:text-5xl font-extrabold text-[#0F172A] tracking-tight leading-[1.12] [text-wrap:balance]">
                  Encontre suas fotos de corrida em segundos com <span className="text-[#D04400]">Inteligência Artificial</span>.
                </h1>
                <p className="text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
                  Envie uma selfie ou digite seu número de peito para localizar automaticamente todos os seus registros nas provas oficiais, sem marca d’água após a compra via Pix.
                </p>
              </div>

              {/* Search Hub Card */}
              <form
                onSubmit={handleHeroSearch}
                className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4"
              >
                {/* Segmented Search Tabs */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSearchMode('selfie')}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                      searchMode === 'selfie'
                        ? 'bg-[#0F172A] text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Selfie Facial</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode('bib')}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                      searchMode === 'bib'
                        ? 'bg-[#0F172A] text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    <Hash className="w-4 h-4" />
                    <span>Número de Peito</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode('event')}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                      searchMode === 'event'
                        ? 'bg-[#0F172A] text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                    <span>Evento / Cidade</span>
                  </button>
                </div>

                {/* Mode Input */}
                {searchMode === 'selfie' && (
                  <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                    <button
                      type="button"
                      onClick={() => onSelectEvent(events[0].id, { openFacialModal: true })}
                      className="flex-1 flex items-center gap-3 p-3.5 bg-white rounded-lg border border-dashed border-slate-300 hover:border-[#D04400] text-left transition-colors"
                    >
                      <span className="w-10 h-10 rounded-lg bg-orange-50 text-[#D04400] flex items-center justify-center shrink-0">
                        <Camera className="w-5 h-5" />
                      </span>
                      <div>
                        <span className="block text-sm font-semibold text-[#0F172A]">
                          Tirar Selfie ou Enviar Foto do Rosto
                        </span>
                        <span className="block text-xs text-slate-500">
                          Busca biométrica direta na galeria da prova
                        </span>
                      </div>
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-3.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold whitespace-nowrap shrink-0 transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Buscar Fotos</span>
                    </button>
                  </div>
                )}

                {searchMode === 'bib' && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={bibInput}
                      onChange={(e) => setBibInput(e.target.value)}
                      placeholder="Digite seu número de peito (ex: 1042, 3821, 731)"
                      className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-sm font-mono-num font-semibold text-[#0F172A] focus:outline-none focus:border-[#D04400]"
                    />
                    <button
                      type="submit"
                      className="px-6 py-3 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold whitespace-nowrap shrink-0 transition-colors"
                    >
                      Filtrar Número
                    </button>
                  </div>
                )}

                {searchMode === 'event' && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={eventQuery}
                      onChange={(e) => setEventQuery(e.target.value)}
                      placeholder="Ex: Sobral Online Run, Maratona do Rio, Floripa..."
                      className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]"
                    />
                    <button
                      type="submit"
                      className="px-6 py-3 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold whitespace-nowrap shrink-0 transition-colors"
                    >
                      Abrir Evento
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* Right Column: Biometric Visual Preview */}
            <div className="lg:col-span-5 flex">
              <div className="relative w-full rounded-xl overflow-hidden bg-[#0F172A] min-h-[380px] lg:h-full shadow-sm border border-slate-200">
                <img
                  src={SEEDED_IMAGES.heroMarathonRunner}
                  alt="Atleta brasileiro cruzando linha de chegada com identificação facial"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/85 via-transparent to-black/25" />

                {/* Clean Biometric Bounding Box Indicator */}
                <div
                  className="absolute border-2 border-[#38BDF8] rounded-lg pointer-events-none"
                  style={{ top: '21%', left: '44%', width: '22%', height: '24%' }}
                >
                  <span className="absolute -top-6 left-0 bg-[#0F172A]/90 text-[#38BDF8] text-[11px] font-mono-num font-bold px-2 py-0.5 rounded whitespace-nowrap">
                    99,8% Match Facial
                  </span>
                </div>

                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 text-white">
                  <div>
                    <p className="text-xs text-slate-300">Maratona do Rio · Linha de Chegada</p>
                    <p className="text-sm font-bold font-mono-num">BIB #1042 · Thiago O.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectEvent('sobral-online-run-2026', { openFacialModal: true })}
                    className="px-3.5 py-2 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
                  >
                    Testar Busca Facial
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Proof Strip Below Hero Split */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-10 pt-8 border-t border-slate-200">
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] font-mono-num">+2.500</p>
              <p className="text-sm text-slate-600 mt-0.5">Provas cobertas no Brasil</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] font-mono-num">+15.000</p>
              <p className="text-sm text-slate-600 mt-0.5">Fotógrafos esportivos ativos</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-[#006577] font-mono-num">99,4%</p>
              <p className="text-sm text-slate-600 mt-0.5">Precisão biométrica facial</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-[#D04400] font-mono-num">Imediato</p>
              <p className="text-sm text-slate-600 mt-0.5">Download 300 DPI via Pix</p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (3 Steps) */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-16">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-bold uppercase tracking-wider text-[#D04400]">Fluxo Ultrarrápido</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight mt-1">
            Como encontrar suas fotos em 3 passos
          </h2>
          <p className="text-slate-600 mt-2">
            Da linha de chegada ao download em alta definição sem precisar procurar manualmente entre milhares de arquivos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
            <div className="w-11 h-11 rounded-lg bg-slate-100 text-[#0F172A] flex items-center justify-center">
              <Camera className="w-5 h-5 text-[#D04400]" />
            </div>
            <h3 className="text-lg font-bold text-[#0F172A]">01. Envie uma selfie ou BIB</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Tire uma foto com a câmera do celular ou envie uma imagem do seu rosto. Você também pode filtrar pelo número de peito.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
            <div className="w-11 h-11 rounded-lg bg-slate-100 text-[#0F172A] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#006577]" />
            </div>
            <h3 className="text-lg font-bold text-[#0F172A]">02. Busca Biométrica Instantânea</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Nossa IA analisa pontos faciais e identifica suas aparições em cada ponto do percurso — largada, hidratação, chegada e pódio.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
            <div className="w-11 h-11 rounded-lg bg-slate-100 text-[#0F172A] flex items-center justify-center">
              <QrCode className="w-5 h-5 text-[#10B981]" />
            </div>
            <h3 className="text-lg font-bold text-[#0F172A]">03. Liberação via Pix e ZIP</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Escolha fotos avulsas ou leve o pacote completo com desconto. Pague via Pix e baixe os originais sem marca d’água na hora.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURED EVENTS GRID */}
      <section className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#D04400]">Provas em Destaque</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight mt-1">
                Eventos Recentes no Brasil
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onSelectEvent(events[0].id)}
              className="text-sm font-semibold text-[#D04400] hover:text-[#A63500] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Explorar Sobral Online Run</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {events.map((ev) => (
              <article
                key={ev.id}
                className="bg-[#F8FAFC] rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-all flex flex-col group"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                  <img
                    src={ev.coverImage}
                    alt={ev.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs font-medium">
                    <span>{[getCategory(ev.category).label, ev.distances].filter(Boolean).join(' · ')}</span>
                    <span className="font-mono-num">{ev.totalArchivePhotos.toLocaleString('pt-BR')} fotos</span>
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between bg-white">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{ev.dateLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {ev.city}, {ev.state}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#0F172A] group-hover:text-[#D04400] transition-colors">
                      {ev.title}
                    </h3>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">{ev.photographersCount} fotógrafos</span>
                    <button
                      type="button"
                      onClick={() => onSelectEvent(ev.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#0F172A] hover:bg-[#D04400] text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      Ver Galeria
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* DUAL CONVERSION + LGPD SECTION */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-16 space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Atletas */}
          <div className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#D04400]">Para Atletas</p>
              <h3 className="text-2xl font-extrabold text-[#0F172A]">Você correu?</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Encontre todas as suas fotos em segundos, economize com o pacote completo da prova e gere seu card oficial Finisher para compartilhar.
              </p>
              <ul className="space-y-2.5 text-sm text-slate-700 pt-2">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#D04400] mt-0.5 shrink-0" />
                  <span>Pacote completo com até 70% de economia sobre fotos avulsas</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#D04400] mt-0.5 shrink-0" />
                  <span>Arquivos originais em 300 DPI sem marca d’água</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#D04400] mt-0.5 shrink-0" />
                  <span>Liberação imediata via Pix ou Cartão com download em ZIP</span>
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => onSelectEvent(events[0].id, { openFacialModal: true })}
              className="w-full py-3 px-5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold transition-colors"
            >
              Buscar Minhas Fotos Agora
            </button>
          </div>

          {/* Fotógrafos */}
          <div className="bg-[#0F172A] text-white rounded-xl border border-slate-800 p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">Para Fotógrafos Esportivos</p>
              <h3 className="text-2xl font-extrabold">Monetize sua cobertura com IA</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Suba lotes de fotos e deixe nossa IA detectar rostos e números de peito automaticamente. Receba 85% do valor vendido direto via Pix.
              </p>
              <ul className="space-y-2.5 text-sm text-slate-200 pt-2">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#38BDF8] mt-0.5 shrink-0" />
                  <span>Indexação facial e leitura de número de peito (OCR) automáticas</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#38BDF8] mt-0.5 shrink-0" />
                  <span>Marca d’água dinâmica automática antes do pagamento</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#38BDF8] mt-0.5 shrink-0" />
                  <span>Saque instantâneo via Pix com repasse de 85% por venda</span>
                </li>
              </ul>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onOpenPhotographer}
                className="flex-1 py-3 px-5 rounded-lg bg-[#38BDF8] hover:bg-sky-300 text-[#0F172A] text-sm font-bold transition-colors"
              >
                Abrir Painel do Fotógrafo
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('photographer')}
                className="py-3 px-5 rounded-lg border border-slate-600 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
              >
                Credenciar-se
              </button>
            </div>
          </div>
        </div>

        {/* LGPD Privacy Strip */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4 max-w-3xl">
            <span className="w-11 h-11 rounded-lg bg-emerald-50 text-[#10B981] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-[#0F172A]">Privacidade Biométrica em Conformidade com a LGPD</h3>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                A selfie enviada pelo atleta é usada exclusivamente para localizar suas imagens no evento e é descartada imediatamente após a comparação biométrica.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenAuth('athlete')}
            className="px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm font-semibold text-[#0F172A] whitespace-nowrap shrink-0 transition-colors"
          >
            Criar Conta de Atleta
          </button>
        </div>
      </section>
    </div>
  );
};
