create table if not exists projects (
  id text primary key,
  name text not null,
  base_url text not null default '',
  auth_kind text not null default 'none',
  auth_param text,
  spec_sha text,
  created_at text not null,
  updated_at text not null
);
create unique index if not exists projects_name on projects (name);

create table if not exists operations (
  id integer primary key,
  project_id text not null,
  operation_id text not null,
  method text not null,
  path_template text not null,
  summary text not null default '',
  enabled integer not null default 0,
  spec text not null default '{}',
  unique(project_id, operation_id)
);
create index if not exists operations_project on operations (project_id);

create table if not exists grants (
  id integer primary key,
  agent_id text not null,
  project_id text not null,
  operation_id text not null,
  created_at text not null,
  unique(agent_id, project_id, operation_id)
);
create index if not exists grants_agent on grants (agent_id);
