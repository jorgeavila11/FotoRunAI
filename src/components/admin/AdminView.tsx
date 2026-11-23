import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/supabase';
import { AdminEventsView } from '../AdminEventsView';
import { AdminOverview, AdminTab, Overview } from './AdminOverview';
import { AdminUsersView } from './AdminUsersView';
import { AdminFinanceView } from './AdminFinanceView';
import { AdminPrivacyView } from './AdminPrivacyView';

interface Props {
  onEventsChanged: () => void;
  onViewPublicEvent: (eventId: string) => void;
}

/** Área do administrador: tudo da plataforma em abas. */
export const AdminView: React.FC<Props> = ({ onEventsChanged, onViewPublicEvent }) => {
  const [tab, setTab] = useState<AdminTab>('visao');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/overview');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível carregar os dados.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const p = overview?.pending;
  const tabs: { id: AdminTab; label: string; badge?: number }[] = [
    { id: 'visao', label: 'Visão geral' },
    { id: 'eventos', label: 'Eventos', badge: p?.eventRequests },
    { id: 'fotografos', label: 'Fotógrafos' },
    { id: 'usuarios', label: 'Usuários' },
    { id: 'financeiro', label: 'Financeiro', badge: p ? p.payouts + p.accounts : 0 },
    { id: 'lgpd', label: 'LGPD', badge: p?.removals },
  ];

  const changed = () => loadOverview();

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-16 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#D04400]">Administração</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">Painel da plataforma</h1>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="border-b border-slate-200 overflow-x-auto" role="tablist" aria-label="Seções da administração">
        <div className="flex gap-1 min-w-max">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap ${
                tab === t.id ? 'border-[#D04400] text-[#D04400]' : 'border-transparent text-slate-600 hover:text-[#0F172A]'
              }`}
            >
              {t.label}
              {!!t.badge && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold inline-flex items-center justify-center" aria-label={`${t.badge} pendente(s)`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel">
        {tab === 'visao' &&
          (overview ? (
            <AdminOverview data={overview} onGoTo={setTab} />
          ) : error ? (
            <p className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5" /> {error}
            </p>
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm text-slate-500 py-16">
              <Loader2 className="w-5 h-5 animate-spin" /> Calculando os números da plataforma...
            </p>
          ))}
        {tab === 'eventos' && (
          <AdminEventsView
            onEventsChanged={() => {
              onEventsChanged();
              changed();
            }}
            onViewPublicEvent={onViewPublicEvent}
          />
        )}
        {tab === 'fotografos' && <AdminUsersView mode="photographers" onChanged={changed} />}
        {tab === 'usuarios' && <AdminUsersView mode="all" onChanged={changed} />}
        {tab === 'financeiro' && <AdminFinanceView onChanged={changed} />}
        {tab === 'lgpd' && (
          <AdminPrivacyView
            onChanged={() => {
              onEventsChanged();
              changed();
            }}
          />
        )}
      </div>
    </div>
  );
};
