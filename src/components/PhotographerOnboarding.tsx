import React, { useState } from 'react';
import { Camera, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/supabase';
import { UFS } from './EventRequestsPanel';

const TYPES = [
  { value: 'tempo_integral', label: 'Fotógrafo em tempo integral' },
  { value: 'parcial', label: 'Fotógrafo em tempo parcial (tenho outro trabalho)' },
  { value: 'hobby', label: 'Fotógrafo por hobby' },
];
const EXPERIENCE = [
  { value: 'menos_1', label: 'Menos de 1 ano' },
  { value: '1_3', label: 'Entre 1 e 3 anos' },
  { value: '3_5', label: 'Entre 3 e 5 anos' },
  { value: 'mais_5', label: 'Mais de 5 anos' },
];
const GOALS = [
  { value: 'vender', label: 'Vender fotos de corridas' },
  { value: 'aumentar_ganhos', label: 'Aumentar meus ganhos' },
  { value: 'oportunidades', label: 'Receber convites para cobrir provas' },
  { value: 'comunidade', label: 'Trocar experiência com outros fotógrafos' },
];

interface Props {
  name: string;
  onDone: () => void;
  onSkip: () => void;
}

/** Cadastro inicial curto do fotógrafo, exibido no primeiro acesso ao painel. */
export const PhotographerOnboarding: React.FC<Props> = ({ name, onDone, onSkip }) => {
  const [photographerType, setType] = useState('');
  const [experience, setExperience] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [goals, setGoals] = useState<string[]>(['vender']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleGoal = (g: string) => setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!photographerType || !experience || !city.trim() || !state) {
      setError('Preencha todos os campos para continuar.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/me/onboarding', {
        method: 'PATCH',
        body: JSON.stringify({ photographerType, experience, city, state, goals }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const select = 'w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm text-[#0F172A] focus:outline-none focus:border-[#D04400]';

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <form onSubmit={submit} className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="space-y-1">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-50 text-[#D04400]">
            <Camera className="w-5 h-5" />
          </span>
          <h2 id="onb-title" className="text-xl font-extrabold text-[#0F172A]">
            Bem-vindo ao FotoRun, {name.split(' ')[0]}!
          </h2>
          <p className="text-sm text-slate-600">
            Quatro perguntas rápidas para personalizarmos seu painel e avisarmos você sobre provas na sua região.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-700 mb-1">O que melhor descreve você?</legend>
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer text-sm ${
                photographerType === t.value ? 'border-[#D04400] bg-orange-50/60' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input type="radio" name="type" value={t.value} checked={photographerType === t.value} onChange={() => setType(t.value)} className="accent-[#D04400]" />
              {t.label}
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="onb-exp" className="block text-xs font-semibold text-slate-700 mb-1">
            Há quanto tempo você fotografa?
          </label>
          <select id="onb-exp" className={select} value={experience} onChange={(e) => setExperience(e.target.value)}>
            <option value="">Selecione</option>
            {EXPERIENCE.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <div>
            <label htmlFor="onb-city" className="block text-xs font-semibold text-slate-700 mb-1">Cidade onde você mora</label>
            <input id="onb-city" className={select} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sobral" />
          </div>
          <div>
            <label htmlFor="onb-uf" className="block text-xs font-semibold text-slate-700 mb-1">Estado</label>
            <select id="onb-uf" className={select} value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">UF</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="text-xs font-semibold text-slate-700 mb-2">O que você busca no FotoRun? (pode marcar mais de um)</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {GOALS.map((g) => (
              <label key={g.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={goals.includes(g.value)} onChange={() => toggleGoal(g.value)} className="accent-[#D04400]" />
                {g.label}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-1">
          <button type="button" onClick={onSkip} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Agora não
          </button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] disabled:opacity-60 text-white text-sm font-bold">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Ir para o painel
          </button>
        </div>
      </form>
    </div>
  );
};
