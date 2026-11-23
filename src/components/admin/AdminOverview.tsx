import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  Camera,
  Images,
  Inbox,
  Landmark,
  ShieldCheck,
  Table2,
  Users,
  Wallet,
} from 'lucide-react';
import { BarChart, Legend, SERIES_COLORS, brl, brlShort } from './AdminCharts';

export interface Overview {
  kpis: {
    gmv: number;
    platformRevenue: number;
    photographersNet: number;
    ordersCount: number;
    itemsSold: number;
    avgTicket: number;
    gmvThisMonth: number;
    gmvLastMonth: number;
    platformThisMonth: number;
    platformLastMonth: number;
    athletes: number;
    photographers: number;
    suspended: number;
    eventsActive: number;
    eventsDisabled: number;
    photos: number;
    paidOut: number;
  };
  pending: { payouts: number; payoutsAmount: number; accounts: number; removals: number; eventRequests: number };
  monthly: {
    month: string;
    label: string;
    gmv: number;
    platform: number;
    photographers: number;
    orders: number;
    newAthletes: number;
    newPhotographers: number;
  }[];
  topEvents: { id: string; title: string; gmv: number; orders: number; items: number }[];
  topPhotographers: { id: string; name: string; net: number; items: number }[];
}

export type AdminTab = 'visao' | 'eventos' | 'fotografos' | 'usuarios' | 'financeiro' | 'lgpd';

const card = 'bg-white rounded-2xl border border-slate-200';
const num = (n: number) => n.toLocaleString('pt-BR');

function Delta({ now, before }: { now: number; before: number }) {
  if (!before && !now) return <span className="text-xs text-slate-500">sem vendas nos dois meses</span>;
  if (!before) return <span className="text-xs text-slate-500">primeiro mês com vendas</span>;
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-700' : 'text-red-700'}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {up ? '+' : ''}
      {pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% vs. mês anterior
    </span>
  );
}

const SALES_SERIES = [
  { key: 'platform', label: 'Receita FotoRun', color: SERIES_COLORS[0] },
  { key: 'photographers', label: 'Repasse aos fotógrafos', color: SERIES_COLORS[1] },
];
const SIGNUP_SERIES = [
  { key: 'newAthletes', label: 'Atletas', color: SERIES_COLORS[0] },
  { key: 'newPhotographers', label: 'Fotógrafos', color: SERIES_COLORS[1] },
];

export const AdminOverview: React.FC<{ data: Overview; onGoTo: (tab: AdminTab) => void }> = ({ data, onGoTo }) => {
  const { kpis, pending, monthly } = data;
  const [salesTable, setSalesTable] = useState(false);
  const pendingItems = [
    { n: pending.payouts, label: `saque(s) a pagar · ${brl(pending.payoutsAmount)}`, tab: 'financeiro' as AdminTab, icon: Landmark },
    { n: pending.accounts, label: 'conta(s) de recebimento para aprovar', tab: 'financeiro' as AdminTab, icon: Wallet },
    { n: pending.eventRequests, label: 'pedido(s) de evento de fotógrafos', tab: 'eventos' as AdminTab, icon: Inbox },
    { n: pending.removals, label: 'pedido(s) de remoção de fotos (LGPD)', tab: 'lgpd' as AdminTab, icon: ShieldCheck },
  ].filter((p) => p.n > 0);

  return (
    <div className="space-y-6">
      {/* Pendências */}
      <section className={`${card} p-5`} aria-labelledby="pend-title">
        <h2 id="pend-title" className="text-sm font-bold text-[#0F172A] mb-3">
          O que precisa da sua atenção
        </h2>
        {pendingItems.length === 0 ? (
          <p className="text-sm text-emerald-700 font-medium">Tudo em dia. Nenhuma pendência agora.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2">
            {pendingItems.map((p) => (
              <li key={p.label}>
                <button
                  type="button"
                  onClick={() => onGoTo(p.tab)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-left text-sm"
                >
                  <p.icon className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    <strong className="font-mono-num text-[#0F172A]">{p.n}</strong> <span className="text-slate-700">{p.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Números principais */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Números principais">
        <div className={`${card} p-4 col-span-2`}>
          <p className="text-xs font-semibold text-slate-500">Receita da FotoRun (taxas)</p>
          <p className="text-3xl font-extrabold text-[#0F172A] font-mono-num mt-1">{brl(kpis.platformRevenue)}</p>
          <p className="text-xs text-slate-600 mt-1">
            Este mês: <strong className="font-mono-num">{brl(kpis.platformThisMonth)}</strong>{' '}
            <Delta now={kpis.platformThisMonth} before={kpis.platformLastMonth} />
          </p>
        </div>
        <div className={`${card} p-4 col-span-2`}>
          <p className="text-xs font-semibold text-slate-500">Vendas totais (o que os atletas pagaram)</p>
          <p className="text-3xl font-extrabold text-[#0F172A] font-mono-num mt-1">{brl(kpis.gmv)}</p>
          <p className="text-xs text-slate-600 mt-1">
            Este mês: <strong className="font-mono-num">{brl(kpis.gmvThisMonth)}</strong>{' '}
            <Delta now={kpis.gmvThisMonth} before={kpis.gmvLastMonth} />
          </p>
        </div>
        {[
          { label: 'Pedidos pagos', value: num(kpis.ordersCount), sub: `ticket médio ${brl(kpis.avgTicket)}`, icon: CalendarCheck },
          { label: 'Fotos vendidas', value: num(kpis.itemsSold), sub: `${num(kpis.photos)} fotos na vitrine`, icon: Images },
          {
            label: 'Repasse aos fotógrafos',
            value: brl(kpis.photographersNet),
            sub: `${brl(kpis.paidOut)} já pagos`,
            icon: Wallet,
          },
          {
            label: 'Eventos ativos',
            value: num(kpis.eventsActive),
            sub: kpis.eventsDisabled ? `${kpis.eventsDisabled} desativado(s)` : 'nenhum desativado',
            icon: CalendarCheck,
          },
          { label: 'Fotógrafos', value: num(kpis.photographers), sub: 'ver lista', icon: Camera, tab: 'fotografos' as AdminTab },
          { label: 'Atletas', value: num(kpis.athletes), sub: kpis.suspended ? `${kpis.suspended} conta(s) suspensa(s)` : 'ver lista', icon: Users, tab: 'usuarios' as AdminTab },
        ].map((k) => {
          const inner = (
            <>
              <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <k.icon className="w-3.5 h-3.5" /> {k.label}
              </p>
              <p className="text-xl font-extrabold text-[#0F172A] font-mono-num mt-1">{k.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.sub}</p>
            </>
          );
          return k.tab ? (
            <button key={k.label} type="button" onClick={() => onGoTo(k.tab!)} className={`${card} p-4 text-left hover:border-slate-300`}>
              {inner}
            </button>
          ) : (
            <div key={k.label} className={`${card} p-4`}>
              {inner}
            </div>
          );
        })}
      </section>

      {/* Ganhos por mês */}
      <section className={`${card} p-5 space-y-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">Vendas por mês — últimos 12 meses</h2>
            <p className="text-xs text-slate-500">A barra inteira é o que os atletas pagaram; a parte laranja é o que fica com a FotoRun.</p>
          </div>
          <button
            type="button"
            onClick={() => setSalesTable((v) => !v)}
            aria-pressed={salesTable}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Table2 className="w-3.5 h-3.5" /> {salesTable ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        </div>
        <Legend series={SALES_SERIES} />
        {salesTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="text-left font-semibold py-2">Mês</th>
                  <th className="text-right font-semibold">Pedidos</th>
                  <th className="text-right font-semibold">Vendas</th>
                  <th className="text-right font-semibold">Receita FotoRun</th>
                  <th className="text-right font-semibold">Repasse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-num">
                {[...monthly].reverse().map((m) => (
                  <tr key={m.month}>
                    <td className="py-2 font-sans">{m.label}</td>
                    <td className="text-right">{num(m.orders)}</td>
                    <td className="text-right">{brl(m.gmv)}</td>
                    <td className="text-right">{brl(m.platform)}</td>
                    <td className="text-right">{brl(m.photographers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <BarChart
            data={monthly}
            series={SALES_SERIES}
            mode="stacked"
            label={(d) => d.label}
            value={(d, k) => Number((d as any)[k])}
            format={brl}
            axisFormat={brlShort}
            ariaLabel="Vendas por mês, divididas entre receita da FotoRun e repasse aos fotógrafos"
            extra={(d) => (
              <span className="flex justify-between gap-3">
                <span>Total · {d.orders} pedido(s)</span>
                <strong className="font-mono-num text-[#0F172A]">{brl(d.gmv)}</strong>
              </span>
            )}
          />
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className={`${card} p-5 space-y-3 min-w-0`}>
          <h2 className="text-sm font-bold text-[#0F172A]">Novos cadastros por mês</h2>
          <Legend series={SIGNUP_SERIES} />
          <BarChart
            data={monthly}
            series={SIGNUP_SERIES}
            mode="grouped"
            label={(d) => d.label}
            value={(d, k) => Number((d as any)[k])}
            format={(v) => `${num(v)}`}
            axisFormat={(v) => (Number.isInteger(v) ? num(v) : '')}
            ariaLabel="Novos cadastros de atletas e fotógrafos por mês"
          />
        </section>

        <section className={`${card} p-5 space-y-4 min-w-0`}>
          <div>
            <h2 className="text-sm font-bold text-[#0F172A] mb-2">Eventos que mais venderam</h2>
            {data.topEvents.length === 0 ? (
              <p className="text-sm text-slate-500">Ainda sem vendas.</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {data.topEvents.map((e, i) => (
                  <li key={e.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      <span className="text-slate-400 font-mono-num mr-2">{i + 1}.</span>
                      {e.title}
                    </span>
                    <span className="font-mono-num font-semibold whitespace-nowrap">
                      {brl(e.gmv)} <span className="text-xs text-slate-500 font-normal">· {e.items} foto(s)</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#0F172A] mb-2">Fotógrafos que mais receberam</h2>
            {data.topPhotographers.length === 0 ? (
              <p className="text-sm text-slate-500">Ainda sem vendas.</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {data.topPhotographers.map((p, i) => (
                  <li key={p.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      <span className="text-slate-400 font-mono-num mr-2">{i + 1}.</span>
                      {p.name}
                    </span>
                    <span className="font-mono-num font-semibold whitespace-nowrap">
                      {brl(p.net)} <span className="text-xs text-slate-500 font-normal">· {p.items} foto(s)</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
