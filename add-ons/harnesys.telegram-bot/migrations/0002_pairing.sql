create table if not exists pairings (
  chat_id text primary key,
  user_id text not null,
  status text not null,
  code_hash text,
  expires_at text,
  updated_at text not null
);
