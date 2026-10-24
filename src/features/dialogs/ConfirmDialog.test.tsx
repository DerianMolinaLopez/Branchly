import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { confirm } from './confirm';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('lists what will be lost and resolves true on confirm', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog />);
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => {
      answer = confirm({
        title: 'Descartar cambios',
        consequences: ['src/main.rs', 'README.md'],
        confirmLabel: 'Descartar',
      });
    });
    expect(await screen.findByRole('dialog', { name: 'Descartar cambios' })).toBeInTheDocument();
    expect(screen.getByText('Se perderá')).toBeInTheDocument();
    expect(screen.getByText('src/main.rs')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    await expect(answer).resolves.toBe(true);
  });

  it('resolves false when cancelled with Escape', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog />);
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = confirm({ title: 'Eliminar rama', confirmLabel: 'Eliminar' });
    });
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await expect(answer).resolves.toBe(false);
  });
});
