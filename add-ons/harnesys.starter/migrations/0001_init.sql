create table items (
  id integer primary key,
  text text not null,
  created_at text not null
);

create table heartbeat (
  at text primary key
);

create table hook_log (
  id integer primary key,
  at text not null,
  event text not null
);

create table tool_calls (
  id integer primary key,
  name text not null,
  at text not null
);

create table trigger_starts (
  instance_id text primary key,
  run_key text not null,
  at text not null
);

create table trigger_fired (
  run_key text primary key,
  at text not null
);
