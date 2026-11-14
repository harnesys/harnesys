create table if not exists webhooks (
  instance_id text primary key,
  config text not null,
  status text not null default 'active',
  last_fired_at text,
  fires integer not null default 0,
  updated_at text not null
);
