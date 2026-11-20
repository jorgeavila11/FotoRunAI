-- =====================================================================
-- FotoRun AI — Painel do fotógrafo (Bloco 1)
--   * Cadastro inicial do fotógrafo (perfil, experiência, cidade, objetivos)
--   * Solicitações de evento (o fotógrafo pede, o administrador aprova)
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

-- 1. Cadastro inicial do fotógrafo
alter table public.profiles add column if not exists photographer_type text
  check (photographer_type in ('tempo_integral', 'parcial', 'hobby'));
alter table public.profiles add column if not exists experience text
  check (experience in ('menos_1', '1_3', '3_5', 'mais_5'));
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists state text;
alter table public.profiles add column if not exists goals text[] not null default '{}';
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- 2. Solicitações de evento
create table if not exists public.event_requests (
  id               uuid primary key default gen_random_uuid(),
  photographer_id  uuid not null references public.profiles (id) on delete cascade,
  title            text not null,
  event_date       date,
  city             text not null,
  state            text not null,
  location         text not null default '',
  distances        text not null default '',
  notes            text not null default '',     -- link da inscrição, organizadora etc.
  status           text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  admin_note       text,                          -- motivo da recusa / observação do admin
  event_id         text references public.events (id) on delete set null,  -- evento criado na aprovação
  created_at       timestamptz not null default now(),
  decided_at       timestamptz
);

create index if not exists event_requests_status_idx on public.event_requests (status, created_at desc);
create index if not exists event_requests_photographer_idx on public.event_requests (photographer_id);

-- Só o servidor acessa
alter table public.event_requests enable row level security;
