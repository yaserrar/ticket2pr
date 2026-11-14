import type { Metadata } from 'next';
import { BoardView } from '~/components/board/board-view';
import { loadProjectOrNotFound } from '~/server/modules/projects/project-page';

export async function generateMetadata({ params }: PageProps<'/projects/[projectId]'>): Promise<Metadata> {
  const { projectId } = await params;
  return { title: (await loadProjectOrNotFound(projectId)).name };
}

export default async function ProjectBoardPage({ params }: PageProps<'/projects/[projectId]'>) {
  const { projectId } = await params;
  await loadProjectOrNotFound(projectId);
  return <BoardView projectId={projectId} />;
}
