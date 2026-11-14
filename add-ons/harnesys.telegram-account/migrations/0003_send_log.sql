create table if not exists send_log (
  id integer primary key autoincrement,
  at text not null,
  chat text not null
);
create index if not exists send_log_at on send_log (at);
