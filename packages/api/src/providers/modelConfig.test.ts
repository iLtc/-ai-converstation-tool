import { describe, it, expect } from 'vitest';
import { getModelMeta, inputBudget, SAFETY_MARGIN } from './modelConfig.js';

describe('model config', () => {
  it('returns metadata for a known model', () => {
    const m = getModelMeta('claude-opus-4-8');
    expect(m.provider).toBe('anthropic');
    expect(m.contextWindow).toBeGreaterThan(0);
  });

  it('fails loud for an unknown model', () => {
    expect(() => getModelMeta('made-up-model')).toThrow(/unknown model/i);
  });

  it('computes input budget as window - reserve - margin', () => {
    const m = getModelMeta('claude-opus-4-8');
    expect(inputBudget('claude-opus-4-8')).toBe(m.contextWindow - m.outputReserve - SAFETY_MARGIN);
  });
});
