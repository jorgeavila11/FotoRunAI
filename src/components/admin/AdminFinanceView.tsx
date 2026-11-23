import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Landmark, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/supabase';

/** Financeiro: saques a pagar e contas de recebimento para aprovar. */
export const AdminFinanceView: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // ---- Contas de recebimento e saques ----
  type PendingAccount = {
    photographerId: string; photographerName: string; personType: 'pf' | 'pj'; holderName: string; document: string;
    birthDate: string | null; phone: string | null; pixKeyType: string; pixKey: string; bank: string | null; updatedAt: string;
  };
  type PendingPayout = { id: string; amount: number; pixKey: string; pixKeyType: string | null; holderName: string; document: string | null; createdAt: string };
  const [accounts, setAccounts] = useState<PendingAccount[]>([]);
  const [payouts, setPayouts] = useState<PendingPayout[]>([]);
  const [rejecting, setRejecting] = useState<{ id: string; note: string } | null>(null);
  const [moneyBusy, setMoneyBusy] = useState<string | null>(null);

  const loadMoney = useCallback(async () => {
    const [a, p] = await Promise.all([apiFetch('/api/admin/payout-accounts'), apiFetch('/api/admin/payouts')]);
    if (a.ok) setAccounts((await a.json()).accounts);
    if (p.ok) setPayouts((await p.json()).payouts);
  }, []);

  const moneyAction = async (key: string, url: string, body: object, ok: string) => {
    setMoneyBusy(key);
    try {
      const res = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotice(ok);
      setRejecting(null);
      loadMoney();
      onChanged?.();
    } catch (err) {
      setNotice(err instanceof Error && err.message ? err.message : 'Não foi possível concluir.');
    } finally {
      setMoneyBusy(null);
    }
  };

  const fmtDoc = (d: string | null) =>
    !d ? '—' : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, '$1.$2.$3/$4-$5');
  const brlAdmin = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });


  useEffect(() => {
    loadMoney().finally(() => setLoaded(true));
  }, [loadMoney]);

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
      ) : payouts.length === 0 && accounts.length === 0 ? (
        <div className="text-center py-14 bg-white border border-slate-200 rounded-2xl text-sm text-slate-600">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          Nada pendente: nenhum saque a pagar e nenhuma conta para aprovar.
        </div>
      ) : null}

      {/* SAQUES A PAGAR */}
      {payouts.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#D04400]" /> Saques a pagar ({payouts.length}) ·{' '}
            {brlAdmin(payouts.reduce((s, p) => s + p.amount, 0))}
          </h2>
          <p className="text-xs text-slate-600">
            Faça o Pix pelo app do banco para a chave abaixo e depois clique em "Marquei como pago". Confira se o nome que o banco mostra é o
            mesmo do titular.
          </p>
          <ul className="divide-y divide-slate-100">
            {payouts.map((p) => (
              <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-bold text-[#0F172A]">
                    {brlAdmin(p.amount)} <span className="font-normal text-slate-500">· {p.holderName} · {fmtDoc(p.document)}</span>
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    Chave Pix{p.pixKeyType ? ` (${p.pixKeyType})` : ''}: <span className="font-mono-num text-[#0F172A]">{p.pixKey}</span>
                    <button type="button" aria-label="Copiar chave" title="Copiar chave" onClick={() => navigator.clipboard?.writeText(p.pixKey)} className="p-1 rounded hover:bg-slate-100">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    · pedido em {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={moneyBusy === p.id}
                  onClick={() => moneyAction(p.id, `/api/admin/payouts/${p.id}/paid`, {}, 'Saque marcado como pago.')}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold"
                >
                  Marquei como pago
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* CONTAS DE RECEBIMENTO PARA APROVAR */}
      {accounts.length > 0 && (
        <section className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <Landmark className="w-4 h-4 text-amber-700" /> Contas de recebimento para aprovar ({accounts.length})
          </h2>
          <p className="text-xs text-slate-600">
            Dica: faça um Pix de R$ 0,01 para a chave e confira se o nome que aparece é o do titular. Só aprove se bater.
          </p>
          <ul className="space-y-3">
            {accounts.map((a) => (
              <li key={a.photographerId} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <dl className="text-sm grid sm:grid-cols-2 gap-x-6 gap-y-1">
                    <div><dt className="inline text-slate-500">Fotógrafo: </dt><dd className="inline font-semibold">{a.photographerName}</dd></div>
                    <div><dt className="inline text-slate-500">Titular: </dt><dd className="inline font-semibold">{a.holderName} ({a.personType.toUpperCase()})</dd></div>
                    <div><dt className="inline text-slate-500">{a.personType === 'pf' ? 'CPF' : 'CNPJ'}: </dt><dd className="inline font-mono-num">{fmtDoc(a.document)}</dd></div>
                    <div><dt className="inline text-slate-500">Pix ({a.pixKeyType}): </dt><dd className="inline font-mono-num">{a.pixKey}</dd></div>
                    {a.birthDate && <div><dt className="inline text-slate-500">Nascimento: </dt><dd className="inline">{a.birthDate.split('-').reverse().join('/')}</dd></div>}
                    {a.phone && <div><dt className="inline text-slate-500">Celular: </dt><dd className="inline font-mono-num">{a.phone}</dd></div>}
                    {a.bank && <div className="sm:col-span-2"><dt className="inline text-slate-500">Banco: </dt><dd className="inline">{a.bank}</dd></div>}
                  </dl>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={moneyBusy === a.photographerId}
                      onClick={() => moneyAction(a.photographerId, `/api/admin/payout-accounts/${a.photographerId}/approve`, {}, 'Conta aprovada. Os saques do fotógrafo estão liberados.')}
                      className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejecting({ id: a.photographerId, note: '' })}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Pedir correção
                    </button>
                  </div>
                </div>
                {rejecting?.id === a.photographerId && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      autoFocus
                      value={rejecting.note}
                      onChange={(e) => setRejecting({ id: a.photographerId, note: e.target.value })}
                      placeholder="O que o fotógrafo precisa corrigir? Ex.: a chave Pix está em nome de outra pessoa."
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                    <button
                      type="button"
                      disabled={!rejecting.note.trim() || moneyBusy === a.photographerId}
                      onClick={() => moneyAction(a.photographerId, `/api/admin/payout-accounts/${a.photographerId}/reject`, { note: rejecting.note }, 'Pedido de correção enviado ao fotógrafo.')}
                      className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold"
                    >
                      Enviar
                    </button>
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
