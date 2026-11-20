import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, Images, ScanFace, MapPin, Lightbulb, Table2, BarChart3 } from 'lucide-react';
import { apiFetch } from '../lib/supabase';
import { useFees, pct } from '../lib/fees';

interface Period {
  net: number;
  gross: number;
  items: number;
}
interface MonthPoint {
  month: string;
  label: string;
  net: number;
  items: number;
  prevNet: number;
  prevItems: number;
}
interface CheckpointRow {
  eventId: string;
  eventTitle: string;
  checkpoint: string;
  photos: number;
  soldPhotos: number;
  items: number;
  net: number;
  conversion: number;
}
interface Insights {
  periods: { today: Period; last7: Period; month: Period; total: Period };
  balance: { available: number; paidOut: number };
  uploads: { photos: number; facesIndexed: number };
  monthly: MonthPoint[];
  checkpoints: CheckpointRow[];
}

// Paleta validada (dataviz/validate_palette.js): passa em CVD, croma e contraste no fundo claro
const COLOR_CURRENT = '#D04400';
const COLOR_PREVIOUS = '#0891B2';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlShort = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(n)}`;

/** Valor "redondo" para o topo do eixo */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

const card = 'bg-white rounded-xl border border-slate-200';

/* ------------------------------------------------------------------ Gráfico mensal */

function MonthlyChart({ data, metric, compare }: { data: MonthPoint[]; metric: 'net' | 'items'; compare: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  // Mede a largura real para o texto dos eixos manter 11px em qualquer tela
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 260;
  const pad = { top: 16, right: 8, bottom: 28, left: 64 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const cur = (d: MonthPoint) => (metric === 'net' ? d.net : d.items);
  const prev = (d: MonthPoint) => (metric === 'net' ? d.prevNet : d.prevItems);
  const max = niceMax(Math.max(...data.map((d) => Math.max(cur(d), compare ? prev(d) : 0)), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const fmt = (v: number) => (metric === 'net' ? brlShort(v) : Math.round(v).toLocaleString('pt-BR'));

  const slot = plotW / data.length;
  const groupW = Math.min(slot * 0.7, 44);
  const barW = compare ? (groupW - 2) / 2 : groupW; // 2px de respiro entre as barras do grupo
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  /** Barra com topo arredondado (4px) e base reta no eixo */
  const bar = (x: number, v: number) => {
    const top = y(v);
    const h = pad.top + plotH - top;
    if (h <= 0) return '';
    const r = Math.min(4, barW / 2, h);
    return `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
  };

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div className="relative" ref={boxRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Desempenho mensal">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="#E2E8F0" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#64748B">
              {fmt(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = pad.left + slot * i + (slot - groupW) / 2;
          return (
            <g key={d.month}>
              {hover === i && <rect x={pad.left + slot * i} y={pad.top} width={slot} height={plotH} fill="#F1F5F9" />}
              {compare && <path d={bar(gx, prev(d))} fill={COLOR_PREVIOUS} />}
              <path d={bar(compare ? gx + barW + 2 : gx, cur(d))} fill={COLOR_CURRENT} />
              {(slot >= 44 || i % 2 === data.length % 2) && (
                <text x={pad.left + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748B">
                  {d.label}
                </text>
              )}
              {/* área de toque maior que a barra */}
              <rect
                x={pad.left + slot * i}
                y={pad.top}
                width={slot}
                height={plotH + pad.bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${d.label}: ${metric === 'net' ? brl(cur(d)) : `${cur(d)} foto(s)`}`}
              />
            </g>
          );
        })}
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${((pad.left + slot * hover + slot / 2) / W) * 100}%`,
            transform: hover > data.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <p className="font-bold text-[#0F172A] mb-1">{hovered.label}</p>
          <p className="flex items-center gap-2 text-slate-700">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_CURRENT }} />
            {metric === 'net' ? brl(hovered.net) : `${hovered.items} foto(s)`}
          </p>
          {compare && (
            <p className="flex items-center gap-2 text-slate-700">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_PREVIOUS }} />
              Ano anterior: {metric === 'net' ? brl(hovered.prevNet) : `${hovered.prevItems} foto(s)`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Componente principal */

export const PhotographerInsights: React.FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
  const { fees } = useFees();
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<'net' | 'items'>('net');
  const [compare, setCompare] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/photographer/insights');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Falha ao carregar indicadores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const events = useMemo(() => {
    const map = new Map<string, string>();
    data?.checkpoints.forEach((c) => map.set(c.eventId, c.eventTitle));
    return [...map.entries()];
  }, [data]);

  useEffect(() => {
    if (events.length && !events.some(([id]) => id === eventFilter)) setEventFilter(events[0][0]);
  }, [events, eventFilter]);

  if (loading && !data) {
    return (
      <div className={`${card} p-8 flex items-center justify-center gap-2 text-sm text-slate-600`}>
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando seus indicadores...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{error}</span>
        <button type="button" onClick={load} className="ml-auto underline font-semibold">
          Tentar de novo
        </button>
      </div>
    );
  }

  const periods: Array<[string, Period]> = [
    ['Hoje', data.periods.today],
    ['Últimos 7 dias', data.periods.last7],
    ['Mês atual', data.periods.month],
    ['Desde o começo', data.periods.total],
  ];

  const cpRows = data.checkpoints.filter((c) => c.eventId === eventFilter);
  const cpMax = Math.max(...cpRows.map((c) => c.net), 0);
  const bestByNet = [...cpRows].sort((a, b) => b.net - a.net)[0];
  const bestByConversion = [...cpRows].filter((c) => c.photos >= 5).sort((a, b) => b.conversion - a.conversion)[0];
  const hasSales = data.periods.total.items > 0;

  return (
    <div className="space-y-6">
      {/* GANHOS + SALDO */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${card} lg:col-span-2`}>
          <h2 className="px-5 py-3 border-b border-slate-100 text-sm font-bold text-[#0F172A]">Seus ganhos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {periods.map(([label, p], i) => (
              <div key={label} className={`p-5 space-y-1 ${i > 0 ? 'sm:border-l border-slate-100' : ''}`}>
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="text-xl font-extrabold text-[#0F172A] font-mono-num">{brl(p.net)}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Images className="w-3.5 h-3.5" /> {p.items} foto(s) vendida(s)
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0F172A] text-white rounded-xl p-5 space-y-3">
          <div>
            <p className="text-xs font-semibold text-[#38BDF8]">Disponível para saque</p>
            <p className="text-2xl font-extrabold font-mono-num">{brl(data.balance.available)}</p>
            <p className="text-xs text-slate-300">Já sacado: {brl(data.balance.paidOut)} · você recebe {pct(fees.photographerSharePercent)} de cada venda</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700 text-xs">
            <p className="flex items-center gap-1.5 text-slate-200">
              <Images className="w-4 h-4 text-slate-400" /> {data.uploads.photos.toLocaleString('pt-BR')} fotos enviadas
            </p>
            <p className="flex items-center gap-1.5 text-slate-200">
              <ScanFace className="w-4 h-4 text-slate-400" /> {data.uploads.facesIndexed.toLocaleString('pt-BR')} rostos indexados
            </p>
          </div>
        </div>
      </section>

      {/* DESEMPENHO MENSAL */}
      <section className={`${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[#0F172A]">
            Desempenho mensal · {metric === 'net' ? 'ganhos líquidos' : 'fotos vendidas'}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Medida">
              {(['net', 'items'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  aria-pressed={metric === m}
                  className={`px-3 py-1.5 rounded-md font-semibold ${metric === m ? 'bg-[#0F172A] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {m === 'net' ? 'Ganhos' : 'Fotos vendidas'}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 px-2 py-1.5 font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-[#D04400]" />
              Comparar com ano anterior
            </label>
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2 py-1.5 font-semibold text-slate-600 hover:text-[#0F172A]"
            >
              {showTable ? <BarChart3 className="w-4 h-4" /> : <Table2 className="w-4 h-4" />}
              {showTable ? 'Ver gráfico' : 'Ver tabela'}
            </button>
          </div>
        </div>

        {compare && !showTable && (
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: COLOR_CURRENT }} /> Últimos 12 meses
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: COLOR_PREVIOUS }} /> Mesmo mês do ano anterior
            </span>
          </div>
        )}

        {showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-4 font-semibold">Mês</th>
                  <th className="py-2 pr-4 font-semibold text-right">Ganhos</th>
                  <th className="py-2 pr-4 font-semibold text-right">Fotos vendidas</th>
                  <th className="py-2 pr-4 font-semibold text-right">Ganhos (ano anterior)</th>
                  <th className="py-2 font-semibold text-right">Fotos (ano anterior)</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((m) => (
                  <tr key={m.month} className="border-b border-slate-50">
                    <td className="py-2 pr-4">{m.label}</td>
                    <td className="py-2 pr-4 text-right font-mono-num">{brl(m.net)}</td>
                    <td className="py-2 pr-4 text-right font-mono-num">{m.items}</td>
                    <td className="py-2 pr-4 text-right font-mono-num text-slate-500">{brl(m.prevNet)}</td>
                    <td className="py-2 text-right font-mono-num text-slate-500">{m.prevItems}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : hasSales ? (
          <MonthlyChart data={data.monthly} metric={metric} compare={compare} />
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">
            Suas vendas vão aparecer aqui mês a mês assim que o primeiro atleta comprar uma foto.
          </p>
        )}
      </section>

      {/* VENDAS POR PONTO DO PERCURSO */}
      <section className={`${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#D04400]" /> Vendas por ponto do percurso
            </h2>
            <p className="text-xs text-slate-500">Descubra em que ponto da prova suas fotos vendem mais.</p>
          </div>
          {events.length > 0 && (
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              aria-label="Evento"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]"
            >
              {events.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          )}
        </div>

        {cpRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Envie fotos indicando o ponto do percurso para ver aqui onde elas vendem mais.
          </p>
        ) : (
          <>
            {bestByNet && bestByNet.net > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>{bestByNet.checkpoint}</strong> é o ponto que mais gerou ganhos ({brl(bestByNet.net)}).
                  {bestByConversion && bestByConversion.checkpoint !== bestByNet.checkpoint && (
                    <>
                      {' '}
                      Já <strong>{bestByConversion.checkpoint}</strong> tem a maior taxa de conversão: {bestByConversion.conversion.toLocaleString('pt-BR')}% das
                      fotos foram vendidas.
                    </>
                  )}{' '}
                  Considere reforçar esses pontos na próxima prova.
                </span>
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 pr-4 font-semibold">Ponto do percurso</th>
                    <th className="py-2 pr-4 font-semibold w-[38%] min-w-[200px]">Ganhos</th>
                    <th className="py-2 pr-4 font-semibold text-right">Fotos enviadas</th>
                    <th className="py-2 pr-4 font-semibold text-right">Fotos vendidas</th>
                    <th className="py-2 font-semibold text-right">Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {cpRows.map((c) => (
                    <tr key={c.checkpoint} className="border-b border-slate-50">
                      <td className="py-2.5 pr-4 font-semibold text-[#0F172A]">{c.checkpoint}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 rounded-r bg-slate-100 overflow-hidden" aria-hidden>
                            <div
                              className="h-full rounded-r"
                              style={{ width: `${cpMax > 0 ? (c.net / cpMax) * 100 : 0}%`, background: COLOR_CURRENT }}
                            />
                          </div>
                          <span className="font-mono-num text-xs text-[#0F172A] w-20 text-right">{brl(c.net)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono-num">{c.photos}</td>
                      <td className="py-2.5 pr-4 text-right font-mono-num">{c.soldPhotos}</td>
                      <td className="py-2.5 text-right font-mono-num">{c.conversion.toLocaleString('pt-BR')}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
