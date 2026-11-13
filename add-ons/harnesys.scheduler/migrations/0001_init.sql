create table if not exists instances (
  instance_id text primary key,
  config text not null,
  target text not null,
  started_at text not null
);
create table if not exists schedule_state (
  instance_id text primary key,
  cron text not null,
  status text not null default 'active',
  next_run_at text,
  last_fired_at text,
  error text,
  updated_at text not null
);
