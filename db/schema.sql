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

-- Copia de seguridad en Dropbox: un refresh_token por usuario (cada persona
-- conecta su propio Dropbox, carpeta dedicada de la app — "App folder" — así
-- Hakufu solo ve su propia carpeta, nunca el resto del Dropbox del usuario).
-- Los access tokens nunca se guardan, se piden a Dropbox al vuelo a partir
-- del refresh_token (ver /api/dropbox/token).
create table if not exists dropbox_connections (
  username           text primary key references users(username) on delete cascade,
  refresh_token      text not null,
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Vale de un solo uso, de corta duración, para enlazar el flujo OAuth (que corre en
-- el navegador del sistema) con la sesión ya autenticada de la app de escritorio,
-- sin poner el JWT real de 30 días en una URL.
create table if not exists link_codes (
  code         text primary key,
  username     text not null references users(username) on delete cascade,
  expires_at   timestamptz not null
);

create index if not exists idx_link_codes_expires on link_codes(expires_at);
