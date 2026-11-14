create table if not exists connections (
  channel text primary key,
  chat_id text not null,
  topic_id text,
  agent_id text not null,
  thread_id text not null,
  thread_title text not null,
  created_at text not null,
  updated_at text not null
);
create index if not exists connections_chat_idx on connections(chat_id);
