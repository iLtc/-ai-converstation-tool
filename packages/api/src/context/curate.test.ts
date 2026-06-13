import { describe, it, expect } from 'vitest';
import { curateSession } from './curate.js';

describe('curateSession', () => {
  const turns = [
    { kind: 'brief', content: { goal: 'Ask for a deadline extension', background: 'Busy week' } },
    { kind: 'answers', content: { items: ['Be polite', 'Offer a new date'] } },
    { kind: 'draft', content: { body: 'First draft' } },
    { kind: 'edit', content: { body: 'Final edited draft' } },
  ] as any;

  it('renders brief + answers + the latest draft/edit as the full curated block', () => {
    const c = curateSession({ sessionId: 's1', summary: 'A short summary', turns });
    expect(c.full).toContain('Ask for a deadline extension');
    expect(c.full).toContain('Offer a new date');
    expect(c.full).toContain('Final edited draft'); // latest draft/edit, not "First draft"
    expect(c.full).not.toContain('First draft');
  });

  it('uses the stored summary as the compressed form', () => {
    const c = curateSession({ sessionId: 's1', summary: 'A short summary', turns });
    expect(c.summary).toBe('A short summary');
  });

  it('throws if a prior session has no summary (priors are always sent)', () => {
    expect(() => curateSession({ sessionId: 's1', summary: null, turns })).toThrow(/summary/i);
  });
});
