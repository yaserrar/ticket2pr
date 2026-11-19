'use client';

import * as React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '~/components/ui/sonner';
import { TooltipProvider } from '~/components/ui/tooltip';
import { ConfirmDialogHost } from '~/components/shared/confirm-dialog';
import { createQueryClient } from '~/lib/query-client';

/**
 * Client providers mounted once in the root layout: the theme (light, dark or
 * system; next-themes) · React Query (server
 * state) · nuqs (URL state: the open card) · Radix tooltips · Sonner toasts.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(createQueryClient);

  React.useEffect(() => {
    // Lets <Shortcut keys={['mod', …]}/> show ⌘ on Apple platforms and Ctrl elsewhere.
    const isApple = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
    document.documentElement.dataset.platform = isApple ? 'mac' : 'other';
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>
          <TooltipProvider delayDuration={200}>
            {children}
            <ConfirmDialogHost />
            <Toaster position="bottom-right" closeButton />
          </TooltipProvider>
        </NuqsAdapter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
