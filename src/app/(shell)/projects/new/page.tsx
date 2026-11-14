import type { Metadata } from 'next';
import { NewProjectView } from '~/components/projects/new-project-view';

export const metadata: Metadata = { title: 'New project' };

export default function NewProjectPage() {
  return <NewProjectView />;
}
