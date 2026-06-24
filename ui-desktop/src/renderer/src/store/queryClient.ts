import { QueryClient } from '@tanstack/react-query';

// A single app-level QueryClient. It lives above the router (see App.tsx) so the
// cache survives route unmounts. Revisiting a tab serves cached data instantly
// and revalidates in the background (stale-while-revalidate), instead of showing
// a blocking full-screen loader every time.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for this long; within the window a remount
      // reuses the cache with no network call at all.
      staleTime: 30_000,
      // Keep unused data around so navigating back is instant.
      gcTime: 5 * 60_000,
      // The desktop window focus/blur churn would otherwise trigger constant
      // refetches; we rely on staleTime + explicit invalidation instead.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
