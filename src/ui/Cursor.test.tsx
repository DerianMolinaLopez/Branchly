import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cursor } from './Cursor';

describe('Cursor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: 'a' }); // fresh activity
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('blinks while the user is active and settles solid when idle', () => {
    const { container } = render(<Cursor />);
    const cursor = container.querySelector('span');
    act(() => {
      vi.advanceTimersByTime(530);
    });
    expect(cursor?.style.visibility).toBe('hidden');
    act(() => {
      vi.advanceTimersByTime(530);
    });
    expect(cursor?.style.visibility).toBe('visible');

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const settled = cursor?.style.visibility;
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(cursor?.style.visibility).toBe('visible');
    expect(settled).toBe('visible');

    // Activity resumes blinking.
    act(() => {
      fireEvent.pointerMove(window);
      vi.advanceTimersByTime(530);
    });
    expect(cursor?.style.visibility).toBe('hidden');
  });
});
