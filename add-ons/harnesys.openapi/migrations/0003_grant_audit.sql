create table if not exists grant_audit (
  id integer primary key,
  at text not null,
  actor_agent_id text,
  action text not null,
  agent_id text not null,
  project_id text not null,
  operation_id text not null,
  result text not null
);
create index if not exists grant_audit_agent on grant_audit (agent_id);
create index if not exists grant_audit_at on grant_audit (at);
