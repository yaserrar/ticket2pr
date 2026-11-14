import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LAST_PROJECT_COOKIE } from '~/constants/site';
import { projectsService } from '~/server/modules/projects/projects.service';
import { settingsService } from '~/server/modules/settings/settings.service';

/** Entry: onboarding until Trello and a first project exist, then the last opened board. */
export default async function HomePage() {
  const lastProjectId = (await cookies()).get(LAST_PROJECT_COOKIE)?.value;
  const settings = await settingsService.get();
  if (!settings.trelloConfigured) redirect('/onboarding');
  const projects = await projectsService.list();
  const target = projects.find((p) => p.id === lastProjectId) ?? projects[0];
  if (!target) redirect('/onboarding');
  redirect(`/projects/${target.id}`);
}
