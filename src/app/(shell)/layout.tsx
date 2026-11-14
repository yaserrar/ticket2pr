import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { AppHeader } from '~/components/layout/app-header';
import { CommandPalette } from '~/components/layout/command-palette';
import { RunNotifier } from '~/components/layout/run-notifier';
import { settingsService } from '~/server/modules/settings/settings.service';

/** App chrome: floating header + ⌘K. Without Trello credentials, setup comes first. */
export default async function ShellLayout({ children }: LayoutProps<'/'>) {
  await connection();
  const settings = await settingsService.get();
  if (!settings.trelloConfigured) redirect('/onboarding');

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader />
      <main id="main" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {children}
      </main>
      <CommandPalette />
      <RunNotifier />
    </div>
  );
}
