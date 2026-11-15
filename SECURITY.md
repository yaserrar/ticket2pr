# Security policy

Ticket2PR runs on your own machine and can run code there through Claude Code, so security reports matter.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) for this repository, with steps to reproduce and the
impact you see. You'll get an answer as soon as possible.

## Design and scope

- The app listens on `127.0.0.1` only and its API rejects requests whose `Host` or `Origin` isn't loopback.
  Exposing it to a network (port forwarding, a reverse proxy, `-H 0.0.0.0`) is unsupported and unsafe.
- Trello and GitHub tokens are stored in plain text in `data/app.db` on your machine.
- Claude's permissions (`src/server/modules/runs/runners/tool-policy.ts`) deny git writes, network tools and web
  access, and refuse anything not explicitly allowed. They reduce risk but are not a sandbox: card content comes from
  your client and could try to steer Claude. Reports of ways around these rules are in scope.
