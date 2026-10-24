import { fireEvent, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHotkey } from './useHotkey';

describe('useHotkey', () => {
  it('fires for the shortcut and not for other keys', () => {
    const handler = vi.fn();
    renderHook(() => {
      useHotkey('ctrl+k', handler);
    });
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores plain keys typed in text fields but not modified ones', () => {
    const plain = vi.fn();
    const modified = vi.fn();
    renderHook(() => {
      useHotkey('escape', plain);
      useHotkey('alt+arrowdown', modified);
    });
    const { getByRole } = render(<input aria-label="campo" />);
    const input = getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown', altKey: true });
    expect(plain).not.toHaveBeenCalled();
    expect(modified).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', () => {
    const handler = vi.fn();
    renderHook(() => {
      useHotkey('escape', handler, false);
    });
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(handler).not.toHaveBeenCalled();
  });
});
