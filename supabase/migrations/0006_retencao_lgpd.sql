-- =====================================================================
-- FotoRun AI — Prazos de guarda (LGPD) e "Remover minhas fotos"
--   * Prazos por evento: impressões faciais e fotos não vendidas
--   * Validade do download das fotos compradas
--   * Fotos ocultadas a pedido do titular e fotos expurgadas (arquivos apagados)
--   * Pedidos de remoção feitos pelos atletas
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

-- 1. Prazos por evento (contados a partir da data do evento)
alter table public.events add column if not exists faces_retention_months int not null default 6
  check (faces_retention_months between 1 and 36);
alter table public.events add column if not exists photos_retention_months int not null default 12
  check (photos_retention_months between 1 and 60);

-- 2. Estado das fotos
--    hidden_at: oculta da vitrine e da busca (ex.: pedido do titular) — reversível
--    purged_at: arquivos e impressões faciais apagados — o registro fica só para o histórico de vendas
alter table public.photos add column if not exists hidden_at timestamptz;
alter table public.photos add column if not exists hidden_reason text;
alter table public.photos add column if not exists purged_at timestamptz;
create index if not exists photos_visible_idx on public.photos (event_id) where hidden_at is null and purged_at is null;

-- 3. Validade do download de cada pedido
alter table public.orders add column if not exists download_expires_at timestamptz;
update public.orders
   set download_expires_at = coalesce(paid_at, created_at) + interval '12 months'
 where download_expires_at is null;

-- 4. Pedidos de remoção feitos pelo titular ("Remover minhas fotos")
create table if not exists public.removal_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  photo_ids    uuid[] not null default '{}',     -- fotos encontradas e ocultadas na hora
  status       text not null default 'pendente' check (status in ('pendente', 'confirmado', 'restaurado')),
  admin_note   text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists removal_requests_status_idx on public.removal_requests (status, created_at desc);
alter table public.removal_requests enable row level security;   -- só o servidor acessa

-- 5. Busca facial passa a ignorar fotos ocultas ou expurgadas
create or replace function public.match_photo_faces(
  query_embedding  extensions.vector(128),
  p_event_id       text,
  match_threshold  float default 0.36,
  small_face_px    int   default 64,
  small_face_extra float default 0.09,
  match_count      int   default 300
)
returns table (photo_id uuid, similarity float, box jsonb, face_px int)
language sql
stable
set search_path = public, extensions
as $$
  select photo_id, similarity, box, face_px
  from (
    select distinct on (f.photo_id)
      f.photo_id,
      1 - (f.embedding <=> query_embedding) as similarity,
      f.box,
      f.face_px
    from public.photo_faces f
    join public.photos p on p.id = f.photo_id
    where (p_event_id is null or f.event_id = p_event_id)
      and p.hidden_at is null
      and p.purged_at is null
      and 1 - (f.embedding <=> query_embedding) >=
          match_threshold + case when f.face_px < small_face_px then small_face_extra else 0 end
    order by f.photo_id, f.embedding <=> query_embedding
  ) best
  order by similarity desc
  limit match_count;
$$;

revoke execute on function public.match_photo_faces(extensions.vector, text, float, int, float, int) from public, anon, authenticated;
