'use client';

import { Warning2 } from 'iconsax-react';
import { EmptyState } from '~/components/shared/empty-state';
import { Button } from '~/components/ui/button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center p-6">
      <EmptyState
        icon={Warning2}
        title="Something went wrong"
        description={error.message || 'An unexpected error occurred.'}
        action={<Button onClick={reset}>Try again</Button>}
        className="max-w-md"
      />
    </main>
  );
}
