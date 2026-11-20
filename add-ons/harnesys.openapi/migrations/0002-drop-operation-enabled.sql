-- The Enabled concept is removed: an operation is available to an agent
-- exactly when a grant exists for it. The column is no longer read or written.
alter table operations drop column enabled;
