/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
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
import { CheckoutModal } from './components/CheckoutModal';
import { DownloadsView } from './components/DownloadsView';
import { AuthModal } from './components/AuthModal';

interface BootstrapPayload {
  events: EventItem[];
  photos: PhotoItem[];
  batches: UploadBatch[];
  sales: SaleTransaction[];
  pricing: PricingConfig;
  photographerStats: {
    totalPhotosUploaded: number;
    totalSold: number;
    grossRevenue: number;
    availablePixBalance: number;
  };
  orders: OrderReceipt[];
}

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
  const [photographerStats, setPhotographerStats] = useState({
    totalPhotosUploaded: 0,
    totalSold: 0,
    grossRevenue: 0,
    availablePixBalance: 0,
  });
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
      setBatches(data.batches || []);
      setSales(data.sales || []);
      if (data.pricing) setPricing(data.pricing);
      if (data.photographerStats) setPhotographerStats(data.photographerStats);
      if (Array.isArray(data.orders)) setOrders(data.orders);
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
      setCheckoutState({
        isOpen: true,
        purchaseType: selectedPhotoIds.length === 1 ? 'single' : 'selected',
        targetPhotoIds: selectedPhotoIds,
      });
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
      setCheckoutState({
        isOpen: true,
        purchaseType: 'pack',
        targetPhotoIds: eventPhotoIds,
      });
    }
  };

  const handleOpenAuth = (role: UserRole = 'athlete') => {
    setAuthModalState({ isOpen: true, initialRole: role });
  };

  const handleAuthenticated = (user: AuthUser) => {
    setCurrentUser(user);
    if (user.role === 'photographer') {
      setActiveView('photographer');
      scrollToTop();
    }
  };

  const activeEvent = events.find((e) => e.id === activeEventId) || events[0];
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
                pricing={pricing}
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

            {activeView === 'photographer' && (
              <PhotographerDashboardView
                events={events}
                batches={batches}
                sales={sales}
                pricing={pricing}
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
                  setPricing(nextPricing);
                  setPhotos(updatedPhotos);
                }}
                onPayoutDone={(nextStats) => {
                  setPhotographerStats(nextStats);
                }}
                onViewPublicEvent={(eventId) => handleSelectEvent(eventId)}
              />
            )}

            {activeView === 'downloads' && (
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

      <Footer onNavigate={handleNavigate} onOpenAuth={handleOpenAuth} />

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
          pricing={pricing}
          currentUser={currentUser}
          onOrderConfirmed={({ receipt, sales: nextSales, photographerStats: nextStats }) => {
            setOrders((prev) => [receipt, ...prev]);
            setSales(nextSales);
            setPhotographerStats(nextStats);
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
          onClose={() => setAuthModalState((prev) => ({ ...prev, isOpen: false }))}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </div>
  );
}
