import { Copy, ExternalLink, FolderOpen, History, ScanText } from 'lucide-react';
import { systemApi } from '@/api';
import { copyText } from '@/lib/clipboard';
import { useWorkspace } from '@/stores/workspace';
import { ContextMenuItem, ContextMenuSeparator, toast } from '@/ui';

/** Context-menu items shared by every file list. */
export function FileMenuItems({ repoId, path, exists = true }: { repoId: string; path: string; exists?: boolean }) {
  const setCenter = useWorkspace((s) => s.setCenter);
  const fail = (error: unknown) => {
    toast.error('No se pudo abrir', { description: error instanceof Error ? error.message : String(error) });
  };
  return (
    <>
      <ContextMenuItem
        icon={<History />}
        onSelect={() => {
          setCenter(repoId, { kind: 'history', path });
        }}
      >
        Ver historial del archivo
      </ContextMenuItem>
      <ContextMenuItem
        icon={<ScanText />}
        disabled={!exists}
        onSelect={() => {
          setCenter(repoId, { kind: 'blame', path });
        }}
      >
        Ver blame
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem icon={<ExternalLink />} disabled={!exists} onSelect={() => void systemApi.openInEditor(repoId, path).catch(fail)}>
        Abrir en el editor
      </ContextMenuItem>
      <ContextMenuItem icon={<FolderOpen />} disabled={!exists} onSelect={() => void systemApi.reveal(repoId, path).catch(fail)}>
        Mostrar en la carpeta
      </ContextMenuItem>
      <ContextMenuItem icon={<Copy />} onSelect={() => void copyText(path)}>
        Copiar ruta
      </ContextMenuItem>
    </>
  );
}
