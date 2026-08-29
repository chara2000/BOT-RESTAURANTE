'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { AppDataProvider } from '@/context/AppDataContext';
import { AuthProvider } from '@/context/AuthContext';
import { MobileMenuProvider } from '@/context/MobileMenuContext';
import { UIModalProvider } from '@/components/ui/UIModal';
import { registerServiceWorker } from '@/lib/utils/safariCompat';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      })
  );

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UIModalProvider>
          <AuthProvider>
            <MobileMenuProvider>
              <AppDataProvider>{children}</AppDataProvider>
            </MobileMenuProvider>
          </AuthProvider>
        </UIModalProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
