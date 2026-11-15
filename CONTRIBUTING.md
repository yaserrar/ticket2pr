# Contributing to Ticket2PR

Thanks for your interest! Ticket2PR is a small, local-first tool. Bug reports, fixes and focused improvements are
very welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Keep pull requests focused: one change per pull request.

## Setup

```bash
npm install
npm run setup
echo 'RUNNER="fake"' >> .env   # simulated runs: no Claude usage while you work on the UI
npm run dev
```

The fake runner streams like a real run and writes `TICKET2PR_FAKE_RUN.md` in the card's worktree. To test against a
fake Trello, see "Testing without Trello or Claude" in the README.

## Conventions

The project's conventions are in [AGENTS.md](AGENTS.md). In short:

- Logic lives in `src/server/modules/*`; API routes stay thin and go through `route()`.
- Zod schemas in `src/schemas/*` are shared by forms and routes; presenters shape API responses.
- UI: dark only, colours from the tokens in `src/app/globals.css`, icons from `iconsax-react`.
- Database changes: edit `prisma/schema.prisma`, then `npm run db:migrate` to create a migration. Commit the
  migration with your change.
- Keep the Claude tool policy strict (`src/server/modules/runs/runners/tool-policy.ts`): Claude never commits, pushes
  or reaches the network.
- Pure logic gets unit tests next to it (`*.test.ts`). Git behaviour is tested on temporary repositories.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs the same checks. In the pull request, describe what changed and how you tested it (screenshots for UI
changes help a lot).

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org): `feat(board): …`, `fix(git): …`, `docs: …`.
