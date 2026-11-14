'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AppPage, PageHeader, SettingsSection } from '~/components/layout/app-page';
import { ConfirmButton } from '~/components/shared/confirm-button';
import { useDeleteProject } from '~/hooks/projects';
import { plural } from '~/lib/format';
import type { ProjectDto } from '~/types/project';
import { ProjectForm } from './project-form';

export function ProjectSettingsView({ project }: { project: ProjectDto }) {
  const router = useRouter();
  const remove = useDeleteProject();

  return (
    <AppPage>
      <PageHeader eyebrow="Project" title={project.name} description="Where cards come from, and the repository they are worked on in." />

      <SettingsSection title="Project">
        <ProjectForm
          project={project}
          onSaved={() => {
            toast.success('Project saved');
            router.push(`/projects/${project.id}`);
          }}
        />
      </SettingsSection>

      <SettingsSection
        tone="danger"
        title="Delete project"
        description="Removes the project, its cards and their worktrees from Ticket2PR. Branches and your Trello board are kept."
      >
        <div>
          <ConfirmButton
            label="Delete project"
            title={`Delete ${project.name}?`}
            description={`${plural(project.cardCount, 'card')} will be removed from Ticket2PR. Your Trello board is not touched.`}
            confirmLabel="Delete project"
            pending={remove.isPending}
            onConfirm={async () => {
              await remove.mutateAsync(project.id);
              toast.success('Project deleted');
              router.push('/');
              router.refresh();
            }}
          />
        </div>
      </SettingsSection>
    </AppPage>
  );
}
