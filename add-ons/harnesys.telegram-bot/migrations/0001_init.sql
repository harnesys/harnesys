create table if not exists bot_state (
  key text primary key,
  value text not null
);
create table if not exists chats (
  channel text primary key,
  chat_id text not null,
  kind text not null,
  title text not null,
  topic_id text,
  updated_at text not null
);
create table if not exists inbound_seen (
  update_id integer primary key,
  at text not null
);
