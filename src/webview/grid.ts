/**
 * Roving focus in the button grid: the button to focus after `key`, given the focused
 * index, the button count and the number of columns the grid currently shows.
 * Returns undefined for keys the grid does not handle.
 */
export function nextIndex(current: number, key: string, count: number, columns: number): number | undefined {
  if (count <= 0) return undefined;
  const cols = Math.max(1, Math.floor(columns));
  const last = count - 1;
  switch (key) {
    case 'ArrowRight':
      return Math.min(last, current + 1);
    case 'ArrowLeft':
      return Math.max(0, current - 1);
    case 'ArrowDown':
      return current + cols <= last ? current + cols : current;
    case 'ArrowUp':
      return current - cols >= 0 ? current - cols : current;
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return undefined;
  }
}
