import { describe, expect, it, vi } from 'vitest';

import { handleSelectionShortcut, handleUndoShortcut } from '../../src/ui/keyboardShortcuts';

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

describe('free-move keyboard shortcuts', () => {
  it('invokes undo for Ctrl+Z and Command+Z outside editable controls', () => {
    const undo = vi.fn();
    const ctrlEvent = {
      ...event('z', { tagName: 'DIV', isContentEditable: false }),
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    } as KeyboardEvent;
    const commandEvent = {
      ...event('Z', { tagName: 'BUTTON', isContentEditable: false }),
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
    } as KeyboardEvent;

    expect(handleUndoShortcut(ctrlEvent, undo)).toBe(true);
    expect(handleUndoShortcut(commandEvent, undo)).toBe(true);
    expect(undo).toHaveBeenCalledTimes(2);
    expect(ctrlEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(commandEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each(['INPUT', 'TEXTAREA', 'SELECT'])(
    'does not hijack Ctrl+Z from an editable %s',
    (tagName) => {
      const undo = vi.fn();
      const keyEvent = {
        ...event('z', { tagName, isContentEditable: false }),
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      } as KeyboardEvent;

      expect(handleUndoShortcut(keyEvent, undo)).toBe(false);
      expect(undo).not.toHaveBeenCalled();
      expect(keyEvent.preventDefault).not.toHaveBeenCalled();
    },
  );
});
