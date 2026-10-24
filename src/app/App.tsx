import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { DialogHost } from '@/features/dialogs/DialogHost';
import { HomeScreen } from '@/features/home/HomeScreen';
import { CommandPalette } from '@/features/palette/CommandPalette';
import { GlobalShortcuts } from '@/features/palette/GlobalShortcuts';
import { RepoView } from '@/features/repo/RepoView';
import { useRepoChanges } from '@/features/repo/useRepoChanges';
import { TitleBar } from '@/features/titlebar/TitleBar';
import { useWorkspace } from '@/stores/workspace';
import { Toaster, TooltipProvider } from '@/ui';
import { queryClient } from './queryClient';
import { useSessionRestore } from './useSessionRestore';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={450} skipDelayDuration={150}>
          <Shell />
        </TooltipProvider>
      </MotionConfig>
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
      <CommandPalette />
      <GlobalShortcuts />
      <Toaster />
    </div>
  );
}
