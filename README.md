# Ticket2PR

**Turn Trello cards into reviewed code changes with Claude Code, on your own machine.**

Your clients write requests as Trello cards. Ticket2PR pulls them onto a local Kanban board. Drag a card to
*In progress* and Claude Code works on it in your repository, in its own branch. You review the diff, then commit,
push and open the pull request yourself. Claude never commits or pushes.

- **Local-first.** A Next.js app on `127.0.0.1`, a SQLite file, your repositories, your git credentials. No cloud
  backend, no accounts, no telemetry.
- **Your Claude subscription.** Runs use the Claude Code login on your machine (Claude Pro or Max), not an API key.
- **Human in the loop.** Every change goes through your review before it leaves your machine.

> **Status: early.** Built and used by one developer on macOS. Linux should work; Windows is untested. Expect rough
> edges, and please [open an issue](../../issues) when you hit one.

## How it works

```
Trello card ──sync──► New ──drag──► In progress ──Claude finishes──► Review ──push / PR──► Done
                       ▲                │  ▲                             │
                       └──── discard ───┘  └──── request changes ────────┘
```

1. **Sync.** New cards from the Trello list you choose appear in *New* (polling plus a Refresh button).
2. **Run.** Dragging a card to *In progress* creates a branch and a git worktree for it, then starts Claude Code
   there. The card's title, description, checklist, comments and attachments (screenshots too) are its instructions.
   You watch the run live.
3. **Review.** When Claude is done, the card moves to *Review*: read the diff, request changes (Claude continues the
   same session), or commit and push. Open the pull request from the app.
4. **Tell the client.** Post Claude's plain-language update on the Trello card, or its questions when the request
   was unclear. Optionally, cards move between your Trello lists as their status changes.

## Requirements

- **Node.js 20.19 or newer** and **git**.
- **A Claude Pro or Max subscription**, with Claude Code signed in on this machine. Install
  [Claude Code](https://code.claude.com/docs/en/overview), run `claude`, then type `/login` once.
- **A Trello account.** The setup screen walks you through creating an API key and a token.
- **Your project's git repository** on this machine, with push access configured as usual (SSH key or credential
  helper). A GitHub token is optional: without one, "Open pull request" opens GitHub's compare page.

## Quick start

```bash
git clone <this repository> ticket2pr
cd ticket2pr
npm install        # also generates the database client
npm run setup      # creates .env and the local database (data/app.db)
npm run dev        # http://127.0.0.1:3000
```

Open http://127.0.0.1:3000 and follow the three setup steps: **Claude** (checks your login without using your
plan), **Trello** (API key and token), **First project** (Trello board and list, local repository path).

- Another port: `PORT=3001 npm run dev`.
- A faster, production build: `npm run build`, then `npm start`.
- Updating: `git pull`, `npm install`, `npm run setup` (applies new database migrations; your data is kept).

The app always listens on `127.0.0.1` only. Don't expose it to a network: it can run code on your machine through
Claude.

## Features

### Board and runs
- Kanban board with drag and drop: *New → In progress → Review → Done*, with explanations when a move isn't allowed.
- Live run log (Claude's messages, tool calls and results), Stop, Retry, and **Request changes** to continue the same
  Claude session with your instructions.
- A run queue (*Runs at the same time* in Settings). Runs interrupted by a server stop are marked as such.
- Per project: a setup command for new worktrees (for example `npm ci`) and extra instructions for Claude. The
  repository's own `CLAUDE.md` is read too.

### Two ways to work (Project settings)
- **A branch per card** (default). Each card gets a `t2p/…` branch in its own worktree under `~/.ticket2pr/worktrees`,
  started from the latest `origin/{base}`. Your working copy is never touched, and cards can run side by side.
  **Update from main** merges new base commits into a card branch (aborted cleanly on conflicts), and **Clean up**
  removes Done cards' worktrees and their local branches once pushed.
- **One shared branch.** Every card works on one branch (for example `dev`), one card at a time, either directly in
  your repository folder or in one separate folder. Each card starts from a clean folder and pulls the latest commits
  first. Push moves the card to Done. No pull request per card.
- **Repository chip** on the board: which branch your folder is on, how far behind origin, and a safe **Pull**
  (fast-forward only).

### Working with the client
- **Context for Claude:** Trello comments and attachments go into every run. Screenshots, PDFs and text files are
  downloaded outside the repository (never in the diff) and Claude may read them. Follow-ups get only what's new.
- **Updated on Trello:** if the client edits the card or comments while work is going on, the card says so, and its
  **Client** tab shows exactly what changed: send it to Claude, or mark it as seen.
- **Client update:** Claude ends each run with a few plain sentences for the client. Edit them, then post them on the
  Trello card. Commit messages and PR descriptions keep only the technical summary.
- **Questions:** when a request is unclear, Claude changes nothing and writes questions instead. **Ask on Trello**
  posts them; when the client answers, **Continue with the answer** resumes the work.
- **Move cards on Trello** (optional): choose a list for In progress, Review, Needs info and Done. Failures never
  block anything; the card shows a badge.

### Claude usage and notifications
- Runs report your subscription's usage (Settings › Claude Code). At the limit, the queue pauses and the card
  continues on its own after the reset, resuming the same session. **Resume now** lifts the pause.
- Optional desktop notifications while the app is open in a tab: a run is ready or failed, Claude has questions, the
  client replied, the usage limit paused the queue.

## What Claude may do

Runs are unattended, so permissions are strict (`src/server/modules/runs/runners/tool-policy.ts`):

- **Allowed:** reading the repository and editing files inside the card's worktree, read-only git, and the project's
  own `test`, `lint`, `typecheck` and `build` scripts (with the package manager its lockfile implies). Reading the
  card's downloaded attachments.
- **Always denied:** `git commit`, `push`, `config`, `remote` and branch changes, `curl`, `wget`, `ssh`, `sudo`,
  `npm publish`, web search and fetch. Deny rules win over the repository's own Claude settings.
- **Anything else** is refused with an explanation (shown as "Refused …" in the log), and Claude carries on without it.
- Card text, comments and attachments come from your client: the prompt marks them as a request, never as
  instructions that change these rules.

These rules reduce risk; they are not a sandbox. Only use Ticket2PR on repositories and Trello boards you trust.

## Your data

Everything stays on your machine:
- `data/app.db` (SQLite): projects, cards, run logs, settings, and your **Trello key and token** and optional
  **GitHub token**, stored as plain text. Keep this folder private; it is ignored by git.
- `~/.ticket2pr/worktrees` and `~/.ticket2pr/attachments`: card worktrees and downloaded Trello attachments.
- The API refuses requests whose `Host` or `Origin` isn't `127.0.0.1` or `localhost`, which blocks other websites
  and DNS-rebinding attacks from reaching it through your browser.

## Configuration

Set in `.env` (see `.env.example`). All optional except `DATABASE_URL`.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./data/app.db` | SQLite file |
| `PORT` | `3000` | Port for `npm run dev` / `npm start` |
| `RUNNER` | `claude` | `fake` simulates runs without using your plan (UI work, demos) |
| `CLAUDE_CODE_PATH` | bundled | Use another `claude` binary than the one bundled with the Agent SDK |
| `WORKTREES_DIR` | `~/.ticket2pr/worktrees` | Where worktrees go (attachments go next to it) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `TRELLO_API_BASE`, `GITHUB_API_BASE` | official APIs | Point the clients at a local mock |

## Troubleshooting

- **"Claude Code is not signed in"**: run `claude` in a terminal, type `/login`, sign in with the account that has
  your Pro or Max plan, then **Check again** in Settings.
- **"Your Claude usage limit is reached"**: queued runs continue after the reset shown on the board.
- **Trello rejected the key or token**: create a new token from the link in Settings › Trello.
- **Push fails**: Ticket2PR pushes with your normal git setup. Check that `git push` works in a terminal in that
  repository (SSH key, credential helper). Git errors are shown as git wrote them.
- **Port already in use**: `PORT=3001 npm run dev`.
- **`npm install` fails building `better-sqlite3`**: check `node -v` (20.19 or newer is required).

## Development

```bash
npm run dev          # with RUNNER="fake" in .env to work on the UI without using your plan
npm run typecheck
npm run lint
npm test             # Vitest: unit tests and git integration tests on temporary repositories
```

| Script | What it does |
|---|---|
| `npm run setup` | Create `.env` (if missing) and apply database migrations |
| `npm run db:migrate` | Create a migration after editing `prisma/schema.prisma` |
| `npm run db:studio` | Browse the SQLite database |

### Code map

```
src/server/modules/<feature>/*.service.ts      business logic and database access
src/server/modules/trello/                     typed Trello client, write-back, comments and attachments
src/server/modules/sync/sync.plan.ts           pure sync diff (unit-tested)
src/server/modules/workflow/workflow.service.ts  every status change of a card
src/server/modules/runs/                       queue, executor, live stream, prompt, runners (claude, fake)
src/server/modules/git/                        repository checks, worktrees, shared branch, diff, commit and push
src/server/presenters/*.presenter.ts           database row → API shape (src/types/*)
src/app/api/**/route.ts                        thin handlers through route() (Zod, loopback guard, errors)
src/schemas/*.ts                               Zod schemas shared by forms and routes
src/services/api/*.ts → src/hooks/*.ts         fetch client → React Query hooks
src/components/{board,cards,projects,settings}  feature components
```

`docs/spec.md` is the original design; code comments cite its sections as `spec §x.y`. `AGENTS.md` lists the
project's conventions (also used by coding agents).

### Testing without Trello or Claude

`RUNNER="fake"` simulates runs: they stream like real ones and write a `TICKET2PR_FAKE_RUN.md` file in the worktree.
`TRELLO_API_BASE` and `GITHUB_API_BASE` point the clients at a local mock server, `WORKTREES_DIR` moves the
worktrees, and `FAKE_RUNNER_STEP_MS` speeds up fake runs. With a throwaway database:

```bash
DATABASE_URL="file:/tmp/t2p.db" npx prisma migrate deploy
DATABASE_URL="file:/tmp/t2p.db" RUNNER=fake TRELLO_API_BASE="http://127.0.0.1:4599/1" npx next dev -H 127.0.0.1 -p 3010
```

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md) for
reporting vulnerabilities.

## Disclaimer

Ticket2PR is an independent project, not affiliated with or endorsed by Anthropic or Atlassian (Trello). It runs
Claude Code on your machine with your own Claude account; you are responsible for using it in line with
[Anthropic's terms](https://www.anthropic.com/legal) and your Claude plan. Claude can make mistakes: review every
change before you push it.

## License

[MIT](LICENSE) © Youssef Aserrar
