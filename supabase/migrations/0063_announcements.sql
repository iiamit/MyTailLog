-- Short, dismissible release notices shared by the website and mobile apps.
create table announcement (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 500),
  link_path text check (link_path is null or (link_path ~ '^/[^/]' and length(link_path) <= 300)),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table announcement_dismissal (
  announcement_id uuid not null references announcement(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index announcement_published_idx on announcement (published_at desc);

alter table announcement enable row level security;
alter table announcement_dismissal enable row level security;

create policy announcement_read on announcement for select to authenticated
  using (published_at <= now() and (expires_at is null or expires_at > now()));

create policy announcement_dismissal_read on announcement_dismissal for select to authenticated
  using (user_id = auth.uid());
create policy announcement_dismissal_add on announcement_dismissal for insert to authenticated
  with check (user_id = auth.uid());
