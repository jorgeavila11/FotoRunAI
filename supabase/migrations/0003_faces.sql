-- =====================================================================
-- FotoRun AI — Passo 4: reconhecimento facial com "impressões digitais" (YuNet + SFace)
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

-- 1. Extensão de busca por similaridade de vetores (pgvector)
create extension if not exists vector with schema extensions;

-- 2. Um registro por ROSTO encontrado em cada foto
create table if not exists public.photo_faces (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.photos (id) on delete cascade,
  event_id    text not null references public.events (id) on delete cascade,
  embedding   extensions.vector(128) not null,   -- impressão digital do rosto (SFace)
  box         jsonb not null,                    -- posição do rosto na foto, em % {top,left,width,height}
  face_px     int not null,                      -- tamanho do rosto em pixels (rostos pequenos são menos confiáveis)
  det_score   real not null,                     -- confiança da detecção (YuNet)
  created_at  timestamptz not null default now()
);

create index if not exists photo_faces_event_idx on public.photo_faces (event_id);
create index if not exists photo_faces_photo_idx on public.photo_faces (photo_id);

-- Marca quais fotos já passaram pela análise facial (para a reindexação)
alter table public.photos add column if not exists faces_indexed_at timestamptz;
alter table public.photos add column if not exists faces_count int not null default 0;

-- Só o servidor acessa (impressões faciais são dado biométrico — LGPD)
alter table public.photo_faces enable row level security;

-- 3. Busca: devolve as fotos com algum rosto parecido com a selfie
--    Rostos pequenos (< small_face_px) precisam de semelhança maior (small_face_extra a mais).
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
    where (p_event_id is null or f.event_id = p_event_id)
      and 1 - (f.embedding <=> query_embedding) >=
          match_threshold + case when f.face_px < small_face_px then small_face_extra else 0 end
    order by f.photo_id, f.embedding <=> query_embedding
  ) best
  order by similarity desc
  limit match_count;
$$;

-- Função de busca só pode ser chamada pelo servidor
revoke execute on function public.match_photo_faces(extensions.vector, text, float, int, float, int) from public, anon, authenticated;
