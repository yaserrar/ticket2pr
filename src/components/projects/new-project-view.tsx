'use client';

import { useRouter } from 'next/navigation';
import { AppPage, PageHeader, SettingsSection } from '~/components/layout/app-page';
import { ProjectForm } from './project-form';

export function NewProjectView() {
  const router = useRouter();
  return (
    <AppPage>
      <PageHeader
        eyebrow="New project"
        title="Connect a Trello board"
        description="Pick the board and the list your client adds cards to, then the repository to work in."
      />
      <SettingsSection title="Project">
        <ProjectForm onSaved={(p) => router.push(`/projects/${p.id}`)} />
      </SettingsSection>
    </AppPage>
  );
}
