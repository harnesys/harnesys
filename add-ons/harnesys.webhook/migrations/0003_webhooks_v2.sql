alter table webhooks add column token text;
alter table webhooks add column last_error text not null default '';
create unique index if not exists webhooks_token on webhooks (token) where token is not null;
create table if not exists deliveries (
  id text primary key,
  instance_id text not null,
  source text not null default 'hook',
  method text not null,
  received_at text not null,
  outcome text not null,
  http_status integer not null,
  run_id text,
  summary text not null default '',
  error text not null default '',
  latency_ms integer not null default 0
);
create index if not exists deliveries_instance on deliveries (instance_id, received_at);
create table if not exists dedup (
  key text primary key,
  instance_id text not null,
  outcome text not null,
  created_ms integer not null
);
create index if not exists dedup_time on dedup (created_ms);
