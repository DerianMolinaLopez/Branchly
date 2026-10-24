import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useToasts } from './toast';
import { Toaster } from './Toaster';

describe('Toaster', () => {
  beforeEach(() => {
    useToasts.setState({ toasts: [] });
  });

  it('shows notifications and runs their action once', async () => {
    const user = userEvent.setup();
    const undo = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.success('Commit abc1234 creado', { action: { label: 'Deshacer', onClick: undo } });
    });
    expect(screen.getByText('Commit abc1234 creado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it('turns a progress notification into a result', () => {
    render(<Toaster />);
    let id = 0;
    act(() => {
      id = toast.progress('Haciendo push…');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Haciendo push…');
    act(() => {
      toast.update(id, { kind: 'success', title: 'Push completado', description: 'main -> main' });
    });
    expect(screen.getByText('Push completado')).toBeInTheDocument();
    expect(screen.getByText('main -> main')).toBeInTheDocument();
  });

  it('announces errors as alerts', () => {
    render(<Toaster />);
    act(() => {
      toast.error('No se pudo hacer pull', { description: 'rejected' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo hacer pull');
  });
});
