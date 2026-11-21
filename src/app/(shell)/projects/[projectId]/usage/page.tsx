import type { Metadata } from 'next';
import { UsageView } from '~/components/usage/usage-view';
import { loadProjectOrNotFound } from '~/server/modules/projects/project-page';

export const metadata: Metadata = { title: 'Time and usage' };

export default async function ProjectUsagePage({ params }: PageProps<'/projects/[projectId]/usage'>) {
  const { projectId } = await params;
  const project = await loadProjectOrNotFound(projectId);
  return <UsageView projectId={project.id} projectName={project.name} />;
}
