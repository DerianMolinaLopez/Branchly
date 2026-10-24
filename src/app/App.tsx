import { QueryClientProvider } from '@tanstack/react-query';
import { domAnimation, LazyMotion, MotionConfig } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { DialogHost } from '@/features/dialogs/DialogHost';
import { HomeScreen } from '@/features/home/HomeScreen';
import { GlobalShortcuts } from '@/features/palette/GlobalShortcuts';
import { RepoView } from '@/features/repo/RepoView';
import { useRepoChanges } from '@/features/repo/useRepoChanges';
import { TitleBar } from '@/features/titlebar/TitleBar';
import { useWorkspace } from '@/stores/workspace';
import { Toaster, TooltipProvider } from '@/ui';
import { queryClient } from './queryClient';
import { useSessionRestore } from './useSessionRestore';

// Not needed for the first paint: loaded on demand.
const CommandPalette = lazy(() =>
  import('@/features/palette/CommandPalette').then((m) => ({ default: m.CommandPalette })),
);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Only the DOM animation features we use (opacity, transforms, exit). */}
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={450} skipDelayDuration={150}>
            <Shell />
          </TooltipProvider>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}

function Shell() {
  useSessionRestore();
  useRepoChanges();
  const tabs = useWorkspace((s) => s.tabs);
  const activeId = useWorkspace((s) => s.activeId);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1">
        {activeId === null && <HomeScreen />}
        {/* Inactive repositories stay mounted (hidden) to keep their state. */}
        {tabs.map((tab) => (
          <RepoView key={tab.id} repoId={tab.id} active={tab.id === activeId} />
        ))}
      </div>
      <DialogHost />
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
      <GlobalShortcuts />
      <Toaster />
    </div>
  );
}
