export const POSITION_GAP = 100;

/** Next position to append after the given existing positions. */
export function nextPosition(existing: number[]): number {
  if (existing.length === 0) return POSITION_GAP;
  return Math.max(...existing) + POSITION_GAP;
}

/** A position strictly between `before` and `after` (null = open end). */
export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return POSITION_GAP;
  if (before == null) {
    const pos = Math.floor(after! / 2);
    if (pos >= after!) {
      throw new Error('Position gap exhausted; renumbering required');
    }
    return pos;
  }
  if (after == null) return before + POSITION_GAP;
  const mid = Math.floor((before + after) / 2);
  if (mid <= before) {
    throw new Error('Position gap exhausted; renumbering required');
  }
  return mid;
}
