# Security Policy

## Supported versions

Security fixes land in the latest release only. Pin a specific tag if you need
stability, but plan to move forward: `latest` and the newest `v*` tag are the
supported channels.

## Reporting a vulnerability

Do not open a public issue for security reports.

Email [mikestotik@gmail.com](mailto:mikestotik@gmail.com) with:

- a description of the issue and its impact;
- reproduction steps or a proof of concept;
- affected versions or commit hash.

You will get an acknowledgment within 7 days. We aim to publish a fix within 90
days of a confirmed report and will credit you in the release notes unless you
prefer to stay anonymous.

## Scope

In scope: the host API, the web UI, the desktop app, the CLI, and the published
container images. Out of scope: self-hosted deployment misconfiguration (for
example, exposing ports without TLS), denial-of-service by volume, and issues in
third-party dependencies without a demonstrated impact in Harnesys.
