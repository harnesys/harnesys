create table if not exists bot_state (
  key text primary key,
  value text not null
);
create table if not exists chats (
  chat_id text primary key,
  kind text not null,
  title text not null,
  title_override text,
  status text not null,
  updated_at text not null
);
create table if not exists inbound_seen (
  update_id integer primary key,
  at text not null
);
