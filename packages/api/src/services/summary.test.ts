import { describe, it, expect } from 'vitest';
import { generateSummary } from './summary.js';
import type { Provider } from '../providers/types.js';

function fakeProvider(captured: { req?: any }): Provider {
  return {
    name: 'anthropic',
    complete: async () => { throw new Error('unused'); },
    completeText: async (req) => { captured.req = req; return 'SUMMARY'; },
    countTokens: async () => 0,
  };
}

describe('generateSummary', () => {
  it('summarizes the curated full block via completeText', async () => {
    const captured: { req?: any } = {};
    const out = await generateSummary(fakeProvider(captured), 'claude-opus-4-8', 'BRIEF + ANSWERS + DRAFT');
    expect(out).toBe('SUMMARY');
    expect(captured.req.model).toBe('claude-opus-4-8');
    expect(captured.req.messages[0].content).toContain('BRIEF + ANSWERS + DRAFT');
  });
});
