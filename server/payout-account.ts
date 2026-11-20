/**
 * Conta de recebimento do fotógrafo (para onde vão os repasses).
 *
 * Segurança:
 *  - o navegador nunca lê a tabela; aqui devolvemos os dados MASCARADOS;
 *  - a chave Pix de CPF/CNPJ precisa ser do próprio titular;
 *  - qualquer troca de dados de pagamento volta a conta para "em análise",
 *    e o saque só é liberado com a conta aprovada pelo administrador.
 */
import type { Express } from 'express';
import { db, requireUser, requirePhotographer, requireAdmin, AuthedRequest } from './supabase';

export type PersonType = 'pf' | 'pj';
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export interface PayoutAccountInput {
  personType: PersonType;
  holderName: string;
  document: string;
  birthDate?: string | null;
  phone?: string | null;
  pixKeyType: PixKeyType;
  pixKey: string;
  bankCode?: string | null;
  bankName?: string | null;
  agency?: string | null;
  accountNumber?: string | null;
  accountType?: 'corrente' | 'poupanca' | 'pagamento' | null;
}

// ---------------------------------------------------------------------------
// Validações (funções puras — testadas em scripts/test-payout.ts)
// ---------------------------------------------------------------------------

export const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');
/** CNPJ pode ser alfanumérico (regra da Receita Federal a partir de julho/2026) */
export const normalizeCnpj = (s: string) => (s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

export function isValidCPF(raw: string) {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCNPJ(raw: string) {
  const cnpj = normalizeCnpj(raw);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const val = (c: string) => c.charCodeAt(0) - 48; // '0'..'9' = 0..9, 'A' = 17 ...
  const dv = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += val(cnpj[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizePixKey(type: PixKeyType, key: string) {
  const k = (key || '').trim();
  if (type === 'cpf') return onlyDigits(k);
  if (type === 'cnpj') return normalizeCnpj(k);
  if (type === 'email') return k.toLowerCase();
  if (type === 'telefone') {
    let d = onlyDigits(k);
    if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
    return d.length === 10 || d.length === 11 ? `+55${d}` : d;
  }
  return k.toLowerCase();
}

function ageOn(birth: Date, now: Date) {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

/** Valida e normaliza. Devolve { errors } por campo, ou { value } pronto para gravar. */
export function validatePayoutAccount(input: Partial<PayoutAccountInput>, now = new Date()) {
  const errors: Record<string, string> = {};
  const personType = input.personType === 'pj' ? 'pj' : input.personType === 'pf' ? 'pf' : null;
  if (!personType) errors.personType = 'Escolha pessoa física ou jurídica.';

  const holderName = (input.holderName || '').trim().replace(/\s+/g, ' ');
  if (holderName.length < 3 || holderName.length > 120) errors.holderName = 'Informe o nome completo (ou razão social).';
  else if (personType === 'pf' && holderName.split(' ').length < 2) errors.holderName = 'Informe nome e sobrenome.';

  const document = personType === 'pj' ? normalizeCnpj(input.document || '') : onlyDigits(input.document || '');
  if (personType === 'pf' && !isValidCPF(document)) errors.document = 'CPF inválido. Confira os números.';
  if (personType === 'pj' && !isValidCNPJ(document)) errors.document = 'CNPJ inválido. Confira os caracteres.';

  let birthDate: string | null = null;
  if (personType === 'pf') {
    const b = input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null;
    if (!b || Number.isNaN(b.getTime())) errors.birthDate = 'Informe a data de nascimento.';
    else if (ageOn(b, now) < 18) errors.birthDate = 'O titular da conta precisa ter 18 anos ou mais.';
    else if (ageOn(b, now) > 110) errors.birthDate = 'Confira a data de nascimento.';
    else birthDate = b.toISOString().slice(0, 10);
  }

  const phoneDigits = onlyDigits(input.phone || '');
  const phone = phoneDigits ? phoneDigits.replace(/^55(?=\d{10,11}$)/, '') : '';
  if (!phone || (phone.length !== 10 && phone.length !== 11)) errors.phone = 'Informe um celular com DDD.';

  const pixKeyType = input.pixKeyType;
  const validTypes: PixKeyType[] = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];
  let pixKey = '';
  if (!pixKeyType || !validTypes.includes(pixKeyType)) errors.pixKeyType = 'Escolha o tipo da chave Pix.';
  else {
    pixKey = normalizePixKey(pixKeyType, input.pixKey || '');
    if (pixKeyType === 'cpf' && (personType !== 'pf' || pixKey !== document))
      errors.pixKey = 'A chave CPF precisa ser o mesmo CPF do titular.';
    else if (pixKeyType === 'cnpj' && (personType !== 'pj' || pixKey !== document))
      errors.pixKey = 'A chave CNPJ precisa ser o mesmo CNPJ do titular.';
    else if (pixKeyType === 'email' && !EMAIL_RE.test(pixKey)) errors.pixKey = 'E-mail inválido.';
    else if (pixKeyType === 'telefone' && !/^\+55\d{10,11}$/.test(pixKey)) errors.pixKey = 'Celular inválido. Use DDD + número.';
    else if (pixKeyType === 'aleatoria' && !UUID_RE.test(pixKey))
      errors.pixKey = 'Chave aleatória inválida (formato 0000aaaa-0000-0000-0000-000000000000).';
  }

  // Conta bancária: opcional, mas se começar, precisa estar completa
  const bankCode = onlyDigits(input.bankCode || '');
  const agency = onlyDigits(input.agency || '');
  const accountNumber = (input.accountNumber || '').toUpperCase().replace(/[^0-9X-]/g, '');
  const accountType = input.accountType || null;
  const anyBank = Boolean(bankCode || agency || accountNumber);
  if (anyBank) {
    if (!/^\d{3}$/.test(bankCode)) errors.bankCode = 'Escolha o banco.';
    if (!/^\d{1,5}$/.test(agency)) errors.agency = 'Agência sem o dígito, só números.';
    if (!/^\d{1,13}-?[0-9X]?$/.test(accountNumber)) errors.accountNumber = 'Conta com dígito, ex.: 12345-6.';
    if (!accountType || !['corrente', 'poupanca', 'pagamento'].includes(accountType)) errors.accountType = 'Escolha o tipo de conta.';
  }

  if (Object.keys(errors).length) return { errors } as const;
  return {
    value: {
      person_type: personType!,
      holder_name: holderName,
      document,
      birth_date: birthDate,
      phone,
      pix_key_type: pixKeyType!,
      pix_key: pixKey,
      bank_code: anyBank ? bankCode : null,
      bank_name: anyBank ? (input.bankName || '').trim().slice(0, 80) || null : null,
      agency: anyBank ? agency : null,
      account_number: anyBank ? accountNumber : null,
      account_type: anyBank ? accountType : null,
    },
  } as const;
}

export type PayoutAccountRow = NonNullable<ReturnType<typeof validatePayoutAccount>['value']> & {
  photographer_id: string;
  status: 'em_analise' | 'aprovada' | 'recusada';
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Campos que, se mudarem, exigem nova análise */
const SENSITIVE: (keyof PayoutAccountRow)[] = [
  'person_type', 'holder_name', 'document', 'pix_key_type', 'pix_key', 'bank_code', 'agency', 'account_number',
];
export function needsReview(prev: Partial<PayoutAccountRow> | null, next: Partial<PayoutAccountRow>) {
  if (!prev) return true;
  if (prev.status !== 'aprovada') return true;
  return SENSITIVE.some((k) => (prev[k] ?? null) !== (next[k] ?? null));
}

// ---------------------------------------------------------------------------
// Máscaras (o que o fotógrafo vê depois de salvar)
// ---------------------------------------------------------------------------

export function maskDocument(doc: string) {
  if (doc.length === 11) return `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**`;
  return `${doc.slice(0, 2)}.***.***/${doc.slice(8, 12)}-**`;
}
export function maskPixKey(type: string, key: string) {
  if (type === 'cpf' || type === 'cnpj') return maskDocument(key);
  if (type === 'email') {
    const [u, d] = key.split('@');
    return `${u.slice(0, 2)}***@${d}`;
  }
  if (type === 'telefone') return `(${key.slice(3, 5)}) *****-${key.slice(-4)}`;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
const maskTail = (s: string | null, keep = 3) => (s ? `${'*'.repeat(Math.max(0, s.length - keep))}${s.slice(-keep)}` : null);

export function publicAccount(row: PayoutAccountRow) {
  return {
    personType: row.person_type,
    holderName: row.holder_name,
    documentMasked: maskDocument(row.document),
    pixKeyType: row.pix_key_type,
    pixKeyMasked: maskPixKey(row.pix_key_type, row.pix_key),
    bank: row.bank_code
      ? {
          code: row.bank_code,
          name: row.bank_name,
          agency: row.agency,
          accountMasked: maskTail(row.account_number),
          accountType: row.account_type,
        }
      : null,
    status: row.status,
    reviewNote: row.review_note,
    updatedAt: row.updated_at,
  };
}

export async function getPayoutAccount(photographerId: string) {
  const { data } = await db.from('payout_accounts').select('*').eq('photographer_id', photographerId).maybeSingle();
  return (data as PayoutAccountRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

export function registerPayoutAccountRoutes(app: Express) {
  // Fotógrafo: ver a própria conta (mascarada)
  app.get('/api/me/payout-account', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
    const row = await getPayoutAccount(req.user!.id);
    res.json({
      account: row ? publicAccount(row) : null,
      suggestions: row ? null : { holderName: req.user!.profile.full_name || '', phone: req.user!.profile.phone || '', pixKey: req.user!.profile.pix_key || '' },
    });
  });

  // Fotógrafo: cadastrar ou alterar
  app.put('/api/me/payout-account', requireUser, requirePhotographer, async (req: AuthedRequest, res) => {
    if (req.body?.declaration !== true) {
      return res.status(400).json({ error: 'Confirme que os dados são seus e estão corretos.' });
    }
    const result = validatePayoutAccount(req.body || {});
    if ('errors' in result && result.errors) {
      return res.status(400).json({ error: 'Confira os campos destacados.', fields: result.errors });
    }
    const value = result.value!;
    const uid = req.user!.id;

    // Um mesmo CPF/CNPJ não pode receber por duas contas de fotógrafo
    const { data: dup } = await db
      .from('payout_accounts')
      .select('photographer_id')
      .eq('document', value.document)
      .neq('photographer_id', uid)
      .limit(1);
    if (dup && dup.length) {
      return res.status(409).json({ error: 'Este CPF/CNPJ já está ligado a outra conta de fotógrafo. Fale com o suporte.', fields: { document: 'Já cadastrado em outra conta.' } });
    }

    const prev = await getPayoutAccount(uid);
    const review = needsReview(prev, value);
    const now = new Date().toISOString();
    const row = {
      photographer_id: uid,
      ...value,
      status: review ? 'em_analise' : prev!.status,
      review_note: review ? null : prev!.review_note,
      reviewed_at: review ? null : prev!.reviewed_at,
      updated_at: now,
      ...(prev ? {} : { created_at: now }),
    };
    const { data, error } = await db.from('payout_accounts').upsert(row).select('*').single();
    if (error) {
      console.error('[conta de recebimento]', error.message);
      return res.status(500).json({ error: 'Não foi possível salvar agora. Tente de novo.' });
    }
    // Mantém a chave Pix do perfil em dia (usada como sugestão em outras telas)
    await db.from('profiles').update({ pix_key: value.pix_key }).eq('id', uid);

    res.json({
      account: publicAccount(data as PayoutAccountRow),
      message: review
        ? 'Dados recebidos! Vamos conferir e liberar seus saques em breve. Você já pode continuar enviando e vendendo fotos.'
        : 'Dados atualizados.',
    });
  });

  // Admin: contas para analisar (dados completos — só o administrador vê)
  app.get('/api/admin/payout-accounts', requireUser, requireAdmin, async (_req, res) => {
    const { data, error } = await db
      .from('payout_accounts')
      .select('*, profiles!payout_accounts_photographer_id_fkey(full_name)')
      .eq('status', 'em_analise')
      .order('updated_at', { ascending: true });
    if (error) return res.status(500).json({ error: 'Não foi possível carregar as contas.' });
    res.json({
      accounts: (data || []).map((r: any) => ({
        photographerId: r.photographer_id,
        photographerName: r.profiles?.full_name || '—',
        personType: r.person_type,
        holderName: r.holder_name,
        document: r.document,
        birthDate: r.birth_date,
        phone: r.phone,
        pixKeyType: r.pix_key_type,
        pixKey: r.pix_key,
        bank: r.bank_code ? `${r.bank_code} ${r.bank_name || ''} · ag. ${r.agency} · conta ${r.account_number} (${r.account_type})` : null,
        updatedAt: r.updated_at,
      })),
    });
  });

  app.post('/api/admin/payout-accounts/:id/:decision', requireUser, requireAdmin, async (req, res) => {
    const decision = req.params.decision;
    if (decision !== 'approve' && decision !== 'reject') return res.status(404).json({ error: 'Ação inválida.' });
    const note = String(req.body?.note || '').trim().slice(0, 300);
    if (decision === 'reject' && !note) return res.status(400).json({ error: 'Escreva o motivo para o fotógrafo corrigir.' });
    const { error } = await db
      .from('payout_accounts')
      .update({
        status: decision === 'approve' ? 'aprovada' : 'recusada',
        review_note: decision === 'approve' ? null : note,
        reviewed_at: new Date().toISOString(),
      })
      .eq('photographer_id', req.params.id);
    if (error) return res.status(500).json({ error: 'Não foi possível salvar a decisão.' });
    res.json({ ok: true });
  });

  // Admin: saques a pagar (enquanto o Pix automático não chega)
  app.get('/api/admin/payouts', requireUser, requireAdmin, async (_req, res) => {
    const { data, error } = await db
      .from('payouts')
      .select('id, amount, pix_key, created_at, photographer_id, profiles!payouts_photographer_id_fkey(full_name)')
      .eq('status', 'solicitado')
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: 'Não foi possível carregar os saques.' });
    const ids = [...new Set((data || []).map((p: any) => p.photographer_id))];
    const { data: accounts } = ids.length
      ? await db.from('payout_accounts').select('photographer_id, holder_name, document, pix_key_type').in('photographer_id', ids)
      : { data: [] as any[] };
    const acc = new Map((accounts || []).map((a: any) => [a.photographer_id, a]));
    res.json({
      payouts: (data || []).map((p: any) => ({
        id: p.id,
        amount: Number(p.amount),
        pixKey: p.pix_key,
        pixKeyType: acc.get(p.photographer_id)?.pix_key_type || null,
        holderName: acc.get(p.photographer_id)?.holder_name || p.profiles?.full_name || '—',
        document: acc.get(p.photographer_id)?.document || null,
        createdAt: p.created_at,
      })),
    });
  });

  app.post('/api/admin/payouts/:id/paid', requireUser, requireAdmin, async (req, res) => {
    const { data, error } = await db
      .from('payouts')
      .update({ status: 'pago', paid_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('status', 'solicitado')
      .select('id');
    if (error || !data?.length) return res.status(400).json({ error: 'Saque não encontrado ou já pago.' });
    res.json({ ok: true });
  });
}
