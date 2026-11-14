create table if not exists topics (
  chat_id text not null,
  topic_id text not null,
  title text not null,
  updated_at text not null,
  primary key (chat_id, topic_id)
);
