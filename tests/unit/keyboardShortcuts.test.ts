import { describe, expect, it, vi } from 'vitest';

import { handleSelectionShortcut } from '../../src/ui/keyboardShortcuts';

function event(key: string, target: Record<string, unknown>) {
  return {
    key,
    target,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('selection keyboard shortcuts', () => {
  it('clears selection with Escape even when search input owns focus', () => {
    const clear = vi.fn();
    const focusSearch = vi.fn();
    const keyEvent = event('Escape', { tagName: 'INPUT', isContentEditable: false });

    expect(handleSelectionShortcut(keyEvent, clear, focusSearch)).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(keyEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('does not hijack slash while typing in an input', () => {
    const clear = vi.fn();
    const focusSearch = vi.fn();
    const keyEvent = event('/', { tagName: 'INPUT', isContentEditable: false });

    expect(handleSelectionShortcut(keyEvent, clear, focusSearch)).toBe(false);
    expect(focusSearch).not.toHaveBeenCalled();
    expect(keyEvent.preventDefault).not.toHaveBeenCalled();
  });
});
