// First-time setup after `npm install`: creates .env from .env.example and the local SQLite database.
// Safe to run again: it never overwrites .env and only applies migrations that are missing.
import { copyFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

if (existsSync('.env')) {
  console.log('✓ .env already exists, leaving it as is');
} else {
  copyFileSync('.env.example', '.env');
  console.log('✓ Created .env from .env.example');
}

console.log('… Creating or updating the database (data/app.db)');
execSync('npx prisma migrate deploy', { stdio: 'inherit' });

console.log(`
Done. Next:
  1. Sign in to Claude Code once:  claude   then type  /login
  2. Start the app:                 npm run dev
  3. Open http://127.0.0.1:3000 and follow the setup steps (Claude, Trello, first project).
`);
