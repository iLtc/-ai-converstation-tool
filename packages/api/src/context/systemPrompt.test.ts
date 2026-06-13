import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './systemPrompt.js';

describe('buildSystemPrompt', () => {
  it('orders sections general -> specific so the tone note wins on conflict', () => {
    const p = buildSystemPrompt({
      type: 'email',
      styleProfile: { instructions: 'Write formally.' },
      toneNote: 'This friend is casual; be warm and informal.',
    });
    expect(p.indexOf('email')).toBeLessThan(p.indexOf('Write formally.'));
    expect(p.indexOf('Write formally.')).toBeLessThan(p.indexOf('casual'));
  });

  it('omits absent sections', () => {
    const p = buildSystemPrompt({ type: 'chat', styleProfile: null, toneNote: null });
    expect(p).not.toContain('[Style profile]');
    expect(p).not.toContain('[Tone note]');
  });
});
