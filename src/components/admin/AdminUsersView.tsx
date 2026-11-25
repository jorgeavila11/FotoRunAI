import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Ban, CheckCircle2, Download, Loader2, RotateCcw, Search } from 'lucide-react';
import { apiFetch } from '../../lib/supabase';
import { brl } from './AdminCharts';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'athlete' | 'photographer' | 'admin';
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  orders: number;
  spent: number;
  photos: number;
  eventsCovered: number;
  eventsOwned: number;
  sold: number;
  gross: number;
  net: number;
  payoutAccount: 'em_analise' | 'aprovada' | 'recusada' | null;
  referredOrders: number;
  referredTotal: number;
}

const ROLE_LABEL = { athlete: 'Atleta', photographer: 'Fotógrafo', admin: 'Administrador' } as const;
const ACCOUNT_LABEL: Record<string, { text: string; cls: string }> = {
  aprovada: { text: 'Aprovada', cls: 'bg-emerald-100 text-emerald-800' },
  em_analise: { text: 'Em análise', cls: 'bg-amber-100 text-amber-800' },
  recusada: { text: 'Correção', cls: 'bg-red-100 text-red-800' },
};
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const PAGE = 25;

type SortKey = 'name' | 'createdAt' | 'lastSignInAt' | 'photos' | 'sold' | 'net' | 'orders' | 'spent' | 'referredOrders';

function toCsv(rows: AdminUser[], photographers: boolean) {
  const head = photographers
    ? ['Nome', 'E-mail', 'Telefone', 'Cadastro', 'Fotos', 'Eventos', 'Fotos vendidas', 'Vendas (R$)', 'Líquido (R$)', 'Vendas pelo link', 'Conta de recebimento', 'Situação']
    : ['Nome', 'E-mail', 'Telefone', 'Tipo', 'Cadastro', 'Último acesso', 'Pedidos', 'Gasto (R$)', 'Situação'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((u) =>
    (photographers
      ? [u.name, u.email, u.phone, date(u.createdAt), u.photos, u.eventsCovered, u.sold, u.gross.toFixed(2).replace('.', ','), u.net.toFixed(2).replace('.', ','), u.referredOrders, u.payoutAccount ? ACCOUNT_LABEL[u.payoutAccount].text : 'Não cadastrada', u.suspendedAt ? 'Suspensa' : 'Ativa']
      : [u.name, u.email, u.phone, ROLE_LABEL[u.role], date(u.createdAt), date(u.lastSignInAt), u.orders, u.spent.toFixed(2).replace('.', ','), u.suspendedAt ? 'Suspensa' : 'Ativa']
    )
      .map(esc)
      .join(';'),
  );
  return '﻿' + [head.map(esc).join(';'), ...lines].join('\r\n');
}

interface Props {
  mode: 'photographers' | 'all';
  onChanged?: () => void;
}

/** Lista de fotógrafos (mode="photographers") ou de todos os usuários. */
export const AdminUsersView: React.FC<Props> = ({ mode, onChanged }) => {
  const isPh = mode === 'photographers';
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'todos' | 'athlete' | 'photographer' | 'admin'>('todos');
  const [status, setStatus] = useState<'todos' | 'ativos' | 'suspensos'>('todos');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: isPh ? 'net' : 'createdAt', dir: -1 });
  const [page, setPage] = useState(0);
  const [suspending, setSuspending] = useState<{ id: string; reason: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível carregar.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!users) return [];
    const term = q.trim().toLowerCase();
    return users
      .filter((u) => (isPh ? u.role === 'photographer' : role === 'todos' || u.role === role))
      .filter((u) => (status === 'todos' ? true : status === 'suspensos' ? u.suspendedAt : !u.suspendedAt))
      .filter((u) => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term) || (u.phone || '').includes(term))
      .sort((a, b) => {
        const va = a[sort.key] ?? '';
        const vb = b[sort.key] ?? '';
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')) * sort.dir;
      });
  }, [users, q, role, status, sort, isPh]);

  useEffect(() => setPage(0), [q, role, status, sort]);
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  const act = async (u: AdminUser, action: 'suspend' | 'reactivate', reason = '') => {
    setBusy(u.id);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}/${action}`, { method: 'POST', body: JSON.stringify({ reason }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(action === 'suspend' ? `Conta de ${u.name} suspensa.` : `Conta de ${u.name} reativada.`);
      setSuspending(null);
      await load();
      onChanged?.();
    } catch (err) {
      setNotice(err instanceof Error && err.message ? err.message : 'Não foi possível concluir.');
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    const blob = new Blob([toCsv(rows, isPh)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = isPh ? 'fotografos-fotorun.csv' : 'usuarios-fotorun.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const Th: React.FC<{ k?: SortKey; right?: boolean; children: React.ReactNode }> = ({ k, right, children }) => (
    <th scope="col" className={`px-3 py-2.5 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`} aria-sort={k && sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      {k ? (
        <button
          type="button"
          onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((s.dir * -1) as 1 | -1) : -1 }))}
          className={`inline-flex items-center gap-1 hover:text-[#0F172A] ${right ? 'flex-row-reverse' : ''}`}
        >
          {children}
          {sort.key === k && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
        </button>
      ) : (
        children
      )}
    </th>
  );

  if (error)
    return (
      <p className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
        <AlertCircle className="w-4 h-4 mt-0.5" /> {error}
      </p>
    );
  if (!users)
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-slate-500 py-10">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
      </p>
    );

  const colCount = isPh ? 8 : 7;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-[#0F172A]">{isPh ? 'Fotógrafos' : 'Usuários'}</h2>
          <p className="text-sm text-slate-600">
            {rows.length} {isPh ? 'fotógrafo(s)' : 'pessoa(s)'} {q || status !== 'todos' || role !== 'todos' ? 'no filtro' : 'cadastrada(s)'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Buscar</span>
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome, e-mail ou telefone"
              className="pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-[#D04400]"
            />
          </label>
          {!isPh && (
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} aria-label="Tipo" className="px-2.5 py-2 rounded-lg border border-slate-300 text-sm bg-white">
              <option value="todos">Todos os tipos</option>
              <option value="athlete">Atletas</option>
              <option value="photographer">Fotógrafos</option>
              <option value="admin">Administradores</option>
            </select>
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Situação" className="px-2.5 py-2 rounded-lg border border-slate-300 text-sm bg-white">
            <option value="todos">Todas as situações</option>
            <option value="ativos">Ativas</option>
            <option value="suspensos">Suspensas</option>
          </select>
          <button type="button" onClick={download} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="w-4 h-4" /> Planilha (CSV)
          </button>
        </div>
      </div>

      {notice && (
        <p className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3" role="status">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {notice}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <Th k="name">Nome</Th>
              {isPh ? (
                <>
                  <Th k="createdAt">Cadastro</Th>
                  <Th k="photos" right>Fotos</Th>
                  <Th k="sold" right>Vendidas</Th>
                  <Th k="net" right>Líquido</Th>
                  <Th k="referredOrders" right>Pelo link</Th>
                  <Th>Conta de recebimento</Th>
                </>
              ) : (
                <>
                  <Th>Tipo</Th>
                  <Th k="createdAt">Cadastro</Th>
                  <Th k="lastSignInAt">Último acesso</Th>
                  <Th k="orders" right>Pedidos</Th>
                </>
              )}
              <Th right>Situação</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center text-slate-500">
                  Ninguém encontrado com esse filtro.
                </td>
              </tr>
            )}
            {pageRows.map((u) => (
              <React.Fragment key={u.id}>
                <tr className={u.suspendedAt ? 'bg-red-50/40' : ''}>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-[#0F172A]">{u.name}</p>
                    <p className="text-xs text-slate-500">
                      {u.email || '—'}
                      {u.phone ? ` · ${u.phone}` : ''}
                      {!u.emailConfirmed && u.email ? ' · e-mail não confirmado' : ''}
                    </p>
                  </td>
                  {isPh ? (
                    <>
                      <td className="px-3 py-2.5 text-slate-600 font-mono-num">{date(u.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right font-mono-num">
                        {u.photos.toLocaleString('pt-BR')}
                        <span className="block text-[11px] text-slate-500 font-sans">{u.eventsCovered} evento(s)</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num">{u.sold.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2.5 text-right font-mono-num font-semibold">
                        {brl(u.net)}
                        <span className="block text-[11px] text-slate-500 font-normal">de {brl(u.gross)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num">
                        {u.referredOrders}
                        {u.referredOrders > 0 && <span className="block text-[11px] text-slate-500">{brl(u.referredTotal)}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {u.payoutAccount ? (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ACCOUNT_LABEL[u.payoutAccount].cls}`}>{ACCOUNT_LABEL[u.payoutAccount].text}</span>
                        ) : (
                          <span className="text-xs text-slate-500">Não cadastrada</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-[#0F172A] text-white' : u.role === 'photographer' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'}`}>
                          {ROLE_LABEL[u.role]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 font-mono-num">{date(u.createdAt)}</td>
                      <td className="px-3 py-2.5 text-slate-600 font-mono-num">{date(u.lastSignInAt)}</td>
                      <td className="px-3 py-2.5 text-right font-mono-num">
                        {u.orders}
                        {u.spent > 0 && <span className="block text-[11px] text-slate-500">{brl(u.spent)}</span>}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {u.role === 'admin' ? (
                      <span className="text-xs text-slate-500">—</span>
                    ) : u.suspendedAt ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700" title={u.suspendedReason || ''}>
                          Suspensa
                        </span>
                        <button
                          type="button"
                          disabled={busy === u.id}
                          onClick={() => act(u, 'reactivate')}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Reativar
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Ativa</span>
                        <button
                          type="button"
                          onClick={() => setSuspending({ id: u.id, reason: '' })}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"
                        >
                          <Ban className="w-3.5 h-3.5" /> Suspender
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
                {u.suspendedAt && u.suspendedReason && (
                  <tr className="bg-red-50/40">
                    <td colSpan={colCount} className="px-3 pb-2.5 -mt-1 text-xs text-red-800">
                      Suspensa em {date(u.suspendedAt)}: {u.suspendedReason}
                    </td>
                  </tr>
                )}
                {suspending?.id === u.id && (
                  <tr className="bg-red-50">
                    <td colSpan={colCount} className="px-3 py-3">
                      <p className="text-xs text-red-900 mb-2">
                        A pessoa não consegue mais entrar nem comprar{u.role === 'photographer' ? ', e as fotos dela saem da vitrine (nada é apagado)' : ''}. Dá
                        para reativar depois.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          autoFocus
                          value={suspending.reason}
                          onChange={(e) => setSuspending({ id: u.id, reason: e.target.value })}
                          placeholder="Motivo (fica registrado)"
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        />
                        <button
                          type="button"
                          disabled={!suspending.reason.trim() || busy === u.id}
                          onClick={() => act(u, 'suspend', suspending.reason)}
                          className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold"
                        >
                          Suspender conta
                        </button>
                        <button type="button" onClick={() => setSuspending(null)} className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-white">
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Página {page + 1} de {pages}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">
              Anterior
            </button>
            <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
