import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Lock,
  Pencil,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/supabase';
import { useFees, pct } from '../lib/fees';
import { BANKS } from '../data/banks';
import { ActiveView } from '../types';

type PersonType = 'pf' | 'pj';
type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';
type Status = 'em_analise' | 'aprovada' | 'recusada';

export interface PublicPayoutAccount {
  personType: PersonType;
  holderName: string;
  documentMasked: string;
  pixKeyType: PixKeyType;
  pixKeyMasked: string;
  bank: { code: string; name: string | null; agency: string | null; accountMasked: string | null; accountType: string | null } | null;
  status: Status;
  reviewNote: string | null;
  updatedAt: string;
}

interface Form {
  personType: PersonType;
  holderName: string;
  document: string;
  birthDate: string;
  phone: string;
  pixKeyType: PixKeyType;
  pixKey: string;
  bankCode: string;
  bankName: string;
  agency: string;
  accountNumber: string;
  accountType: '' | 'corrente' | 'poupanca' | 'pagamento';
}

const EMPTY: Form = {
  personType: 'pf',
  holderName: '',
  document: '',
  birthDate: '',
  phone: '',
  pixKeyType: 'cpf',
  pixKey: '',
  bankCode: '',
  bankName: '',
  agency: '',
  accountNumber: '',
  accountType: '',
};

const STEPS = ['Dados do titular', 'Como receber', 'Confirmação'];
const STEP_OF: Record<string, number> = {
  personType: 0, holderName: 0, document: 0, birthDate: 0, phone: 0,
  pixKeyType: 1, pixKey: 1, bankCode: 1, agency: 1, accountNumber: 1, accountType: 1,
};

export const PIX_LABEL: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Celular',
  aleatoria: 'Chave aleatória',
};
const ACCOUNT_LABEL: Record<string, string> = { corrente: 'Corrente', poupanca: 'Poupança', pagamento: 'Conta de pagamento' };

// Máscaras de digitação
const digits = (s: string) => s.replace(/\D/g, '');
function fmtCPF(v: string) {
  const d = digits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function fmtCNPJ(v: string) {
  const c = v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
  let out = '';
  [...c].forEach((ch, i) => {
    if (i === 2 || i === 5) out += '.';
    if (i === 8) out += '/';
    if (i === 12) out += '-';
    out += ch;
  });
  return out;
}
function fmtPhone(v: string) {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D04400] focus:border-[#D04400]';
const labelClass = 'block text-xs font-semibold text-slate-700 mb-1.5';

function StatusBadge({ status }: { status: Status }) {
  if (status === 'aprovada')
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
        <CheckCircle2 className="w-3.5 h-3.5" /> Aprovada — saques liberados
      </span>
    );
  if (status === 'recusada')
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">
        <AlertCircle className="w-3.5 h-3.5" /> Precisa de correção
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
      <Clock className="w-3.5 h-3.5" /> Em análise
    </span>
  );
}

interface Props {
  onNavigate: (view: ActiveView) => void;
}

/** Conta de recebimento do fotógrafo: cadastro em 3 etapas e resumo mascarado. */
export const PayoutAccountView: React.FC<Props> = ({ onNavigate }) => {
  const { fees } = useFees();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<PublicPayoutAccount | null>(null);
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [declaration, setDeclaration] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showBank, setShowBank] = useState(false);
  const [otherBank, setOtherBank] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/me/payout-account');
        const data = await res.json();
        if (res.ok) {
          setAccount(data.account);
          if (!data.account) {
            setEditing(true);
            const s = data.suggestions || {};
            setForm((f) => ({ ...f, holderName: s.holderName || '', phone: fmtPhone(s.phone || '') }));
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      if (!e[k]) return e;
      const { [k]: _omit, ...rest } = e;
      return rest;
    });
  };

  const startEdit = () => {
    if (account) {
      setForm({
        ...EMPTY,
        personType: account.personType,
        holderName: account.holderName,
        pixKeyType: account.pixKeyType,
        bankCode: account.bank?.code || '',
        bankName: account.bank?.name || '',
        agency: account.bank?.agency || '',
        accountType: (account.bank?.accountType as Form['accountType']) || '',
      });
      setShowBank(Boolean(account.bank));
    }
    setStep(0);
    setDeclaration(false);
    setErrors({});
    setMessage(null);
    setEditing(true);
  };

  // A chave CPF/CNPJ é sempre o documento do titular
  const docKeyType: PixKeyType = form.personType === 'pf' ? 'cpf' : 'cnpj';
  const effectivePixKey = form.pixKeyType === docKeyType ? form.document : form.pixKey;
  const pixOptions: PixKeyType[] = [docKeyType, 'email', 'telefone', 'aleatoria'];

  const checkStep = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (form.holderName.trim().length < 3) e.holderName = 'Informe o nome completo.';
      const d = form.personType === 'pf' ? digits(form.document) : form.document.replace(/[^0-9A-Z]/gi, '');
      if (d.length !== (form.personType === 'pf' ? 11 : 14)) e.document = form.personType === 'pf' ? 'CPF incompleto.' : 'CNPJ incompleto.';
      if (form.personType === 'pf' && !form.birthDate) e.birthDate = 'Informe a data de nascimento.';
      if (digits(form.phone).length < 10) e.phone = 'Informe um celular com DDD.';
    }
    if (s === 1) {
      if (!effectivePixKey.trim()) e.pixKey = 'Informe a chave Pix.';
      if (showBank && (form.bankCode || form.agency || form.accountNumber)) {
        if (!form.bankCode) e.bankCode = 'Escolha o banco.';
        if (!form.agency) e.agency = 'Informe a agência.';
        if (!form.accountNumber) e.accountNumber = 'Informe a conta.';
        if (!form.accountType) e.accountType = 'Escolha o tipo.';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (checkStep(step)) setStep((s) => Math.min(2, s + 1));
  };

  const submit = async () => {
    if (!declaration) {
      setMessage({ ok: false, text: 'Marque a declaração para enviar.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const useBank = showBank && Boolean(form.bankCode || form.agency || form.accountNumber);
      const res = await apiFetch('/api/me/payout-account', {
        method: 'PUT',
        body: JSON.stringify({
          personType: form.personType,
          holderName: form.holderName,
          document: form.document,
          birthDate: form.personType === 'pf' ? form.birthDate : null,
          phone: form.phone,
          pixKeyType: form.pixKeyType,
          pixKey: effectivePixKey,
          bankCode: useBank ? form.bankCode : null,
          bankName: useBank ? form.bankName : null,
          agency: useBank ? form.agency : null,
          accountNumber: useBank ? form.accountNumber : null,
          accountType: useBank ? form.accountType || null : null,
          declaration: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fields) {
          setErrors(data.fields);
          const first = Math.min(...Object.keys(data.fields).map((k) => STEP_OF[k] ?? 0));
          setStep(first);
        }
        setMessage({ ok: false, text: data.error || 'Não foi possível salvar.' });
        return;
      }
      setAccount(data.account);
      setEditing(false);
      setMessage({ ok: true, text: data.message });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setMessage({ ok: false, text: 'Sem conexão. Tente de novo.' });
    } finally {
      setSaving(false);
    }
  };

  const bankLabel = useMemo(() => {
    if (!form.bankCode) return '';
    const b = BANKS.find((x) => x.code === form.bankCode);
    return `${form.bankCode} · ${b?.name || form.bankName || 'Outro banco'}`;
  }, [form.bankCode, form.bankName]);

  const err = (k: string) =>
    errors[k] ? (
      <p className="mt-1 text-xs text-red-600" id={`err-${k}`}>
        {errors[k]}
      </p>
    ) : null;
  const borderFor = (k: string) => (errors[k] ? 'border-red-400 bg-red-50/40' : 'border-slate-300');

  if (loading) {
    return (
      <div className="py-24 flex justify-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-8 py-8 space-y-6">
      <button
        type="button"
        onClick={() => onNavigate('photographer')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#0F172A]"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar ao painel
      </button>

      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">Conta de recebimento</h1>
        <p className="text-sm text-slate-600">Para onde vão os seus repasses. Seus dados ficam protegidos e só aparecem mascarados.</p>
      </header>

      {message && (
        <p
          className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 border ${
            message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-800'
          }`}
          role="status"
        >
          {message.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          {message.text}
        </p>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        {/* ------- COLUNA PRINCIPAL ------- */}
        {!editing && account ? (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge status={account.status} />
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="w-4 h-4" /> Alterar dados
              </button>
            </div>
            {account.status === 'recusada' && account.reviewNote && (
              <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <strong>O que corrigir:</strong> {account.reviewNote}
              </p>
            )}
            {account.status === 'em_analise' && (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Estamos conferindo seus dados. Enquanto isso você pode enviar e vender fotos normalmente — o saldo fica guardado.
              </p>
            )}
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Titular</dt>
                <dd className="font-semibold text-[#0F172A]">{account.holderName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{account.personType === 'pf' ? 'CPF' : 'CNPJ'}</dt>
                <dd className="font-mono-num">{account.documentMasked}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Chave Pix ({PIX_LABEL[account.pixKeyType]})</dt>
                <dd className="font-mono-num">{account.pixKeyMasked}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Conta bancária</dt>
                <dd>
                  {account.bank
                    ? `${account.bank.code} ${account.bank.name || ''} · ag. ${account.bank.agency} · ${account.bank.accountMasked} (${
                        ACCOUNT_LABEL[account.bank.accountType || ''] || ''
                      })`
                    : 'Não informada (opcional)'}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Trocar a chave Pix, o documento ou o banco faz a conta voltar para análise, por segurança.
            </p>
          </section>
        ) : (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
            {/* Stepper */}
            <ol className="flex items-center" aria-label="Etapas">
              {STEPS.map((label, i) => (
                <li key={label} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
                  <span className="flex flex-col items-center gap-1 text-center">
                    <span
                      className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                        i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-[#D04400] text-white' : 'bg-slate-200 text-slate-500'
                      }`}
                      aria-current={i === step ? 'step' : undefined}
                    >
                      {i < step ? <Check className="w-4 h-4" /> : i + 1}
                    </span>
                    <span className={`text-[11px] sm:text-xs font-semibold ${i === step ? 'text-[#D04400]' : 'text-slate-500'}`}>{label}</span>
                  </span>
                  {i < STEPS.length - 1 && <span className={`flex-1 h-0.5 mx-2 mb-5 ${i < step ? 'bg-emerald-600' : 'bg-slate-200'}`} />}
                </li>
              ))}
            </ol>

            {step === 0 && (
              <div className="space-y-5">
                <fieldset>
                  <legend className={labelClass}>Tipo de conta</legend>
                  <div className="flex gap-6 text-sm">
                    {(['pf', 'pj'] as PersonType[]).map((t) => (
                      <label key={t} className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="ptype"
                          checked={form.personType === t}
                          onChange={() => {
                            set('personType', t);
                            set('document', '');
                            set('pixKeyType', t === 'pf' ? 'cpf' : 'cnpj');
                          }}
                          className="accent-[#D04400]"
                        />
                        {t === 'pf' ? 'Pessoa física (CPF)' : 'Pessoa jurídica (CNPJ)'}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={labelClass} htmlFor="pa-name">
                      {form.personType === 'pf' ? 'Nome completo (igual ao do banco)' : 'Razão social'}
                    </label>
                    <input id="pa-name" className={`${inputClass} ${borderFor('holderName')}`} value={form.holderName} onChange={(e) => set('holderName', e.target.value)} autoComplete="name" />
                    {err('holderName')}
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="pa-doc">{form.personType === 'pf' ? 'CPF' : 'CNPJ'}</label>
                    <input
                      id="pa-doc"
                      inputMode={form.personType === 'pf' ? 'numeric' : 'text'}
                      placeholder={form.personType === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'}
                      className={`${inputClass} font-mono-num ${borderFor('document')}`}
                      value={form.document}
                      onChange={(e) => set('document', form.personType === 'pf' ? fmtCPF(e.target.value) : fmtCNPJ(e.target.value))}
                    />
                    {err('document')}
                  </div>
                  {form.personType === 'pf' && (
                    <div>
                      <label className={labelClass} htmlFor="pa-birth">Data de nascimento</label>
                      <input id="pa-birth" type="date" className={`${inputClass} ${borderFor('birthDate')}`} value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
                      {err('birthDate')}
                    </div>
                  )}
                  <div>
                    <label className={labelClass} htmlFor="pa-phone">Celular</label>
                    <div className={`flex rounded-lg border overflow-hidden focus-within:ring-2 focus-within:ring-[#D04400] ${borderFor('phone')}`}>
                      <span className="px-3 text-sm text-slate-500 bg-slate-50 flex items-center border-r border-slate-200">+55</span>
                      <input
                        id="pa-phone"
                        inputMode="tel"
                        placeholder="(00) 00000-0000"
                        className="flex-1 px-3 py-2.5 text-sm outline-none font-mono-num bg-transparent"
                        value={form.phone}
                        onChange={(e) => set('phone', fmtPhone(e.target.value))}
                        autoComplete="tel-national"
                      />
                    </div>
                    {err('phone')}
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass} htmlFor="pa-pixtype">Tipo da chave Pix</label>
                    <select
                      id="pa-pixtype"
                      className={`${inputClass} border-slate-300 bg-white`}
                      value={form.pixKeyType}
                      onChange={(e) => {
                        set('pixKeyType', e.target.value as PixKeyType);
                        set('pixKey', '');
                      }}
                    >
                      {pixOptions.map((t) => (
                        <option key={t} value={t}>
                          {PIX_LABEL[t]}
                          {t === docKeyType ? ' (recomendado)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="pa-pix">Chave Pix</label>
                    {form.pixKeyType === docKeyType ? (
                      <input id="pa-pix" readOnly className={`${inputClass} border-slate-200 bg-slate-50 font-mono-num`} value={form.document} />
                    ) : (
                      <input
                        id="pa-pix"
                        className={`${inputClass} ${borderFor('pixKey')}`}
                        inputMode={form.pixKeyType === 'telefone' ? 'tel' : form.pixKeyType === 'email' ? 'email' : 'text'}
                        placeholder={
                          form.pixKeyType === 'email' ? 'voce@email.com' : form.pixKeyType === 'telefone' ? '(00) 00000-0000' : '0000aaaa-0000-0000-0000-000000000000'
                        }
                        value={form.pixKey}
                        onChange={(e) => set('pixKey', form.pixKeyType === 'telefone' ? fmtPhone(e.target.value) : e.target.value)}
                      />
                    )}
                    {err('pixKey')}
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  A chave precisa estar no <strong>seu nome</strong> ({form.personType === 'pf' ? 'mesmo CPF' : 'mesmo CNPJ'} do passo anterior). Conferimos
                  isso antes de liberar o primeiro saque.
                </p>

                <div className="rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowBank((v) => !v)}
                    aria-expanded={showBank}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[#0F172A]"
                  >
                    <span className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-500" /> Conta bancária <span className="font-normal text-slate-500">(opcional — reserva se o Pix falhar)</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showBank ? 'rotate-180' : ''}`} />
                  </button>
                  {showBank && (
                    <div className="grid sm:grid-cols-2 gap-4 px-4 pb-4">
                      <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor="pa-bank">Banco</label>
                        <select
                          id="pa-bank"
                          className={`${inputClass} bg-white ${borderFor('bankCode')}`}
                          value={otherBank ? 'outro' : form.bankCode}
                          onChange={(e) => {
                            if (e.target.value === 'outro') {
                              setOtherBank(true);
                              set('bankCode', '');
                              set('bankName', '');
                            } else {
                              setOtherBank(false);
                              set('bankCode', e.target.value);
                              set('bankName', BANKS.find((b) => b.code === e.target.value)?.name || '');
                            }
                          }}
                        >
                          <option value="">Selecione</option>
                          {BANKS.map((b) => (
                            <option key={b.code} value={b.code}>
                              {b.code} · {b.name}
                            </option>
                          ))}
                          <option value="outro">Outro banco…</option>
                        </select>
                        {err('bankCode')}
                      </div>
                      {otherBank && (
                        <>
                          <div>
                            <label className={labelClass} htmlFor="pa-bankcode">Código do banco (3 números)</label>
                            <input id="pa-bankcode" inputMode="numeric" maxLength={3} className={`${inputClass} font-mono-num ${borderFor('bankCode')}`} value={form.bankCode} onChange={(e) => set('bankCode', digits(e.target.value))} />
                          </div>
                          <div>
                            <label className={labelClass} htmlFor="pa-bankname">Nome do banco</label>
                            <input id="pa-bankname" className={`${inputClass} border-slate-300`} value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
                          </div>
                        </>
                      )}
                      <div>
                        <label className={labelClass} htmlFor="pa-agency">Agência (sem dígito)</label>
                        <input id="pa-agency" inputMode="numeric" maxLength={5} className={`${inputClass} font-mono-num ${borderFor('agency')}`} value={form.agency} onChange={(e) => set('agency', digits(e.target.value))} />
                        {err('agency')}
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="pa-account">Conta com dígito</label>
                        <input
                          id="pa-account"
                          placeholder="12345-6"
                          className={`${inputClass} font-mono-num ${borderFor('accountNumber')}`}
                          value={form.accountNumber}
                          onChange={(e) => set('accountNumber', e.target.value.toUpperCase().replace(/[^0-9X-]/g, '').slice(0, 15))}
                        />
                        {err('accountNumber')}
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor="pa-acctype">Tipo de conta</label>
                        <select id="pa-acctype" className={`${inputClass} bg-white ${borderFor('accountType')}`} value={form.accountType} onChange={(e) => set('accountType', e.target.value as Form['accountType'])}>
                          <option value="">Selecione</option>
                          <option value="corrente">Corrente</option>
                          <option value="poupanca">Poupança</option>
                          <option value="pagamento">Conta de pagamento (ex.: Nubank, PicPay)</option>
                        </select>
                        {err('accountType')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <dl className="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-sm">
                  {[
                    ['Tipo', form.personType === 'pf' ? 'Pessoa física' : 'Pessoa jurídica'],
                    [form.personType === 'pf' ? 'Nome' : 'Razão social', form.holderName],
                    [form.personType === 'pf' ? 'CPF' : 'CNPJ', form.document],
                    ...(form.personType === 'pf' ? [['Nascimento', form.birthDate ? form.birthDate.split('-').reverse().join('/') : '']] : []),
                    ['Celular', `+55 ${form.phone}`],
                    [`Chave Pix (${PIX_LABEL[form.pixKeyType]})`, effectivePixKey],
                    ['Conta bancária', showBank && form.bankCode ? `${bankLabel} · ag. ${form.agency} · ${form.accountNumber} (${ACCOUNT_LABEL[form.accountType] || ''})` : 'Não informada'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="font-semibold text-[#0F172A] text-right break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} className="mt-0.5 accent-[#D04400]" />
                  Declaro que sou o titular desses dados, que a chave Pix e a conta estão no meu nome e que as informações estão corretas.
                </label>
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-3 pt-2 border-t border-slate-100">
              <div>
                {step > 0 ? (
                  <button type="button" onClick={() => setStep((s) => s - 1)} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Voltar
                  </button>
                ) : account ? (
                  <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Cancelar
                  </button>
                ) : null}
              </div>
              {step < 2 ? (
                <button type="button" onClick={next} className="px-6 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] text-white text-sm font-bold">
                  Continuar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#D04400] hover:bg-[#A63500] disabled:opacity-60 text-white text-sm font-bold"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Enviar para análise
                </button>
              )}
            </div>
          </section>
        )}

        {/* ------- LATERAL ------- */}
        <aside className="space-y-4">
          <div className="bg-[#0F172A] text-white rounded-2xl p-5 space-y-3">
            <p className="font-bold flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#38BDF8]" /> Você recebe {pct(fees.photographerSharePercent)}
            </p>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Sem mensalidade e sem taxa de saque</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Pix em até {fees.payoutBusinessDays} dia(s) útil(eis) após pedir</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Taxa do Pix e do cartão já inclusa</li>
            </ul>
            <button type="button" onClick={() => onNavigate('taxas')} className="text-xs font-semibold underline text-[#38BDF8]">
              Ver todas as taxas
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 text-sm text-slate-600">
            <p className="font-bold text-[#0F172A] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" /> Por que pedimos isso?
            </p>
            <p>Só o necessário para pagar você com segurança e evitar que alguém desvie seus repasses.</p>
            <p>Não pedimos renda, profissão nem endereço.</p>
          </div>
        </aside>
      </div>
    </div>
  );
};
