function isEditingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const candidate = target as { tagName?: unknown; isContentEditable?: unknown };
  const tagName = typeof candidate.tagName === 'string'
    ? candidate.tagName.toUpperCase()
    : '';
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || candidate.isContentEditable === true;
}

export function handleSelectionShortcut(
  event: KeyboardEvent,
  clearSelection: () => void,
  focusSearch: () => void,
): boolean {
  if (event.key === 'Escape') {
    event.preventDefault();
    clearSelection();
    return true;
  }
  if (event.key !== '/' || isEditingTarget(event.target)) return false;
  event.preventDefault();
  focusSearch();
  return true;
}
