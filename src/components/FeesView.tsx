import React, { useState } from 'react';
import { BadgePercent, Calculator, CheckCircle2, Info, Wallet } from 'lucide-react';
import { useFees, pct } from '../lib/fees';
import { ActiveView, AuthUser } from '../types';

interface Props {
  currentUser: AuthUser | null;
  onNavigate: (view: ActiveView) => void;
  onOpenAuth: (role?: 'athlete' | 'photographer') => void;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Página pública "Taxas e serviços": os mesmos números que o servidor usa. */
export const FeesView: React.FC<Props> = ({ currentUser, onNavigate, onOpenAuth }) => {
  const { fees, loaded } = useFees();
  const [price, setPrice] = useState('15,00');
  const value = Math.max(0, Number(price.replace(/\./g, '').replace(',', '.')) || 0);
  const fee = Math.round(value * fees.platformFeePercent) / 100;
  const net = Math.round((value - fee) * 100) / 100;
  const isPhotographer = currentUser?.role === 'photographer';

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-8 py-10 space-y-8">
      <header className="text-center space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#D04400]">Transparência</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0F172A] tracking-tight">Taxas e serviços</h1>
        <p className="text-slate-600 max-w-xl mx-auto">
          Tudo o que o FotoRun cobra, sem letra miúda. Você só paga quando vende — e vê quanto recebe antes de definir o preço.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden" aria-busy={!loaded}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left font-semibold px-5 py-3">Serviço</th>
              <th className="text-right font-semibold px-5 py-3">Taxa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(fees.items.length ? fees.items : [{ service: 'Carregando…', value: '', detail: '' }]).map((it) => (
              <tr key={it.service}>
                <td className="px-5 py-4">
                  <p className="font-semibold text-[#0F172A]">{it.service}</p>
                  {it.detail && <p className="text-xs text-slate-500 mt-0.5">{it.detail}</p>}
                </td>
                <td className="px-5 py-4 text-right font-bold font-mono-num text-[#0F172A] whitespace-nowrap">{it.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-[#0F172A] flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[#D04400]" /> Simule uma venda
          </h2>
          <label className="block text-xs font-semibold text-slate-600" htmlFor="fee-sim">
            Preço da foto
          </label>
          <div className="flex items-center rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-[#D04400] overflow-hidden">
            <span className="px-3 text-sm text-slate-500 bg-slate-50 self-stretch flex items-center border-r border-slate-200">R$</span>
            <input
              id="fee-sim"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
              className="flex-1 px-3 py-2.5 text-sm font-mono-num outline-none"
            />
          </div>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-slate-600">O atleta paga</dt>
              <dd className="font-mono-num font-semibold">{brl(value)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Taxa FotoRun ({pct(fees.platformFeePercent)}, já com Pix/cartão)</dt>
              <dd className="font-mono-num text-slate-600">− {brl(fee)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2">
              <dt className="font-bold text-[#0F172A]">Você recebe</dt>
              <dd className="font-mono-num font-extrabold text-emerald-700 text-lg">{brl(net)}</dd>
            </div>
          </dl>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
          <h2 className="font-bold text-[#0F172A] flex items-center gap-2">
            <Info className="w-5 h-5 text-[#006577]" /> Como funciona
          </h2>
          <ul className="space-y-2.5 text-sm text-slate-700">
            {fees.rules.map((r) => (
              <li key={r} className="flex gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> {r}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl bg-[#0F172A] text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-bold text-lg flex items-center gap-2">
            <BadgePercent className="w-5 h-5 text-[#38BDF8]" /> Fique com {pct(fees.photographerSharePercent)} de cada venda
          </p>
          <p className="text-sm text-slate-300">
            Sem mensalidade. Pedimos só os dados necessários para pagar você — nada de renda ou profissão.
          </p>
        </div>
        {isPhotographer ? (
          <button
            type="button"
            onClick={() => onNavigate('conta-recebimento')}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-sm font-bold whitespace-nowrap"
          >
            <Wallet className="w-4 h-4" /> Minha conta de recebimento
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenAuth('photographer')}
            className="px-5 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-sm font-bold whitespace-nowrap"
          >
            Quero vender minhas fotos
          </button>
        )}
      </section>
    </div>
  );
};
