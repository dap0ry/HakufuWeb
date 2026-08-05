-- Hakufu — esquema Postgres (Neon)
-- Puerto directo de las colecciones Mongo de HakufuAPI: users, user_libraries, friendships.

create extension if not exists pgcrypto;

create table if not exists users (
  username           text primary key,
  email              text unique not null,
  password_hash      text not null,
  is_profile_public  boolean not null default true,
  bio                text not null default '',
  avatar_url         text not null default '',
  created_at         timestamptz not null default now(),
  last_seen          timestamptz not null default now()
);

create table if not exists user_libraries (
  username             text primary key references users(username) on delete cascade,
  mangas               jsonb not null default '[]',
  collections          jsonb not null default '[]',
  reading_progress     jsonb not null default '[]',
  reading_history      jsonb not null default '[]',
  total_usage_seconds  bigint not null default 0,
  updated_at           timestamptz not null default now()
);

create table if not exists friendships (
  id           uuid primary key default gen_random_uuid(),
  requester    text not null references users(username) on delete cascade,
  recipient    text not null references users(username) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  unique (requester, recipient)
);

create index if not exists idx_friendships_recipient on friendships(recipient, status);
create index if not exists idx_friendships_requester  on friendships(requester, status);
