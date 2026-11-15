import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  CreditCard,
  Copy,
  Check,
  ShieldCheck,
  Timer,
  Loader2,
  Tag,
} from 'lucide-react';
import { AuthUser, EventItem, OrderReceipt, PhotoItem, PricingConfig, SaleTransaction } from '../types';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEvent: EventItem;
  purchaseType: 'pack' | 'selected' | 'single';
  targetPhotos: PhotoItem[];
  pricing: PricingConfig;
  currentUser: AuthUser | null;
  onOrderConfirmed: (payload: {
    receipt: OrderReceipt;
    sales: SaleTransaction[];
    photographerStats: {
      totalPhotosUploaded: number;
      totalSold: number;
      grossRevenue: number;
      availablePixBalance: number;
    };
  }) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  activeEvent,
  purchaseType,
  targetPhotos,
  pricing,
  currentUser,
  onOrderConfirmed,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string>('');
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);

  const [athleteName, setAthleteName] = useState(currentUser?.name || 'Carlos Silva');
  const [athleteEmail, setAthleteEmail] = useState(currentUser?.email || 'carlos.silva@corredor.com.br');
  const [athletePhone, setAthletePhone] = useState(currentUser?.phone || '(88) 99999-3690');
  const [bibNumber, setBibNumber] = useState(
    currentUser?.bibNumber || (targetPhotos[0]?.bibNumbers[0] ? `#${targetPhotos[0].bibNumbers[0]}` : '#1042')
  );

  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardHolder, setCardHolder] = useState('');

  const [secondsLeft, setSecondsLeft] = useState(14 * 60 + 58);
  const [copiedPix, setCopiedPix] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSecondsLeft(14 * 60 + 58);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const basePrice =
    purchaseType === 'pack'
      ? pricing.packPrice
      : targetPhotos.reduce((sum, p) => sum + p.price, 0);

  const hasDiscount = appliedCoupon === 'ATLETA10' || appliedCoupon === 'SOBRALCORRE';
  const discountAmount = hasDiscount ? Number((basePrice * 0.1).toFixed(2)) : 0;
  const finalTotal = Math.max(0.01, Number((basePrice - discountAmount).toFixed(2)));

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  const pixCopiaECola = `00020126580014br.gov.bcb.pix0136fotorun-${activeEvent.id}5204000053039865405${finalTotal.toFixed(
    2
  )}5802BR5915FOTORUN AI TECH6009SOBRAL-CE62070503***630489A1`;

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (code === 'ATLETA10' || code === 'SOBRALCORRE') {
      setAppliedCoupon(code);
      setCouponFeedback('Cupom de 10% aplicado!');
    } else {
      setAppliedCoupon('');
      setCouponFeedback('Cupom inválido. Use ATLETA10 ou SOBRALCORRE.');
    }
  };

  const handleCopyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCopiaECola);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3000);
    } catch {
      setCopiedPix(true);
    }
  };

  const handleConfirmPayment = async () => {
    if (paymentMethod === 'card' && (!cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim())) {
      setErrorMsg('Preencha os dados do cartão para continuar.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: activeEvent.id,
          athleteName,
          athleteEmail,
          athletePhone,
          bibNumber,
          purchaseType,
          paymentMethod,
          photoIds: targetPhotos.map((p) => p.id),
          couponCode: appliedCoupon,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao confirmar pedido.');
      }
      onOrderConfirmed(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao processar pagamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const productLabel =
    purchaseType === 'pack'
      ? `Pacote Completo ${activeEvent.title} (${targetPhotos.length} registros)`
      : targetPhotos.length > 1
      ? `Seleção Personalizada (${targetPhotos.length} fotos)`
      : `Foto Digital em 300 DPI (${targetPhotos[0]?.checkpoint || 'Evento'})`;

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200 my-auto">
        {/* Header */}
        <div className="bg-[#0F172A] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Checkout Seguro · Liberação Instantânea</h2>
            <p className="text-xs text-slate-300">
              Arquivos originais em 300 DPI sem marca d’água liberados imediatamente após confirmação
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar checkout"
            className="p-2 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Payment & Athlete Contact */}
          <div className="lg:col-span-7 space-y-5">
            {/* Athlete delivery details */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Dados para Entrega Digital
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={athleteName}
                  onChange={(e) => setAthleteName(e.target.value)}
                  placeholder="Nome completo"
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]"
                />
                <input
                  type="text"
                  value={bibNumber}
                  onChange={(e) => setBibNumber(e.target.value)}
                  placeholder="Número de Peito (ex: #1042)"
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-num font-bold text-[#0F172A] focus:outline-none focus:border-[#D04400]"
                />
                <input
                  type="email"
                  value={athleteEmail}
                  onChange={(e) => setAthleteEmail(e.target.value)}
                  placeholder="E-mail para receber o ZIP"
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]"
                />
                <input
                  type="tel"
                  value={athletePhone}
                  onChange={(e) => setAthletePhone(e.target.value)}
                  placeholder="WhatsApp com DDD"
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]"
                />
              </div>
            </div>

            {/* Method Toggle */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Forma de Pagamento
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('pix')}
                  className={`py-2.5 px-3 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                    paymentMethod === 'pix'
                      ? 'border-[#D04400] bg-orange-50 text-[#D04400]'
                      : 'border-slate-200 bg-white text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>Pix Instantâneo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`py-2.5 px-3 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                    paymentMethod === 'card'
                      ? 'border-[#D04400] bg-orange-50 text-[#D04400]'
                      : 'border-slate-200 bg-white text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Cartão de Crédito</span>
                </button>
              </div>
            </div>

            {/* PIX View */}
            {paymentMethod === 'pix' ? (
              <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#0F172A]">Escaneie o QR Code no app do banco</span>
                  <span className="inline-flex items-center gap-1 font-mono-num font-bold text-[#D04400]">
                    <Timer className="w-3.5 h-3.5" />
                    {minutes}:{seconds}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 shrink-0">
                    <svg className="w-32 h-32" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="200" height="200" fill="white" />
                      <rect x="14" y="14" width="46" height="46" rx="4" fill="#0F172A" />
                      <rect x="20" y="20" width="34" height="34" rx="2" fill="white" />
                      <rect x="26" y="26" width="22" height="22" rx="2" fill="#0F172A" />
                      <rect x="140" y="14" width="46" height="46" rx="4" fill="#0F172A" />
                      <rect x="146" y="20" width="34" height="34" rx="2" fill="white" />
                      <rect x="152" y="26" width="22" height="22" rx="2" fill="#0F172A" />
                      <rect x="14" y="140" width="46" height="46" rx="4" fill="#0F172A" />
                      <rect x="20" y="146" width="34" height="34" rx="2" fill="white" />
                      <rect x="26" y="152" width="22" height="22" rx="2" fill="#0F172A" />
                      <path
                        d="M72 16h8v8h-8zM88 16h16v8h-16zM112 16h8v8h-8zM72 32h16v8h-16zM96 32h8v8h-8zM112 32h16v8h-16zM72 48h8v16h-8zM88 48h8v8h-8zM104 48h16v8h-16zM128 48h8v16h-8zM16 72h8v8h-8zM32 72h16v8h-16zM56 72h8v16h-8zM80 72h16v8h-16zM104 72h8v8h-8zM120 72h16v8h-16zM144 72h8v8h-8zM168 72h16v8h-16zM16 88h16v8h-16zM40 88h8v8h-8zM64 88h16v8h-16zM88 88h8v16h-8zM104 88h24v8h-24zM136 88h16v8h-16zM160 88h24v8h-24zM24 104h8v8h-8zM40 104h16v8h-16zM64 104h8v8h-8zM80 104h8v16h-8zM112 104h8v8h-8zM136 104h8v8h-8zM152 104h16v8h-16zM176 104h8v8h-8zM16 120h8v8h-8zM32 120h8v8h-8zM48 120h16v8h-16zM72 120h16v8h-16zM96 120h24v8h-24zM128 120h8v8h-8zM144 120h8v8h-8zM168 120h16v8h-16zM72 144h8v8h-8zM88 144h16v8h-16zM120 144h8v8h-8zM136 144h24v8h-24zM168 144h8v8h-8zM72 160h16v8h-16zM96 160h8v8h-8zM112 160h16v8h-16zM144 160h8v16h-8zM160 160h16v8h-16zM72 176h8v8h-8zM88 176h8v8h-8zM104 176h24v8h-24zM152 176h8v8h-8zM168 176h16v8h-16z"
                        fill="#0F172A"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 space-y-2 w-full">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Copie o código abaixo para pagar no Pix Copia e Cola ou clique em confirmar pagamento para liberar seus arquivos agora.
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="w-full py-2 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-[#0F172A] inline-flex items-center justify-center gap-1.5"
                    >
                      {copiedPix ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPix ? 'Código Pix Copiado!' : 'Copiar Código Pix Copia e Cola'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-4 space-y-3">
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="Número do Cartão (0000 0000 0000 0000)"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono-num"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    placeholder="Validade (MM/AA)"
                    className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono-num"
                  />
                  <input
                    type="text"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    placeholder="CVV"
                    className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono-num"
                  />
                </div>
                <input
                  type="text"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  placeholder="Nome impresso no cartão"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                />
              </div>
            )}

            {errorMsg && <p className="text-xs text-red-600 font-semibold">{errorMsg}</p>}
          </div>

          {/* Right: Order Summary */}
          <div className="lg:col-span-5 bg-[#F8FAFC] rounded-xl border border-slate-200 p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Resumo do Pedido</p>
                <h3 className="text-sm font-bold text-[#0F172A] mt-1">{productLabel}</h3>
              </div>

              {/* Preview thumbnails */}
              <div className="grid grid-cols-4 gap-2">
                {targetPhotos.slice(0, 4).map((p) => (
                  <img
                    key={p.id}
                    src={p.imageUrl}
                    alt={p.caption}
                    referrerPolicy="no-referrer"
                    className="aspect-square rounded-lg object-cover border border-slate-200"
                  />
                ))}
              </div>

              {/* Coupon */}
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Cupom (ATLETA10)"
                      className="w-full pl-8 pr-2 py-2 bg-white border border-slate-300 rounded-lg text-xs uppercase font-semibold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-xs font-bold text-[#0F172A]"
                  >
                    Aplicar
                  </button>
                </div>
                {couponFeedback && (
                  <p className={`text-[11px] font-medium ${hasDiscount ? 'text-[#10B981]' : 'text-slate-500'}`}>
                    {couponFeedback}
                  </p>
                )}
              </div>

              {/* Totals */}
              <div className="pt-3 border-t border-slate-200 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono-num">R$ {basePrice.toFixed(2).replace('.', ',')}</span>
                </div>
                {hasDiscount && (
                  <div className="flex justify-between text-[#10B981] font-semibold">
                    <span>Desconto ({appliedCoupon})</span>
                    <span className="font-mono-num">- R$ {discountAmount.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
                  <span className="font-bold text-[#0F172A]">Total</span>
                  <span className="text-2xl font-extrabold text-[#D04400] font-mono-num">
                    R$ {finalTotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={submitting}
                className="w-full py-3.5 px-4 rounded-lg bg-[#D04400] hover:bg-[#A63500] disabled:opacity-60 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Confirmando pagamento...</span>
                  </>
                ) : (
                  <span>
                    {paymentMethod === 'pix' ? 'Confirmar Pix e Liberar Download' : 'Finalizar Compra no Cartão'}
                  </span>
                )}
              </button>
              <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Pagamento protegido · Entrega imediata em 300 DPI</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
