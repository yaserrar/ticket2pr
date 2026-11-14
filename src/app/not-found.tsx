import Link from 'next/link';
import { SearchNormal1 } from 'iconsax-react';
import { EmptyState } from '~/components/shared/empty-state';
import { Button } from '~/components/ui/button';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center p-6">
      <EmptyState
        icon={SearchNormal1}
        title="Nothing here"
        description="This page or project doesn't exist."
        action={
          <Button asChild>
            <Link href="/">Back to the board</Link>
          </Button>
        }
        className="max-w-md"
      />
    </main>
  );
}
