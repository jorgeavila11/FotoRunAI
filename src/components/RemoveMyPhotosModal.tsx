import React, { useState } from 'react';
import { X, ShieldCheck, Upload, Loader2, AlertCircle, CheckCircle2, LogIn } from 'lucide-react';
import { apiFetch } from '../lib/supabase';
import { AuthUser } from '../types';

interface Props {
  currentUser: AuthUser | null;
  onClose: () => void;
  onRequireLogin: () => void;
}

/** LGPD: o atleta pede a retirada das fotos em que aparece. */
export const RemoveMyPhotosModal: React.FC<Props> = ({ currentUser, onClose, onRequireLogin }) => {
  const [selfie, setSelfie] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const pickFile = (file?: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 15 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSelfie(String(reader.result));
    reader.readAsDataURL(file);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (!selfie) return setError('Escolha uma selfie do seu rosto.');
    if (!confirmed) return setError('Confirme que você é a pessoa da selfie.');
    setSending(true);
    try {
      const res = await apiFetch('/api/privacy/remove-my-photos', {
        method: 'POST',
        body: JSON.stringify({ selfieBase64: selfie, confirmed: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data.message);
      setSelfie(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível concluir o pedido.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="rm-title">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h2 id="rm-title" className="text-xl font-extrabold text-[#0F172A]">Remover minhas fotos</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-600">
          Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir a retirada das fotos em que aparece. Envie uma selfie: o
          FotoRun encontra as fotos com o seu rosto e as <strong>retira na hora</strong> da vitrine e da busca. Depois de uma revisão,
          os arquivos são apagados. A selfie é usada só para essa busca e não é guardada.
        </p>

        {result ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" /> {result}
            </p>
            <button type="button" onClick={onClose} className="w-full py-2.5 rounded-lg bg-[#0F172A] text-white text-sm font-bold">
              Fechar
            </button>
          </div>
        ) : !currentUser ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-3">
              Para evitar pedidos falsos em nome de outras pessoas, é preciso entrar na sua conta antes de enviar o pedido.
            </p>
            <button
              type="button"
              onClick={onRequireLogin}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold"
            >
              <LogIn className="w-4 h-4" /> Entrar ou criar conta
            </button>
          </div>
        ) : (
          <>
            <label
              htmlFor="rm-selfie"
              className="block rounded-xl border-2 border-dashed border-slate-300 hover:border-[#D04400] bg-slate-50 cursor-pointer overflow-hidden"
            >
              {selfie ? (
                <img src={selfie} alt="Sua selfie" className="w-full max-h-64 object-contain bg-black" />
              ) : (
                <div className="py-10 flex flex-col items-center gap-2 text-sm text-slate-500">
                  <Upload className="w-7 h-7" />
                  <span>Clique para escolher uma selfie (de frente, sem óculos escuros)</span>
                </div>
              )}
            </label>
            <input id="rm-selfie" type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />

            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 accent-[#D04400]" />
              Confirmo que sou a pessoa da selfie e quero retirar minhas fotos do FotoRun. Sei que fotos que eu já comprei também deixam
              de estar disponíveis para download.
            </label>

            {error && (
              <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] disabled:opacity-60 text-white text-sm font-bold"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />} Retirar minhas fotos
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
