create extension if not exists pgcrypto;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_provider text not null default 'google',
  preferred_model text not null default 'gemini-2.5-flash-lite',
  daily_application_goal integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, document_key)
);

create table if not exists public.user_provider_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  encrypted_key text not null,
  key_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table if not exists public.user_templates (
  user_id uuid not null references auth.users(id) on delete cascade,
  template_type text not null,
  template_name text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, template_type, template_name)
);

create table if not exists public.application_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  applied_on date not null,
  filename text not null,
  has_cover_letter boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, filename)
);

create table if not exists public.generation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_base_name text not null,
  template_name text,
  jd text,
  cover_letter_file text,
  cover_letter_content text,
  tex_content text,
  pdf_blob_path text,
  pdf_blob_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, artifact_base_name)
);

alter table public.generation_history
add column if not exists cover_letter_content text;

alter table public.generation_history
add column if not exists tex_content text;

alter table public.generation_history
add column if not exists pdf_blob_path text;

alter table public.generation_history
add column if not exists pdf_blob_url text;

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'generate',
  artifact_base_name text not null,
  tex_file_name text not null,
  pdf_file_name text not null,
  status text not null default 'queued',
  worker_id text,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  repaired boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists generation_jobs_user_status_idx
on public.generation_jobs (user_id, status, created_at desc);

create index if not exists generation_jobs_status_created_idx
on public.generation_jobs (status, created_at asc);

alter table public.user_settings enable row level security;
alter table public.user_documents enable row level security;
alter table public.user_provider_keys enable row level security;
alter table public.user_templates enable row level security;
alter table public.application_records enable row level security;
alter table public.generation_history enable row level security;
alter table public.generation_jobs enable row level security;

create policy "user_settings_owner_all"
on public.user_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_documents_owner_all"
on public.user_documents
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_provider_keys_owner_all"
on public.user_provider_keys
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_templates_owner_all"
on public.user_templates
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "application_records_owner_all"
on public.application_records
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "generation_history_owner_all"
on public.generation_history
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "generation_jobs_owner_all"
on public.generation_jobs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
