-- =====================================================================
-- FotoRun AI — Categorias de evento
-- Prepara o FotoRun para outros esportes e passeios, mantendo corrida de rua como padrão.
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

alter table public.events add column if not exists category text not null default 'corrida_rua';
alter table public.event_requests add column if not exists category text not null default 'corrida_rua';

-- Valores aceitos (mesma lista de src/data/categories.ts)
alter table public.events drop constraint if exists events_category_check;
alter table public.events add constraint events_category_check check (category in (
  'corrida_rua', 'trail', 'ciclismo', 'mtb', 'triatlo', 'natacao', 'caminhada', 'outros_esportes', 'turismo'
));

alter table public.event_requests drop constraint if exists event_requests_category_check;
alter table public.event_requests add constraint event_requests_category_check check (category in (
  'corrida_rua', 'trail', 'ciclismo', 'mtb', 'triatlo', 'natacao', 'caminhada', 'outros_esportes', 'turismo'
));

create index if not exists events_category_idx on public.events (category);
