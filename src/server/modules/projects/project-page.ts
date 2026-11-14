import 'server-only';
import { notFound } from 'next/navigation';
import { HttpError } from '~/server/http/errors';
import { projectsService } from './projects.service';

/** For Server Components: the project, or the 404 page. */
export async function loadProjectOrNotFound(projectId: string) {
  try {
    return await projectsService.get(projectId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
