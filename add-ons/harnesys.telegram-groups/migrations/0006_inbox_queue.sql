create table if not exists inbox_queue (
  id integer primary key autoincrement,
  channel text not null,
  message_id integer not null,
  payload text not null,
  at integer not null,
  unique(channel, message_id)
);
create index if not exists inbox_queue_channel_idx on inbox_queue(channel, id);
create table if not exists inbox_state (
  channel text primary key,
  reply_message_id integer,
  reply_at integer,
  omitted integer not null default 0
);