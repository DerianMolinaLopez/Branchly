import { TriangleAlert } from 'lucide-react';
import { Button, Dialog } from '@/ui';
import { useConfirmStore } from './confirm';

/** Renders the pending confirmation request, if any. */
export function ConfirmDialog() {
  const request = useConfirmStore((state) => state.request);
  const settle = useConfirmStore((state) => state.settle);
  const danger = request?.tone !== 'default';

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      title={request?.title ?? ''}
      description={request?.description}
      width="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              settle(false);
            }}
          >
            Cancelar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            autoFocus
            onClick={() => {
              settle(true);
            }}
          >
            {request?.confirmLabel}
          </Button>
        </>
      }
    >
      {request?.consequences && request.consequences.length > 0 && (
        <div className="rounded-control border border-danger/30 bg-danger-soft/50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
            <TriangleAlert className="size-3.5" />
            Se perderá
          </p>
          <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto font-mono text-sm text-fg-secondary">
            {request.consequences.map((item) => (
              <li key={item} className="truncate" data-selectable>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
