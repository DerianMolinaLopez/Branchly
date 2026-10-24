import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkingTreeStatus } from '@/api';
import { useDrafts } from '@/stores/drafts';
import { CommitEditor } from './CommitEditor';

const commit = vi.fn();
const headMessage = vi.fn();

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>();
  return {
    ...actual,
    commitsApi: {
      commit: (...args: unknown[]) => commit(...args) as unknown,
      headMessage: (...args: unknown[]) => headMessage(...args) as unknown,
    },
  };
});

const status = (staged: number): WorkingTreeStatus => ({
  staged: Array.from({ length: staged }, (_, i) => ({
    path: `file${i}.txt`,
    oldPath: null,
    kind: 'modified' as const,
    additions: 0,
    deletions: 0,
    binary: false,
  })),
  unstaged: [],
  conflicted: [],
  state: 'clean',
});

describe('CommitEditor', () => {
  beforeEach(() => {
    commit.mockReset();
    headMessage.mockReset();
    useDrafts.setState({ drafts: {} });
  });

  it('is disabled until there is a summary and something staged', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CommitEditor repoId="r1" status={status(0)} />);
    const button = screen.getByRole('button', { name: /hacer commit/i });
    expect(button).toBeDisabled();
    expect(screen.getByText('Prepara algún cambio para hacer commit')).toBeInTheDocument();

    rerender(<CommitEditor repoId="r1" status={status(2)} />);
    expect(screen.getByText('Escribe un resumen')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Resumen del commit'), 'Fix parser');
    expect(screen.getByRole('button', { name: /hacer commit de 2 archivos/i })).toBeEnabled();
  });

  it('commits summary and description, then clears the draft', async () => {
    const user = userEvent.setup();
    commit.mockResolvedValue({
      value: {
        id: 'abc',
        shortId: 'abc1234',
        summary: 'Fix parser',
        parents: [],
        author: { name: 'A', email: 'a@b.c', timestamp: 0, offsetMinutes: 0 },
      },
      undo: { id: 1, label: 'Commit abc1234' },
    });
    render(<CommitEditor repoId="r1" status={status(1)} />);
    await user.type(screen.getByLabelText('Resumen del commit'), 'Fix parser');
    await user.type(screen.getByLabelText('Descripción del commit'), 'Handles empty input.');
    await user.click(screen.getByRole('button', { name: /hacer commit/i }));
    await waitFor(() => {
      expect(commit).toHaveBeenCalledWith('r1', 'Fix parser\n\nHandles empty input.', false);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Resumen del commit')).toHaveValue('');
    });
  });

  it('prefills the last message when amending', async () => {
    const user = userEvent.setup();
    headMessage.mockResolvedValue('Previous summary\n\nPrevious body');
    render(<CommitEditor repoId="r1" status={status(0)} />);
    await user.click(screen.getByRole('checkbox', { name: /modificar el último commit/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Resumen del commit')).toHaveValue('Previous summary');
    });
    expect(screen.getByLabelText('Descripción del commit')).toHaveValue('Previous body');
    expect(screen.getByRole('button', { name: /modificar el commit/i })).toBeEnabled();
  });

  it('warns when the summary is longer than 72 characters', async () => {
    const user = userEvent.setup();
    render(<CommitEditor repoId="r1" status={status(1)} />);
    await user.type(screen.getByLabelText('Resumen del commit'), 'x'.repeat(80));
    expect(screen.getByText('80/72')).toHaveClass('text-warning');
  });
});
