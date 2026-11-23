-- =====================================================================
-- 0008 — Painel de administração da plataforma
-- Rode no SQL Editor do Supabase DEPOIS da 0007.
--
-- 1) Desativar evento: some da vitrine, da busca e não aceita envio nem
--    compra. Quem já comprou continua baixando as fotos.
-- 2) Suspender conta: a pessoa não consegue mais usar o site e, se for
--    fotógrafo, as fotos dele saem da vitrine (nada é apagado).
-- =====================================================================

alter table public.events
  add column if not exists disabled_at     timestamptz,
  add column if not exists disabled_reason text;

alter table public.profiles
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text;

create index if not exists events_active_idx on public.events (event_date desc) where disabled_at is null;
create index if not exists profiles_suspended_idx on public.profiles (id) where suspended_at is not null;
create index if not exists orders_paid_idx on public.orders (paid_at) where status = 'pago';
