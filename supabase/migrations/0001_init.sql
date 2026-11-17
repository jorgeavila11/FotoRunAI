-- =====================================================================
-- FotoRun AI — Esquema inicial (Passo 1: banco de dados + login)
-- Rode este arquivo inteiro no Supabase: Dashboard > SQL Editor > New query
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFIS (um por usuário do Supabase Auth)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  role               text not null default 'athlete' check (role in ('athlete', 'photographer', 'admin')),
  full_name          text not null default '',
  phone              text,
  bib_number         text,              -- atletas: número de peito habitual
  pix_key            text,              -- fotógrafos: chave Pix para repasse
  -- Configuração de venda do fotógrafo
  individual_price   numeric(10,2) not null default 14.90 check (individual_price > 0),
  watermark_text     text not null default 'FOTORUN PREVIEW',
  watermark_opacity  int  not null default 35 check (watermark_opacity between 10 and 80),
  -- LGPD: registro do aceite dos termos e da política biométrica
  terms_accepted_at  timestamptz,
  created_at         timestamptz not null default now()
);

-- Cria o perfil automaticamente quando alguém se cadastra.
-- Os dados vêm do "options.data" enviado no signUp do frontend.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted_role text := coalesce(meta->>'role', 'athlete');
begin
  if wanted_role not in ('athlete', 'photographer') then
    wanted_role := 'athlete';            -- ninguém se cadastra como admin
  end if;

  insert into public.profiles (id, role, full_name, phone, bib_number, pix_key, terms_accepted_at)
  values (
    new.id,
    wanted_role,
    coalesce(meta->>'full_name', ''),
    nullif(meta->>'phone', ''),
    nullif(meta->>'bib_number', ''),
    nullif(meta->>'pix_key', ''),
    case when (meta->>'terms_accepted')::boolean then now() else null end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. EVENTOS
-- ---------------------------------------------------------------------
create table public.events (
  id               text primary key,                  -- slug, ex: 'sobral-online-run-2026'
  title            text not null,
  event_date       date,
  city             text not null,
  state            text not null,
  location         text not null default '',
  distances        text not null default '',
  cover_image      text not null default '',
  official_agency  text not null default '',
  checkpoints      text[] not null default '{}',
  pack_price       numeric(10,2) not null default 39.90 check (pack_price > 0),
  status           text not null default 'disponivel' check (status in ('disponivel', 'em_breve')),
  owner_id         uuid references public.profiles (id) on delete set null,  -- fotógrafo/agência responsável
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. LOTES DE UPLOAD
-- ---------------------------------------------------------------------
create table public.upload_batches (
  id               uuid primary key default gen_random_uuid(),
  event_id         text not null references public.events (id) on delete cascade,
  photographer_id  uuid not null references public.profiles (id) on delete cascade,
  name             text not null,
  checkpoint       text not null default '',
  photo_count      int  not null default 0,
  faces_indexed    int  not null default 0,
  status           text not null default 'Processando' check (status in ('Processando', 'Em Revisão', 'Concluído')),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. FOTOS
--   original_path -> bucket PRIVADO 'originals' (nunca exposto sem pagamento)
--   preview_path  -> bucket PÚBLICO 'previews' (versão reduzida com marca d'água gravada)
-- ---------------------------------------------------------------------
create table public.photos (
  id               uuid primary key default gen_random_uuid(),
  event_id         text not null references public.events (id) on delete cascade,
  photographer_id  uuid not null references public.profiles (id) on delete cascade,
  batch_id         uuid references public.upload_batches (id) on delete set null,
  filename         text not null,
  original_path    text not null,
  preview_path     text not null,
  media_type       text not null default 'photo' check (media_type in ('photo', 'video')),
  bib_numbers      text[] not null default '{}',
  checkpoint       text not null default '',
  time_range       text not null default 't2' check (time_range in ('t1', 't2', 't3')),
  captured_at      timestamptz not null default now(),
  camera_spec      text not null default '',
  resolution       text not null default '',
  caption          text not null default '',
  face_descriptor  text not null default '',
  face_box         jsonb,                              -- {top,left,width,height} em %
  is_podium        boolean not null default false,
  price            numeric(10,2) not null check (price > 0),
  created_at       timestamptz not null default now()
);

create index photos_event_idx        on public.photos (event_id);
create index photos_photographer_idx on public.photos (photographer_id);
create index photos_bibs_idx         on public.photos using gin (bib_numbers);

-- ---------------------------------------------------------------------
-- 5. CUPONS
-- ---------------------------------------------------------------------
create table public.coupons (
  code         text primary key,                       -- sempre em MAIÚSCULAS
  percent_off  numeric(5,2) not null check (percent_off > 0 and percent_off <= 100),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. PEDIDOS E ITENS
--   No Passo 3 o status passará de 'pendente' para 'pago' via webhook do gateway.
-- ---------------------------------------------------------------------
create table public.orders (
  id               text primary key,                   -- ex: FR-48213
  buyer_id         uuid not null references public.profiles (id) on delete restrict,
  event_id         text not null references public.events (id) on delete restrict,
  athlete_name     text not null,
  athlete_email    text not null,
  athlete_phone    text,
  bib_number       text,
  purchase_type    text not null check (purchase_type in ('pack', 'selected', 'single')),
  payment_method   text not null check (payment_method in ('pix', 'card')),
  subtotal         numeric(10,2) not null,
  discount         numeric(10,2) not null default 0,
  total_paid       numeric(10,2) not null,
  coupon_code      text references public.coupons (code),
  status           text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado', 'estornado')),
  paid_at          timestamptz,
  created_at       timestamptz not null default now()
);

create index orders_buyer_idx on public.orders (buyer_id);

create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           text not null references public.orders (id) on delete cascade,
  photo_id           uuid not null references public.photos (id) on delete restrict,
  photographer_id    uuid not null references public.profiles (id) on delete restrict,
  amount             numeric(10,2) not null,           -- valor pago por este item (pacote é rateado)
  photographer_net   numeric(10,2) not null,           -- 85% do amount
  unique (order_id, photo_id)
);

create index order_items_photographer_idx on public.order_items (photographer_id);

-- ---------------------------------------------------------------------
-- 7. SAQUES DO FOTÓGRAFO
--   No Passo 3 serão executados pelo gateway; por enquanto ficam como 'solicitado'.
-- ---------------------------------------------------------------------
create table public.payouts (
  id               uuid primary key default gen_random_uuid(),
  photographer_id  uuid not null references public.profiles (id) on delete restrict,
  amount           numeric(10,2) not null check (amount > 0),
  pix_key          text,
  status           text not null default 'solicitado' check (status in ('solicitado', 'pago', 'falhou')),
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);

-- ---------------------------------------------------------------------
-- 8. SEGURANÇA (Row Level Security)
--   O servidor usa a chave service_role e ignora o RLS.
--   O navegador usa a chave anon e só enxerga o que as políticas abaixo permitem.
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.events         enable row level security;
alter table public.upload_batches enable row level security;
alter table public.photos         enable row level security;
alter table public.coupons        enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.payouts        enable row level security;

create policy "perfil: ler o próprio"   on public.profiles for select using (auth.uid() = id);
create policy "eventos: leitura pública" on public.events  for select using (true);
create policy "pedidos: ler os próprios" on public.orders  for select using (auth.uid() = buyer_id);
-- photos, batches, coupons, order_items e payouts: acesso somente pelo servidor.
-- (photos tem original_path, que nunca deve chegar ao navegador.)

-- ---------------------------------------------------------------------
-- 9. ARMAZENAMENTO DE ARQUIVOS
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('originals', 'originals', false, 52428800, array['image/jpeg', 'image/png', 'image/webp']),
  ('previews',  'previews',  true,  10485760, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;
-- Sem políticas em storage.objects para 'originals': só o servidor (service_role) lê/grava.
-- 'previews' é público para leitura; gravação só pelo servidor.

-- ---------------------------------------------------------------------
-- 10. DADOS INICIAIS
-- ---------------------------------------------------------------------
insert into public.events (id, title, event_date, city, state, location, distances, cover_image, official_agency, checkpoints, status) values
  ('sobral-online-run-2026', 'Sobral Online Run 2026', '2026-11-01', 'Sobral', 'CE',
   'Arco de Nossa Senhora de Fátima, Sobral - CE', '10K e 5K',
   '/media/seeded/event_sobral_arch_1794782115644.jpg', 'Seu Click Fotografia',
   array['Largada Oficial','Km 5 - Beira Rio','Km 8 - Av. Dr. Guarany','Km 10 - Arco de Fátima','Linha de Chegada','Pódio & Premiação'], 'disponivel'),
  ('maratona-do-rio-2026', 'Maratona do Rio 2026', '2026-06-14', 'Rio de Janeiro', 'RJ',
   'Aterro do Flamengo, Rio de Janeiro - RJ', '42K, 21K, 10K e 5K',
   '/media/seeded/event_rio_marathon_1794782114832.jpg', 'Brasil Sports Click',
   array['Largada Leme','Km 10 - Botafogo','Km 22 - Aterro do Flamengo','Linha de Chegada','Pódio & Premiação'], 'disponivel'),
  ('meia-floripa-2026', 'Meia de Floripa 21K', '2026-05-28', 'Florianópolis', 'SC',
   'Beira-Mar Norte, Florianópolis - SC', '21K e 10K',
   '/media/seeded/athlete_female_finish_1794782116668.jpg', 'Ilha Click Esportes',
   array['Largada Ponte','Km 10 - Beira-Mar','Linha de Chegada','Pódio & Premiação'], 'disponivel'),
  ('maratona-sp-2026', 'Maratona Internacional de SP', '2026-04-05', 'São Paulo', 'SP',
   'Parque Ibirapuera, São Paulo - SP', '42K e 21K',
   '/media/seeded/athlete_hydration_sprint_1794782117095.jpg', 'Paulista Sport Photo',
   array['Largada Ibirapuera','Km 15 - Hidratação','Km 30 - Pinheiros','Linha de Chegada'], 'disponivel')
on conflict (id) do nothing;

insert into public.coupons (code, percent_off) values
  ('ATLETA10', 10),
  ('SOBRALCORRE', 10)
on conflict (code) do nothing;
