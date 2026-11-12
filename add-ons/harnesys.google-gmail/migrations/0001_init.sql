create table if not exists instances (
  instance_id text primary key,
  config text not null,
  started_at text not null
);
create table if not exists fired (
  run_key text primary key,
  instance_id text not null,
  at text not null
);
create table if not exists history_watermark (
  account_id text primary key,
  history_id text not null,
  last_seen_at text not null,
  updated_at text not null
);
