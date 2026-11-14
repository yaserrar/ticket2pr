# Ticket2PR

A local web app that turns Trello cards into reviewed pull requests, using Claude Code on your own machine
(spec: `../docs/specs/ticket2pr-spec.md`).

**Status: milestones M1–M6.** Trello sync, the drag and drop workflow with a run queue, git (a worktree and branch
per card, diff, commit, push, pull request, discard) and **Claude Code** runs with your own Claude subscription.
Trello write-back and polish (M7) are next.

## Run it

```bash
npm install            # also patches iconsax and generates the Prisma client
npx prisma migrate deploy
npm run dev            # http://127.0.0.1:3000 (localhost only, on purpose)
```

On first launch, the onboarding asks for a Trello **API key** (create a Power-Up at
https://trello.com/power-ups/admin) and a **token** (the form links to the authorisation page once the key is
pasted). Credentials are stored in `data/app.db` on this machine and are never sent back to the browser in full.

## Claude Code (spec §7)

Runs use the Claude Agent SDK, which starts Claude Code on this machine with **your Claude Pro/Max login** (run
`claude`, then `/login`, once). `ANTHROPIC_API_KEY` is removed from the environment Claude Code starts with, so it
never falls back to an API key. Settings › Claude Code shows the account and plan (checked without sending a prompt),
the model and the turn limit.

What Claude may do in a card's worktree (`src/server/modules/runs/runners/tool-policy.ts`):
- edit files inside the worktree (`acceptEdits` mode), read-only git, and the project's own `test` / `lint` /
  `typecheck` / `build` scripts with the package manager its lockfile implies;
- never: `git commit` / `push` / `config` / `remote` / branch changes, `curl` / `wget` / `ssh`, web tools, questions.
  Deny rules win over the repository's own settings;
- anything else is refused with an explanation, logged as "Refused …", and Claude carries on.

The repository's `CLAUDE.md` and the project's "Instructions for Claude" are part of every run. Follow-up runs
("Request changes") resume the same Claude session. The cost shown is what the run would cost on the API; with a
subscription it is covered by your plan. `RUNNER="fake"` simulates runs without using the plan.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `start` | Next.js on 127.0.0.1:3000 |
| `npm run typecheck` · `lint` · `test` | TypeScript, ESLint, Vitest |
| `npm run db:migrate` | New migration (`prisma migrate dev`), then `npm run db:generate` |
| `npm run db:studio` | Browse the SQLite database |

## How sync works (spec §6.3)

- `POST /api/projects/{id}/sync` pulls the open cards of the board in **one request**, plus the board's checklists
  in one more request only when a card is new or changed. Polling every few minutes stays far below Trello's rate
  limits.
- New cards from the **source list** are created in *New*. Cards elsewhere on the board are ignored.
- Trello owns the **content** (title, description, labels, checklists). Ticket2PR owns the **status** (the column).
- Content edited after work started sets `changedOnTrello`. Cards archived or deleted on Trello are flagged
  `removedFromTrello`, never deleted locally.
- One sync per project at a time; a concurrent request gets the running sync's result. Every sync writes a
  `SyncLog` row (kept 7 days).

## Workflow (spec §9)

```
NEW ──drag──► IN_PROGRESS ──run succeeds──► REVIEW ──PR opened / drag──► DONE
 ▲                 │  ▲                        │
 │  discard        │  └──── request changes ───┘
 └─────────────────┘
```

- Rules live in one shared function (`src/lib/workflow.ts`): the board explains refused moves before calling the
  API, and `workflow.service.ts` enforces the same rules. Destructive moves need confirmation.
- **New → In progress** queues a run. The run creates the branch `t2p/{shortLink}-{title}` in a worktree under
  `~/.ticket2pr/worktrees/{project}/{shortLink}` (from `origin/{base}`), runs the setup command once, then the agent.
  Your main working copy is never touched.
- At most *Runs at the same time* (Settings) run at once; the rest show "Queued (2nd)". Runs left running when the
  server stops are marked *Interrupted* on the next start.
- The card panel has **Run** (live log over SSE, Stop, Retry, Request changes), **Changes** (diff vs the base branch,
  reset) and **Git** (commit, push with your own credentials, pull request, discard).
- Pull requests: with a GitHub token (Settings) they open through the API and the card moves to Done; without one,
  GitHub's compare page opens. GitHub SSH aliases such as `git@github-work:owner/repo.git` are recognised.

## Work modes (Project settings › How cards are worked on)

**A branch per card** (default): everything above. Extras:
- **Update from {base}** (Git tab) merges the latest `origin/{base}` into the card branch when it is behind. On a
  conflict the merge is aborted, nothing changes, and the conflicting files are listed.
- **Clean up** (Git tab of a Done card, or *Clean up Done cards* in the repository chip) removes worktrees and deletes
  local branches only when origin has every commit of them.

**One shared branch**: every card works on one branch (empty = the base branch), one card at a time.
- *Work directly in my repository folder* (default): Claude works in your repo folder, which must already be on that
  branch. Ticket2PR never switches it. Off: one separate worktree for the branch is shared by the project's cards.
- A card's first run needs a clean folder, fast-forwards the branch from origin, and records the start commit
  (`cards.startSha`). Changes and commit counts are relative to it. Retries and follow-ups keep going from there.
- Another card can start only when the open one is pushed (Push moves it to Done), moved to Done, or discarded.
- Discard throws away uncommitted changes only; commits, the branch and the folder stay. No pull request per card. On
  a branch other than the base, the Git tab links GitHub's compare page for a release PR.
- The mode can't change while cards are In progress or in Review.

**Repository chip** (board toolbar): the repo folder's branch and how far behind origin it is (fetched at most once a
minute). **Pull** only fast-forwards; it refuses on diverged branches, and while a shared-branch card works in the folder.

## Working with the client (Trello)

- **Context for Claude:** every run gets the card's Trello comments and attachments. Uploaded screenshots, PDFs and text
  files are downloaded to `~/.ticket2pr/attachments/{card}` (outside the repo, so never in the diff) and Claude may read
  that folder. Follow-up runs get only what's new since the last run: card edits, comments, attachments. Comments
  Ticket2PR posted itself are left out.
- **Updated on Trello:** a sync that finds an edit or a new comment on a card being worked on sets the badge. The card's
  **Client** tab shows what changed: **Send to Claude** or **Mark as seen**.
- **Client update:** Claude ends each run with a `## Client update` (plain words). Edit it in the Client tab and **Post on
  Trello**. Commit messages and PR descriptions keep only the technical summary.
- **Needs info:** when a request is unclear Claude makes no changes and writes `## Questions for the client`. **Ask on
  Trello** posts them and marks the card *Waiting for client*. A comment from the client then shows *Client replied*
  and **Continue with the answer** resumes the session with it.
- **Move cards on Trello** (Project settings, optional): the list for In progress, Review, Needs info and Done.
  Discarded cards go back to the source list. Failures never block anything; they show a *Trello update failed* badge.

## Claude usage limit

Runs report the subscription's usage (Settings › Claude Code). When the limit is reached the queue pauses until the
reset (board banner, **Resume now**), the interrupted run is recorded, and the card continues automatically after the
reset, resuming the same Claude session.

## Notifications

While the app is open in a tab, Settings › Notifications turns on desktop notifications (the browser asks once): a run
is ready or failed, Claude has questions, the client replied, the usage limit paused the queue. In the app they're
toasts.

## Code map

Same layers and naming as the other Asrar apps (`../docs/NEXTJS_ARCHITECTURE.md`):

```
src/server/modules/<feature>/<feature>.service.ts   business logic + Prisma
src/server/modules/trello/trello.client.ts          typed Trello REST wrapper (Zod-parsed, TrelloError)
src/server/modules/sync/sync.plan.ts                pure sync diff (unit-tested)
src/server/modules/workflow/workflow.service.ts     every status change (move, start, retry, follow-up, discard)
src/server/modules/runs/*                           queue, executor, registry, SSE stream, prompt, runners/
src/server/modules/git/*                            repo validation, worktrees, shared-branch checkout, changes, commit/push, diff parser
src/server/presenters/*.presenter.ts                Prisma row → DTO (types/*)
src/app/api/**/route.ts                             thin handlers via route()
src/schemas/*.ts                                    Zod, shared by forms and routes
src/services/api/*.ts → src/hooks/*.ts              fetch client → React Query hooks
src/components/{board,cards,projects,settings,…}    feature components
```

## Differences from the shared architecture

Ticket2PR is local-first (spec §1.3), so it drops what only a hosted SaaS needs: no auth, workspaces, billing,
email, MinIO or Postgres. It uses SQLite through Prisma's better-sqlite3 adapter, binds to 127.0.0.1, and its
`route()` wrapper rejects requests whose `Host` or `Origin` isn't loopback (DNS rebinding and cross-site posts).
The UI is dark only, following the Raycast teardown.

## Testing against a fake Trello

`TRELLO_API_BASE` and `GITHUB_API_BASE` point the clients elsewhere (a local mock server), `WORKTREES_DIR` moves the
worktrees, and `FAKE_RUNNER_STEP_MS` speeds up fake runs. With a throwaway database:

```bash
DATABASE_URL="file:/tmp/t2p.db" npx prisma migrate deploy
DATABASE_URL="file:/tmp/t2p.db" TRELLO_API_BASE="http://127.0.0.1:4599/1" npx next dev -H 127.0.0.1 -p 3010
```
