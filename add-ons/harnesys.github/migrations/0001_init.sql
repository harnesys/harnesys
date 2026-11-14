create table if not exists instances (
  instance_id text primary key,
  config text not null,
  started_at text not null
);
create table if not exists watermarks (
  instance_id text not null,
  stream text not null,
  watermark text not null,
  updated_at text not null,
  primary key (instance_id, stream)
);
create table if not exists etags (
  instance_id text not null,
  stream text not null,
  etag text not null,
  updated_at text not null,
  primary key (instance_id, stream)
);
create table if not exists fired (
  run_key text primary key,
  instance_id text not null,
  at text not null
);
