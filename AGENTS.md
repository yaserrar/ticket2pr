<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules
- Spec: `../docs/specs/ticket2pr-spec.md`. Architecture: `../docs/NEXTJS_ARCHITECTURE.md` (same layers and naming as Dispatch), adapted for a local-first app (see README "Differences from the shared architecture").
- UI direction: `../docs/UIs/Raycast UX Design Teardown.md`. Dark only. Colours come from tokens in `src/app/globals.css` only (no hex in components).
- Icons: `iconsax-react` only (Bulk variant is the default through `scripts/patch-iconsax.mjs`). Never add lucide-react.
- Prisma 7 + SQLite (`@prisma/adapter-better-sqlite3`): import from `~/generated/prisma/client`. Enums and JSON are `String` columns validated with Zod.
- Every API route goes through `route()` (`src/server/http/route.ts`): Zod parsing, loopback-only guard, error mapping. Routes stay thin; logic lives in `src/server/modules/*`.
- Server Components that read the database call `await connection()` (or a request API such as `cookies()`) first: better-sqlite3 is synchronous and would otherwise be prerendered.
- Never commit, push or expose the app beyond 127.0.0.1. Never log Trello keys or tokens.
- Never run `prisma migrate reset` or delete `data/` unless explicitly asked.
