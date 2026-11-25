-- =====================================================================
-- 0009 — Link de divulgação do fotógrafo
-- Rode no SQL Editor do Supabase DEPOIS da 0008.
--
-- Cada fotógrafo ganha um apelido público (ex.: "ana-ribeiro") usado no
-- link de divulgação: .../?evento=sobral-2026&f=ana-ribeiro
-- Quando o atleta compra depois de chegar por esse link, o pedido guarda
-- quem indicou (referred_by).
-- =====================================================================

alter table public.profiles
  add column if not exists public_slug text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_public_slug_format') then
    alter table public.profiles
      add constraint profiles_public_slug_format check (public_slug is null or public_slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$');
  end if;
end $$;

create unique index if not exists profiles_public_slug_key on public.profiles (public_slug) where public_slug is not null;

alter table public.orders
  add column if not exists referred_by uuid references public.profiles (id) on delete set null;

create index if not exists orders_referred_by_idx on public.orders (referred_by) where referred_by is not null;
