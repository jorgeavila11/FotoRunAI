/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw, Lock } from 'lucide-react';
import { supabase, apiFetch } from './lib/supabase';
import {
  ActiveView,
  AuthUser,
  EventItem,
  OrderReceipt,
  PhotoItem,
  PricingConfig,
  SaleTransaction,
  UploadBatch,
  UserRole,
} from './types';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomeView } from './components/HomeView';
import { EventGalleryView } from './components/EventGalleryView';
import { PhotographerDashboardView } from './components/PhotographerDashboardView';
import { AdminEventsView } from './components/AdminEventsView';
import { PhotographerOnboarding } from './components/PhotographerOnboarding';
import { RemoveMyPhotosModal } from './components/RemoveMyPhotosModal';
import { FeesView } from './components/FeesView';
import { PayoutAccountView } from './components/PayoutAccountView';
import { CheckoutModal } from './components/CheckoutModal';
import { DownloadsView } from './components/DownloadsView';
import { AuthModal } from './components/AuthModal';

interface BootstrapPayload {
  events: EventItem[];
  photos: PhotoItem[];
  pricing: PricingConfig;
}

interface MePayload {
  user: AuthUser;
  orders: OrderReceipt[];
  photographer?: {
    stats: { totalPhotosUploaded: number; totalSold: number; grossRevenue: number; availablePixBalance: number };
    sales: SaleTransaction[];
    batches: UploadBatch[];
    pricing: PricingConfig;
  };
}

const EMPTY_STATS = { totalPhotosUploaded: 0, totalSold: 0, grossRevenue: 0, availablePixBalance: 0 };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  const [pricing, setPricing] = useState<PricingConfig>({
    individualPrice: 14.9,
    packPrice: 39.9,
    videoPrice: 19.9,
    watermarkText: 'FOTORUN PREVIEW',
    watermarkOpacity: 35,
  });
  // Configuração de preço do fotógrafo logado (painel)
  const [photographerPricing, setPhotographerPricing] = useState<PricingConfig | null>(null);
  const [photographerStats, setPhotographerStats] = useState(EMPTY_STATS);
  const [pendingCheckout, setPendingCheckout] = useState<{
    mode: 'pack' | 'selected' | 'single';
    photoIds: string[];
  } | null>(null);
  const [orders, setOrders] = useState<OrderReceipt[]>([]);

  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [activeEventId, setActiveEventId] = useState<string>('sobral-online-run-2026');
  const [facialInitOptions, setFacialInitOptions] = useState<{
    openFacialModal?: boolean;
    initialBib?: string;
    nonce: number;
  }>({ nonce: 0 });

  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [checkoutState, setCheckoutState] = useState<{
    isOpen: boolean;
    purchaseType: 'pack' | 'selected' | 'single';
    targetPhotoIds: string[];
  }>({
    isOpen: false,
    purchaseType: 'selected',
    targetPhotoIds: [],
  });

  // Cadastro inicial do fotógrafo: "Agora não" esconde até o próximo acesso
  const [onboardingSkipped, setOnboardingSkipped] = useState(false);
  // Pedido "Remover minhas fotos" (LGPD)
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    initialRole: UserRole;
  }>({
    isOpen: false,
    initialRole: 'athlete',
  });

  const fetchBootstrap = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) {
        throw new Error('Não foi possível carregar o catálogo de eventos.');
      }
      const data: BootstrapPayload = await res.json();
      setEvents(data.events || []);
      setPhotos(data.photos || []);
      if (data.pricing) setPricing(data.pricing);
      if (data.events && data.events.length > 0) {
        setActiveEventId((prev) =>
          data.events.some((ev) => ev.id === prev) ? prev : data.events[0].id
        );
      }
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error ? err.message : 'Erro de conexão com o servidor FotoRun AI.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  /** Carrega perfil, pedidos e (se fotógrafo) o painel do usuário logado. */
  const loadMe = useCallback(async (opts?: { goToDashboard?: boolean }) => {
    try {
      const res = await apiFetch('/api/me');
      if (!res.ok) throw new Error();
      const data: MePayload = await res.json();
      setCurrentUser(data.user);
      setOrders(data.orders || []);
      if (data.photographer) {
        setPhotographerStats(data.photographer.stats);
        setSales(data.photographer.sales);
        setBatches(data.photographer.batches);
        setPhotographerPricing(data.photographer.pricing);
        if (opts?.goToDashboard) {
          setActiveView('photographer');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } catch {
      setCurrentUser(null);
    }
  }, []);

  const clearAccountState = () => {
    setCurrentUser(null);
    setOrders([]);
    setSales([]);
    setBatches([]);
    setPhotographerStats(EMPTY_STATS);
    setPhotographerPricing(null);
  };

  // Sessão do Supabase: restaura ao abrir o site e acompanha login/logout
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadMe();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        clearAccountState();
      } else if (event === 'SIGNED_IN') {
        loadMe();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadMe]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAccountState();
    setActiveView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigate = (view: ActiveView) => {
    setActiveView(view);
    if (view === 'event') {
      setFacialInitOptions((prev) => ({
        openFacialModal: false,
        initialBib: '',
        nonce: prev.nonce + 1,
      }));
    }
    scrollToTop();
  };

  const handleSelectEvent = (
    eventId: string,
    options?: { openFacialModal?: boolean; initialBib?: string }
  ) => {
    setActiveEventId(eventId);
    setFacialInitOptions((prev) => ({
      openFacialModal: Boolean(options?.openFacialModal),
      initialBib: options?.initialBib || '',
      nonce: prev.nonce + 1,
    }));
    setActiveView('event');
    scrollToTop();
  };

  const handleToggleSelectPhoto = (photoId: string) => {
    setSelectedPhotoIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  };

  const handleSelectAllMatched = (photoIds: string[]) => {
    setSelectedPhotoIds((prev) => {
      const merged = new Set([...prev, ...photoIds]);
      return Array.from(merged);
    });
  };

  const handleClearSelection = () => {
    const activeIds = new Set(
      photos.filter((p) => p.eventId === activeEventId).map((p) => p.id)
    );
    setSelectedPhotoIds((prev) => prev.filter((id) => !activeIds.has(id)));
  };

  const handleStartCheckout = (
    mode: 'pack' | 'selected' | 'single',
    photoIds: string[]
  ) => {
    // Compra exige conta (o pedido e os downloads ficam vinculados ao atleta)
    if (!currentUser) {
      setPendingCheckout({ mode, photoIds });
      setAuthModalState({ isOpen: true, initialRole: 'athlete' });
      return;
    }
    const fallbackIds =
      photoIds.length > 0
        ? photoIds
        : photos.filter((p) => p.eventId === activeEventId).map((p) => p.id);

    setCheckoutState({
      isOpen: true,
      purchaseType: mode,
      targetPhotoIds: fallbackIds,
    });
  };

  const handleOpenCartFromNavbar = () => {
    if (selectedPhotoIds.length > 0) {
      handleStartCheckout(selectedPhotoIds.length === 1 ? 'single' : 'selected', selectedPhotoIds);
      return;
    }

    const eventPhotoIds = photos
      .filter((p) => p.eventId === activeEventId)
      .map((p) => p.id);

    if (activeView !== 'event') {
      handleNavigate('event');
      return;
    }

    if (eventPhotoIds.length > 0) {
      handleStartCheckout('pack', eventPhotoIds);
    }
  };

  const handleOpenAuth = (role: UserRole = 'athlete') => {
    setAuthModalState({ isOpen: true, initialRole: role });
  };

  const handleAuthenticated = async () => {
    await loadMe({ goToDashboard: authModalState.initialRole === 'photographer' || activeView === 'photographer' });
    if (pendingCheckout) {
      const { mode, photoIds } = pendingCheckout;
      setPendingCheckout(null);
      const ids = photoIds.length > 0 ? photoIds : photos.filter((p) => p.eventId === activeEventId).map((p) => p.id);
      setCheckoutState({ isOpen: true, purchaseType: mode, targetPhotoIds: ids });
    }
  };

  const loginGate = (title: string, text: string, role: UserRole) => (
    <div className="max-w-lg mx-auto my-16 bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
      <Lock className="w-10 h-10 text-[#D04400] mx-auto" />
      <h1 className="text-lg font-extrabold text-[#0F172A]">{title}</h1>
      <p className="text-sm text-slate-600">{text}</p>
      <button
        type="button"
        onClick={() => handleOpenAuth(role)}
        className="px-5 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold"
      >
        Entrar ou criar conta
      </button>
    </div>
  );

  const activeEvent = events.find((e) => e.id === activeEventId) || events[0];
  // Preço do pacote é definido por evento
  const eventPricing: PricingConfig = { ...pricing, packPrice: activeEvent?.packPrice ?? pricing.packPrice };
  const targetPhotosForCheckout = photos.filter((p) =>
    checkoutState.targetPhotoIds.includes(p.id)
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <Navbar
        activeView={activeView}
        onNavigate={handleNavigate}
        cartCount={selectedPhotoIds.length}
        onOpenCart={handleOpenCartFromNavbar}
        currentUser={currentUser}
        onOpenAuth={() => handleOpenAuth('athlete')}
        hasOrders={orders.length > 0}
        onLogout={handleLogout}
      />

      <main className="flex-1">
        {loading ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Loader2 className="w-9 h-9 text-[#D04400] animate-spin" />
            <p className="text-sm font-bold text-[#0F172A]">
              Carregando galerias e motor biométrico FotoRun AI...
            </p>
          </div>
        ) : loadError || !activeEvent ? (
          <div className="max-w-lg mx-auto my-16 bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <h1 className="text-lg font-extrabold text-[#0F172A]">
              Não foi possível conectar ao catálogo
            </h1>
            <p className="text-sm text-slate-600">
              {loadError || 'Nenhum evento disponível no momento.'}
            </p>
            <button
              type="button"
              onClick={fetchBootstrap}
              className="px-5 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tentar Novamente</span>
            </button>
          </div>
        ) : (
          <>
            {activeView === 'home' && (
              <HomeView
                events={events}
                onSelectEvent={handleSelectEvent}
                onOpenPhotographer={() => handleNavigate('photographer')}
                onOpenAuth={handleOpenAuth}
              />
            )}

            {activeView === 'events' && (
              <HomeView
                events={events}
                onSelectEvent={handleSelectEvent}
                onOpenPhotographer={() => handleNavigate('photographer')}
                onOpenAuth={handleOpenAuth}
                showEventsOnly
              />
            )}

            {activeView === 'event' && (
              <EventGalleryView
                onOpenPrivacy={() => setPrivacyOpen(true)}
                key={`${activeEvent.id}-${facialInitOptions.nonce}`}
                events={events}
                activeEvent={activeEvent}
                onChangeEvent={(newEventId) => {
                  setActiveEventId(newEventId);
                  setFacialInitOptions((prev) => ({
                    openFacialModal: false,
                    initialBib: '',
                    nonce: prev.nonce + 1,
                  }));
                }}
                photos={photos}
                pricing={eventPricing}
                selectedPhotoIds={selectedPhotoIds}
                onToggleSelectPhoto={handleToggleSelectPhoto}
                onSelectAllMatched={handleSelectAllMatched}
                onClearSelection={handleClearSelection}
                onStartCheckout={handleStartCheckout}
                onBackToEvents={() => handleNavigate('events')}
                initialOpenFacial={facialInitOptions.openFacialModal}
                initialBib={facialInitOptions.initialBib}
              />
            )}

            {activeView === 'photographer' && currentUser?.role !== 'photographer' &&
              loginGate(
                'Área do fotógrafo',
                currentUser
                  ? 'Sua conta é de atleta. Para vender fotos, crie uma conta de fotógrafo com outro e-mail.'
                  : 'Entre com sua conta de fotógrafo para enviar fotos, definir preços e acompanhar vendas.',
                'photographer'
              )}

            {activeView === 'photographer' && currentUser?.role === 'photographer' && (
              <PhotographerDashboardView
                key={photographerPricing ? 'ready' : 'loading'}
                photographerName={currentUser.name}
                events={events}
                batches={batches}
                sales={sales}
                pricing={photographerPricing || pricing}
                stats={photographerStats}
                onUploaded={({ batch, photos: newPhotos, photographerStats: nextStats }) => {
                  setPhotos((prev) => [...newPhotos, ...prev]);
                  setBatches((prev) => [batch, ...prev]);
                  setEvents((prev) =>
                    prev.map((ev) =>
                      ev.id === batch.eventId
                        ? { ...ev, totalArchivePhotos: ev.totalArchivePhotos + newPhotos.length }
                        : ev
                    )
                  );
                  setPhotographerStats(nextStats);
                }}
                onUpdatePricing={(nextPricing, updatedPhotos) => {
                  setPhotographerPricing(nextPricing);
                  setPhotos(updatedPhotos);
                  fetchBootstrap();
                }}
                onPayoutDone={(nextStats) => {
                  setPhotographerStats(nextStats);
                }}
                onViewPublicEvent={(eventId) => handleSelectEvent(eventId)}
                onOpenPayoutAccount={() => handleNavigate('conta-recebimento')}
                onOpenFees={() => handleNavigate('taxas')}
              />
            )}

            {activeView === 'taxas' && (
              <FeesView currentUser={currentUser} onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />
            )}

            {activeView === 'conta-recebimento' && currentUser?.role !== 'photographer' &&
              loginGate('Conta de recebimento', 'Entre com sua conta de fotógrafo para cadastrar onde receber seus repasses.', 'photographer')}

            {activeView === 'conta-recebimento' && currentUser?.role === 'photographer' && (
              <PayoutAccountView onNavigate={handleNavigate} />
            )}

            {activeView === 'admin' && !currentUser?.isAdmin &&
              loginGate(
                'Administração',
                currentUser
                  ? 'Esta área é exclusiva do administrador da plataforma.'
                  : 'Entre com a conta de administrador para gerenciar os eventos.',
                'photographer'
              )}

            {activeView === 'admin' && currentUser?.isAdmin && (
              <AdminEventsView
                onEventsChanged={fetchBootstrap}
                onViewPublicEvent={(eventId) => handleSelectEvent(eventId)}
              />
            )}

            {activeView === 'downloads' && !currentUser &&
              loginGate('Minhas fotos', 'Entre na sua conta para ver e baixar as fotos que você comprou.', 'athlete')}

            {activeView === 'downloads' && currentUser && (
              <DownloadsView
                key={orders[0]?.id || 'empty'}
                orders={orders}
                photos={photos}
                onBackToGallery={() => handleNavigate('event')}
              />
            )}
          </>
        )}
      </main>

      <Footer onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} onOpenPrivacy={() => setPrivacyOpen(true)} />

      {privacyOpen && (
        <RemoveMyPhotosModal
          currentUser={currentUser}
          onClose={() => {
            setPrivacyOpen(false);
            fetchBootstrap(); // fotos retiradas somem da vitrine
          }}
          onRequireLogin={() => {
            setPrivacyOpen(false);
            handleOpenAuth('athlete');
          }}
        />
      )}

      {activeView === 'photographer' && currentUser?.role === 'photographer' && currentUser.needsOnboarding && !onboardingSkipped && (
        <PhotographerOnboarding
          name={currentUser.name}
          onDone={() => loadMe()}
          onSkip={() => setOnboardingSkipped(true)}
        />
      )}

      {checkoutState.isOpen && activeEvent && (
        <CheckoutModal
          isOpen={checkoutState.isOpen}
          onClose={() => setCheckoutState((prev) => ({ ...prev, isOpen: false }))}
          activeEvent={activeEvent}
          purchaseType={checkoutState.purchaseType}
          targetPhotos={
            targetPhotosForCheckout.length > 0
              ? targetPhotosForCheckout
              : photos.filter((p) => p.eventId === activeEvent.id)
          }
          pricing={eventPricing}
          currentUser={currentUser}
          onOrderConfirmed={({ receipt }) => {
            setOrders((prev) => [receipt, ...prev.filter((o) => o.id !== receipt.id)]);
            setCheckoutState((prev) => ({ ...prev, isOpen: false }));
            setSelectedPhotoIds([]);
            setActiveView('downloads');
            scrollToTop();
          }}
        />
      )}

      {authModalState.isOpen && (
        <AuthModal
          isOpen={authModalState.isOpen}
          initialRole={authModalState.initialRole}
          onClose={() => {
            setAuthModalState((prev) => ({ ...prev, isOpen: false }));
          }}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </div>
  );
}
