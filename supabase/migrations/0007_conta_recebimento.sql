-- =====================================================================
-- 0007 — Conta de recebimento do fotógrafo
-- Rode no SQL Editor do Supabase DEPOIS da 0006.
--
-- Guarda os dados de quem recebe os repasses (titular, CPF/CNPJ, chave Pix
-- e, opcionalmente, conta bancária). Só o servidor lê esta tabela.
-- Coletamos apenas o necessário para pagar (LGPD: minimização):
-- não pedimos renda, profissão nem endereço.
-- =====================================================================

create table if not exists public.payout_accounts (
  photographer_id  uuid primary key references public.profiles (id) on delete cascade,
  person_type      text not null check (person_type in ('pf', 'pj')),
  holder_name      text not null check (char_length(holder_name) between 3 and 120),
  document         text not null check (document ~ '^[0-9]{11}$|^[0-9A-Z]{12}[0-9]{2}$'),  -- CPF (11 números) ou CNPJ (14; aceita o CNPJ alfanumérico)
  birth_date       date,                                                       -- só pessoa física
  phone            text,
  pix_key_type     text not null check (pix_key_type in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  pix_key          text not null,
  bank_code        text check (bank_code is null or bank_code ~ '^[0-9]{3}$'),
  bank_name        text,
  agency           text check (agency is null or agency ~ '^[0-9]{1,5}$'),
  account_number   text check (account_number is null or account_number ~ '^[0-9]{1,13}-?[0-9Xx]?$'),
  account_type     text check (account_type is null or account_type in ('corrente', 'poupanca', 'pagamento')),
  status           text not null default 'em_analise' check (status in ('em_analise', 'aprovada', 'recusada')),
  review_note      text,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists payout_accounts_status_idx on public.payout_accounts (status);

alter table public.payout_accounts enable row level security;
-- Sem políticas: o navegador não lê nem grava aqui; tudo passa pelo servidor.
