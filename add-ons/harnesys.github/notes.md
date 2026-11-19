Connect a GitHub App installation in the connections section. The installation token is issued by the host on demand and never leaves the server.

The `github.repo-events` trigger polls watched repositories for:

- new issues and pull requests, and updates to them;
- new Actions workflow runs.

Raw push events are not covered by polling; CI runs (`workflow_runs`) cover the push-to-build case. Conditional requests with `ETag`s keep polling from consuming the GitHub rate limit.

Repositories of the bound installation are attachable as sources (`github-repos` kind, git mount): the host clones them over HTTPS with the installation token supplied through a credential helper.
