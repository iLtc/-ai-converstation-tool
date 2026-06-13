import { describe, it, expect } from 'vitest';
import { POSITION_GAP, nextPosition, positionBetween } from './positions.js';

describe('positions', () => {
  it('appends with a gap', () => {
    expect(nextPosition([])).toBe(POSITION_GAP);
    expect(nextPosition([100, 300, 200])).toBe(400);
  });

  it('inserts between two positions', () => {
    expect(positionBetween(100, 200)).toBe(150);
  });

  it('inserts at front and back', () => {
    expect(positionBetween(null, 100)).toBe(50);
    expect(positionBetween(300, null)).toBe(400);
    expect(positionBetween(null, null)).toBe(POSITION_GAP);
  });

  it('throws when the gap is exhausted', () => {
    expect(() => positionBetween(100, 101)).toThrow(/renumber/i);
    expect(() => positionBetween(null, 0)).toThrow(/renumber/i);
  });
});
