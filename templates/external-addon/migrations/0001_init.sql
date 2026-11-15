create table if not exists bookmarks (
  id integer primary key autoincrement,
  title text not null,
  url text not null,
  tag text not null default '',
  created_at text not null
);
