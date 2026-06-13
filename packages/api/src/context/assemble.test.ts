import { describe, it, expect } from 'vitest';
import { assembleContext } from './assemble.js';
import { ContextTooLargeError, NeedsManualSelectionError } from '../errors.js';
import type { CuratedSession } from './curate.js';

// Deterministic counter: 1 token per character of the assembled user content + system.
const charCounter = async (text: string) => text.length;

function priors(): CuratedSession[] {
  return [
    { sessionId: 'old', full: 'F'.repeat(100), summary: 'S'.repeat(10) },
    { sessionId: 'new', full: 'F'.repeat(100), summary: 'S'.repeat(10) },
  ];
}

describe('assembleContext', () => {
  it('keeps all priors full when everything fits', async () => {
    const res = await assembleContext({
      system: '', timeline: 'T', current: 'C', priors: priors(),
      budget: 10_000, countText: charCounter,
    });
    expect(res.usedSummaryFor).toEqual([]);
    expect(res.userContent).toContain('F'.repeat(100));
  });

  it('summarizes the oldest prior first when over budget', async () => {
    const res = await assembleContext({
      system: '', timeline: 'T', current: 'C', priors: priors(),
      budget: 130, countText: charCounter,
    });
    expect(res.usedSummaryFor).toEqual(['old']);
    expect(res.userContent).toContain('S'.repeat(10)); // old summarized
    expect(res.userContent).toContain('F'.repeat(100)); // new still full
  });

  it('throws NeedsManualSelection when even all-summaries overflow but incompressible fits', async () => {
    await expect(assembleContext({
      system: '', timeline: 'T', current: 'C', priors: priors(),
      budget: 25, countText: charCounter,
    })).rejects.toBeInstanceOf(NeedsManualSelectionError);
  });

  it('throws ContextTooLarge when timeline + current alone exceed budget', async () => {
    await expect(assembleContext({
      system: '', timeline: 'X'.repeat(50), current: 'Y'.repeat(50), priors: [],
      budget: 40, countText: charCounter,
    })).rejects.toBeInstanceOf(ContextTooLargeError);
  });
});
