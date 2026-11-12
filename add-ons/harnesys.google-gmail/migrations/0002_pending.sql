create table if not exists pending (
  instance_id text not null,
  message_id text not null,
  attempts integer not null default 0,
  first_seen_at text not null,
  primary key (instance_id, message_id)
);
