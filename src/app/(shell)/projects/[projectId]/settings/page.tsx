import type { Metadata } from 'next';
import { ProjectSettingsView } from '~/components/projects/project-settings-view';
import { loadProjectOrNotFound } from '~/server/modules/projects/project-page';

export const metadata: Metadata = { title: 'Project settings' };

export default async function ProjectSettingsPage({ params }: PageProps<'/projects/[projectId]/settings'>) {
  const { projectId } = await params;
  const project = await loadProjectOrNotFound(projectId);
  return <ProjectSettingsView project={project} />;
}
