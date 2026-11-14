create table if not exists sources (
  peer text primary key,
  title text not null,
  added_at text not null
);
create table if not exists source_watermark (
  peer text primary key,
  last_post_id integer not null,
  updated_at text not null
);
create table if not exists posts (
  peer text not null,
  post_id integer not null,
  text text not null,
  published_at text not null,
  received_at text not null,
  fires integer not null default 0,
  primary key (peer, post_id)
);
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
