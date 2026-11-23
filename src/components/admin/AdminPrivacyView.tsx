import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../lib/supabase';

/** LGPD: pedidos "Remover minhas fotos" para revisar. */
export const AdminPrivacyView: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [removals, setRemovals] = useState<
    { id: string; requesterName: string; createdAt: string; photoCount: number; soldCount: number; previews: string[] }[]
  >([]);
  const [removalBusy, setRemovalBusy] = useState<string | null>(null);

  const loadRemovals = useCallback(async () => {
    const res = await apiFetch('/api/admin/removal-requests');
    const data = await res.json();
    if (res.ok) setRemovals(data.requests);
  }, []);

  const decideRemoval = async (id: string, action: 'confirm' | 'restore') => {
    setRemovalBusy(id);
    try {
      const res = await apiFetch(`/api/admin/removal-requests/${id}/${action}`, { method: 'POST', body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(action === 'confirm' ? `Fotos apagadas definitivamente (${data.purged}).` : 'Fotos restauradas na vitrine.');
      loadRemovals();
      onChanged?.();
    } catch (err) {
      setNotice(err instanceof Error && err.message ? err.message : 'Não foi possível concluir.');
    } finally {
      setRemovalBusy(null);
    }
  };


  useEffect(() => {
    loadRemovals().finally(() => setLoaded(true));
  }, [loadRemovals]);

  return (
    <div className="space-y-6">
      {notice && (
        <p className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3" role="status">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {notice}
        </p>
      )}

      {!loaded ? (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-500 py-10">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </p>
      ) : removals.length === 0 ? (
        <div className="text-center py-14 bg-white border border-slate-200 rounded-2xl text-sm text-slate-600">
          <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          Nenhum pedido de remoção de fotos pendente.
        </div>
      ) : null}

      {/* PEDIDOS DE REMOÇÃO (LGPD) */}
      {removals.length > 0 && (
        <section className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700" /> Pedidos de remoção de fotos — LGPD ({removals.length})
          </h2>
          <p className="text-xs text-slate-600">
            As fotos já foram retiradas da vitrine e da busca. Confira se as fotos são mesmo da pessoa e confirme a exclusão
            definitiva, ou restaure se houve engano.
          </p>
          <ul className="space-y-3">
            {removals.map((r) => (
              <li key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#0F172A]">{r.requesterName}</p>
                    <p className="text-xs text-slate-500">
                      Pedido em {new Date(r.createdAt).toLocaleDateString('pt-BR')} · {r.photoCount} foto(s)
                      {r.soldCount > 0 && (
                        <span className="text-amber-700 font-semibold"> · {r.soldCount} já vendida(s) — os compradores perdem o download</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={removalBusy === r.id}
                      onClick={() => decideRemoval(r.id, 'confirm')}
                      className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-bold"
                    >
                      Confirmar exclusão
                    </button>
                    <button
                      type="button"
                      disabled={removalBusy === r.id}
                      onClick={() => decideRemoval(r.id, 'restore')}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Restaurar
                    </button>
                  </div>
                </div>
                {r.previews.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {r.previews.map((src) => (
                      <img key={src} src={src} alt="" className="h-20 w-auto rounded-md object-cover" />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
};
