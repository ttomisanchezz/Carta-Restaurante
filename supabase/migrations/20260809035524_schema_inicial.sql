-- Migracion 1 — esquema base.
--
-- Multi-tenant desde el dia 1: toda tabla de contenido cuelga de restaurant_id.
-- Los precios son ENTEROS en centavos, nunca float.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.restaurants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name          text not null check (length(trim(name)) > 0),
  logo_url      text,
  primary_color text not null default '#E8562A' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  currency      text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  plan          text not null default 'basico' check (plan in ('basico', 'pedidos')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- restaurant_id va desnormalizado a proposito, aunque se pueda derivar via
-- category_id: simplifica las policies de RLS y evita un join en cada lectura publica.
--
-- category_id usa ON DELETE RESTRICT, no CASCADE: borrar una categoria con platos
-- adentro se BLOQUEA. El borrado en cascada silencioso es de donde salen los
-- "se me borro media carta y no se por que".
create table public.dishes (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  category_id       uuid not null references public.categories(id) on delete restrict,
  name              text not null check (length(trim(name)) > 0),
  description       text not null default '',
  price             integer not null check (price >= 0),
  pairing_text      text,
  video_playback_id text,
  video_status      text not null default 'pending'
                    check (video_status in ('pending', 'processing', 'ready', 'failed')),
  thumbnail_url     text,
  is_available      boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  role          text not null default 'owner' check (role in ('owner', 'staff', 'superadmin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_categories_restaurant_sort on public.categories (restaurant_id, sort_order);
create index idx_dishes_restaurant_sort     on public.dishes (restaurant_id, sort_order);
create index idx_dishes_category_sort       on public.dishes (category_id, sort_order);

-- Indice parcial: la consulta de la carta publica es exactamente esta.
create index idx_dishes_public              on public.dishes (restaurant_id)
                                            where is_available and video_status = 'ready';
create index idx_profiles_restaurant        on public.profiles (restaurant_id);

create trigger trg_restaurants_updated before update on public.restaurants
  for each row execute function public.set_updated_at();
create trigger trg_categories_updated  before update on public.categories
  for each row execute function public.set_updated_at();
create trigger trg_dishes_updated      before update on public.dishes
  for each row execute function public.set_updated_at();
create trigger trg_profiles_updated    before update on public.profiles
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
