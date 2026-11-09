-- BrightMinds on Supabase: schema, access rules and helpers.
-- Mirrors the Base44 entities Opportunity, Favorite, Notification, Review, SupportTicket, Translation and the User fields.
-- Ids stay text so the existing 24-character Base44 ids can be imported unchanged.
-- Not run against a live database by the author. Test on a new, empty Supabase project first.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.new_id() returns text
language sql as $$ select replace(gen_random_uuid()::text, '-', '') $$;

-- ---------------------------------------------------------------- profiles (the User entity)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_id text unique,                       -- old Base44 user id, used to re-link old records
  email text,
  role text not null default 'user' check (role in ('admin', 'user')),
  full_name text,
  first_name text,
  last_name text,
  gender text check (gender in ('male', 'female')),
  city text,
  region text,
  country text,
  age_range text,
  grade numeric,
  preferred_language text,
  educational_interests text[] not null default '{}',
  read_notification_ids text[] not null default '{}',
  email_alerts boolean not null default true,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- A signed-in student can never change their own role, email or legacy id.
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.email := old.email;
    new.legacy_id := old.legacy_id;
  end if;
  new.id := old.id;
  new.updated_date := now();
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();

alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------- shared row metadata
-- Clients can never choose the owner. Service-role imports (auth.uid() is null) may set it.
create or replace function public.set_row_meta() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by_id := auth.uid()::text; end if;
    new.created_date := coalesce(new.created_date, now());
    new.updated_date := coalesce(new.updated_date, now());
  else
    if auth.uid() is not null then
      new.id := old.id;
      new.created_by_id := old.created_by_id;
      new.created_date := old.created_date;
    end if;
    new.updated_date := now();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- opportunity
-- Searchable text columns are NOT NULL DEFAULT '' on purpose: a NULL would make a NOT(...) filter
-- return NULL and silently drop the row, which the Mongo-style search in the app does not do.
create table if not exists public.opportunity (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  is_sample boolean not null default false,
  title text not null default '',
  organization text not null default '',
  category text not null check (category in ('course', 'scholarship', 'volunteering', 'competition', 'forum')),
  subject text not null default '',
  tags text[] not null default '{}',
  tags_text text not null default '',
  language text not null default '',
  cost_note text not null default '',
  verification text not null default 'unverified' check (verification in ('verified', 'unverified')),
  min_age numeric,
  format text not null default '' check (format in ('', 'online', 'onsite', 'hybrid')),
  description text not null default '',
  link text not null,
  country text not null default '',
  -- Added for school-student eligibility (all optional; empty means "not confirmed")
  max_age numeric,
  grade_min numeric,
  grade_max numeric,
  eligible_countries text[] not null default '{}',
  education_level text check (education_level in ('school', 'undergraduate', 'graduate', 'any')),
  deadline date,
  funding_type text check (funding_type in ('full', 'partial', 'stipend', 'fee_waiver', 'none', 'unknown')),
  last_verified date
);

create or replace function public.set_tags_text() returns trigger
language plpgsql as $$
begin
  new.tags_text := coalesce(array_to_string(new.tags, ' '), '');
  return new;
end $$;

drop trigger if exists opportunity_meta on public.opportunity;
create trigger opportunity_meta before insert or update on public.opportunity
  for each row execute function public.set_row_meta();
drop trigger if exists opportunity_tags on public.opportunity;
create trigger opportunity_tags before insert or update on public.opportunity
  for each row execute function public.set_tags_text();

create index if not exists opportunity_category_idx on public.opportunity (category);
create index if not exists opportunity_country_idx on public.opportunity (country);
create index if not exists opportunity_min_age_idx on public.opportunity (min_age);
create index if not exists opportunity_created_idx on public.opportunity (created_date desc);
create index if not exists opportunity_title_trgm on public.opportunity using gin (title gin_trgm_ops);
create index if not exists opportunity_org_trgm on public.opportunity using gin (organization gin_trgm_ops);
create index if not exists opportunity_desc_trgm on public.opportunity using gin (description gin_trgm_ops);

alter table public.opportunity enable row level security;
drop policy if exists opportunity_read on public.opportunity;
create policy opportunity_read on public.opportunity for select using (true);
drop policy if exists opportunity_write on public.opportunity;
create policy opportunity_write on public.opportunity for all
  using (public.is_admin()) with check (public.is_admin());

-- Counts per country or category for the map and the homepage counters.
create or replace function public.opportunity_group_counts(field text)
returns table (value text, count bigint)
language plpgsql stable as $$
begin
  if field not in ('country', 'category') then raise exception 'unsupported field %', field; end if;
  return query execute format('select %I::text, count(*) from public.opportunity group by 1', field);
end $$;

-- ---------------------------------------------------------------- favorite
create table if not exists public.favorite (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  is_sample boolean not null default false,
  opportunity_id text not null,
  title text not null,
  organization text,
  category text,
  format text,
  min_age numeric,
  link text,
  user_email text
);
drop trigger if exists favorite_meta on public.favorite;
create trigger favorite_meta before insert or update on public.favorite
  for each row execute function public.set_row_meta();
-- One save per student and program (the app also checks this before inserting).
create unique index if not exists favorite_owner_program on public.favorite (created_by_id, opportunity_id);

alter table public.favorite enable row level security;
drop policy if exists favorite_owner on public.favorite;
create policy favorite_owner on public.favorite for all
  using (created_by_id = auth.uid()::text)
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------- notification
create table if not exists public.notification (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  is_sample boolean not null default false,
  title text not null,
  message text not null,
  type text not null default 'update' check (type in ('deadline', 'update', 'reminder')),
  audience text not null default 'all' check (audience in ('all', 'personal')),
  link text
);
drop trigger if exists notification_meta on public.notification;
create trigger notification_meta before insert or update on public.notification
  for each row execute function public.set_row_meta();

alter table public.notification enable row level security;
drop policy if exists notification_read on public.notification;
create policy notification_read on public.notification for select
  using (audience = 'all' or created_by_id = auth.uid()::text or public.is_admin());
drop policy if exists notification_write on public.notification;
create policy notification_write on public.notification for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- review
create table if not exists public.review (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  is_sample boolean not null default false,
  author_name text not null,
  achievement text,
  message text not null,
  rating numeric not null default 5 check (rating between 1 and 5),
  program text,
  how_applied text,
  tips text,
  photo_url text
);
drop trigger if exists review_meta on public.review;
create trigger review_meta before insert or update on public.review
  for each row execute function public.set_row_meta();

alter table public.review enable row level security;
drop policy if exists review_read on public.review;
create policy review_read on public.review for select using (true);
drop policy if exists review_insert on public.review;
create policy review_insert on public.review for insert with check (auth.uid() is not null);
drop policy if exists review_update on public.review;
create policy review_update on public.review for update
  using (created_by_id = auth.uid()::text or public.is_admin())
  with check (created_by_id = auth.uid()::text or public.is_admin());
drop policy if exists review_delete on public.review;
create policy review_delete on public.review for delete
  using (created_by_id = auth.uid()::text or public.is_admin());

-- ---------------------------------------------------------------- support_ticket
create table if not exists public.support_ticket (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  is_sample boolean not null default false,
  subject text not null,
  message text not null,
  transcript text,
  language text,
  student_email text,
  student_name text,
  persona text,
  request_id text,
  email_delivery text not null default 'not_attempted' check (email_delivery in ('not_attempted', 'accepted', 'unavailable')),
  status text not null default 'open' check (status in ('open', 'answered', 'closed'))
);
drop trigger if exists support_ticket_meta on public.support_ticket;
create trigger support_ticket_meta before insert or update on public.support_ticket
  for each row execute function public.set_row_meta();
-- A retried request can no longer create a second ticket.
create unique index if not exists support_ticket_request on public.support_ticket (created_by_id, request_id)
  where request_id is not null;

alter table public.support_ticket enable row level security;
drop policy if exists ticket_read on public.support_ticket;
create policy ticket_read on public.support_ticket for select
  using (created_by_id = auth.uid()::text or public.is_admin());
drop policy if exists ticket_insert on public.support_ticket;
create policy ticket_insert on public.support_ticket for insert with check (auth.uid() is not null);
drop policy if exists ticket_update on public.support_ticket;
create policy ticket_update on public.support_ticket for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists ticket_delete on public.support_ticket;
create policy ticket_delete on public.support_ticket for delete using (public.is_admin());

-- ---------------------------------------------------------------- translation cache
create table if not exists public.translation (
  id text primary key default public.new_id(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id text,
  is_sample boolean not null default false,
  lang text not null,
  source_hash text not null,
  source_text text,
  translated_text text not null,
  unique (lang, source_hash)
);
drop trigger if exists translation_meta on public.translation;
create trigger translation_meta before insert or update on public.translation
  for each row execute function public.set_row_meta();

alter table public.translation enable row level security;
revoke all on public.translation from anon, authenticated;
drop policy if exists translation_admin on public.translation;
create policy translation_admin on public.translation for all
  using (public.is_admin()) with check (public.is_admin());
-- The Cloudflare Worker reads and writes this table with the service role key (bypasses RLS).

-- ---------------------------------------------------------------- re-linking old Base44 users
-- After a student registers again, run (service role only):  select public.link_legacy_user('<old base44 id>', '<new auth uuid>');
create or replace function public.link_legacy_user(p_legacy text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.favorite set created_by_id = p_user::text where created_by_id = p_legacy;
  update public.review set created_by_id = p_user::text where created_by_id = p_legacy;
  update public.support_ticket set created_by_id = p_user::text where created_by_id = p_legacy;
  update public.notification set created_by_id = p_user::text where created_by_id = p_legacy;
  update public.profiles set legacy_id = p_legacy where id = p_user;
end $$;
revoke all on function public.link_legacy_user(text, uuid) from public, anon, authenticated;
grant execute on function public.link_legacy_user(text, uuid) to service_role;

-- ---------------------------------------------------------------- realtime for catalog counters
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.opportunity;
  end if;
exception when duplicate_object then null;
end $$;
