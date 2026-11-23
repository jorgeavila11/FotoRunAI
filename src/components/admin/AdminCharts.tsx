import React, { useEffect, useRef, useState } from 'react';

/** Paleta validada (claro): slot 1 laranja da marca, slot 2 azul-petróleo. */
export const SERIES_COLORS = ['#D04400', '#0891B2'];

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brlShort = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(n)}`;

/** Passo "redondo" do eixo (1, 2, 5, 10...) para ~5 linhas de grade */
function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export interface Series {
  key: string;
  label: string;
  color: string;
}

interface BarChartProps<T> {
  data: T[];
  series: Series[];
  label: (d: T) => string;
  value: (d: T, key: string) => number;
  mode: 'stacked' | 'grouped';
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  /** Linha extra no tooltip (ex.: total e pedidos) */
  extra?: (d: T) => React.ReactNode;
  ariaLabel: string;
}

/**
 * Barras mensais: base reta no eixo, topo arredondado (4px), 2px de respiro
 * entre segmentos/barras, área de passar o mouse maior que a barra, tooltip.
 */
export function BarChart<T>({ data, series, label, value, mode, format, axisFormat, extra, ariaLabel }: BarChartProps<T>) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(300, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 240;
  const pad = { top: 12, right: 8, bottom: 26, left: 64 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const totals = data.map((d) =>
    mode === 'stacked' ? series.reduce((s, se) => s + value(d, se.key), 0) : Math.max(...series.map((se) => value(d, se.key))),
  );
  const rawMax = Math.max(...totals, 0);
  const step = niceStep(rawMax / 5);
  const max = Math.max(step, Math.ceil(rawMax / step) * step);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const slot = plotW / Math.max(1, data.length);
  const groupW = Math.min(slot * 0.68, 40);
  const barW = mode === 'grouped' ? (groupW - 2 * (series.length - 1)) / series.length : groupW;
  const base = pad.top + plotH;

  /** Retângulo com topo opcionalmente arredondado */
  const rectPath = (x: number, top: number, bottom: number, roundTop: boolean) => {
    const h = bottom - top;
    if (h <= 0.5) return '';
    const r = roundTop ? Math.min(4, barW / 2, h) : 0;
    return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${bottom} Z`;
  };

  const hovered = hover !== null ? data[hover] : null;
  const fmtAxis = axisFormat || format;

  return (
    <div className="relative w-full min-w-0 overflow-hidden" ref={boxRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="#E2E8F0" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#64748B">
              {fmtAxis(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = pad.left + slot * i + (slot - groupW) / 2;
          let marks: React.ReactNode[] = [];
          if (mode === 'stacked') {
            let acc = 0;
            const nonZero = series.filter((se) => value(d, se.key) > 0);
            marks = series.map((se) => {
              const v = value(d, se.key);
              if (v <= 0) return null;
              const bottom = acc === 0 ? base : y(acc) - 2; // 2px de respiro entre segmentos
              acc += v;
              const top = y(acc);
              const isTop = nonZero[nonZero.length - 1]?.key === se.key;
              return <path key={se.key} d={rectPath(gx, top, bottom, isTop)} fill={se.color} />;
            });
          } else {
            marks = series.map((se, k) => (
              <path key={se.key} d={rectPath(gx + k * (barW + 2), y(value(d, se.key)), base, true)} fill={se.color} />
            ));
          }
          return (
            <g key={i}>
              {hover === i && <rect x={pad.left + slot * i} y={pad.top} width={slot} height={plotH} fill="#F1F5F9" />}
              {marks}
              {(slot >= 46 || i % 2 === (data.length - 1) % 2) && (
                <text x={pad.left + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748B">
                  {label(d)}
                </text>
              )}
              <rect
                x={pad.left + slot * i}
                y={pad.top}
                width={slot}
                height={plotH + pad.bottom}
                fill="transparent"
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${label(d)}: ${series.map((se) => `${se.label} ${format(value(d, se.key))}`).join(', ')}`}
              />
            </g>
          );
        })}
        <line x1={pad.left} x2={W - pad.right} y1={base} y2={base} stroke="#94A3B8" strokeWidth={1} />
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg min-w-[170px]"
          style={{
            left: `${((pad.left + slot * hover + slot / 2) / W) * 100}%`,
            transform: hover > data.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <p className="font-bold text-[#0F172A] mb-1">{label(hovered)}</p>
          {[...series].reverse().map((se) => (
            <p key={se.key} className="flex items-center justify-between gap-3 text-slate-700">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: se.color }} />
                {se.label}
              </span>
              <span className="font-mono-num font-semibold text-[#0F172A]">{format(value(hovered, se.key))}</span>
            </p>
          ))}
          {extra && <div className="mt-1 pt-1 border-t border-slate-100 text-slate-600">{extra(hovered)}</div>}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
