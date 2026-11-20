import { useEffect, useState } from 'react';

export interface FeesInfo {
  platformFeePercent: number;
  photographerSharePercent: number;
  payoutBusinessDays: number;
  minPayout: number;
  downloadMonths: number;
  items: { service: string; value: string; detail: string }[];
  rules: string[];
}

/** Valores usados enquanto a resposta do servidor não chega (iguais ao padrão do servidor) */
export const DEFAULT_FEES: FeesInfo = {
  platformFeePercent: 15,
  photographerSharePercent: 85,
  payoutBusinessDays: 2,
  minPayout: 0,
  downloadMonths: 12,
  items: [],
  rules: [],
};

let cache: Promise<FeesInfo> | null = null;
function loadFees() {
  if (!cache) {
    cache = fetch('/api/fees')
      .then((r) => (r.ok ? r.json() : DEFAULT_FEES))
      .catch(() => {
        cache = null;
        return DEFAULT_FEES;
      });
  }
  return cache;
}

/** Taxas da plataforma, sempre as mesmas que o servidor usa nos cálculos. */
export function useFees() {
  const [fees, setFees] = useState<FeesInfo>(DEFAULT_FEES);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    loadFees().then((f) => {
      if (alive) {
        setFees(f);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return { fees, loaded, share: fees.photographerSharePercent / 100 };
}

export const pct = (n: number) => `${String(n).replace('.', ',')}%`;
