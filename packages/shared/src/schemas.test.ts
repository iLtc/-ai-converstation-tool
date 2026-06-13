import { describe, it, expect } from 'vitest';
import {
  DraftContent, BriefContent, RespondOutput, contentSchemaForKind,
} from './schemas.js';

describe('content schemas', () => {
  it('accepts a draft with optional subject', () => {
    expect(DraftContent.parse({ body: 'hi' })).toEqual({ body: 'hi' });
    expect(DraftContent.parse({ subject: 'Re: x', body: 'hi' }).subject).toBe('Re: x');
  });

  it('rejects an empty draft body', () => {
    expect(() => DraftContent.parse({ body: '' })).toThrow();
  });

  it('requires a brief goal', () => {
    expect(() => BriefContent.parse({})).toThrow();
    expect(BriefContent.parse({ goal: 'ask for extension' }).goal).toBe('ask for extension');
  });

  it('validates RespondOutput with optional answers', () => {
    const out = RespondOutput.parse({ draft: { body: 'draft text' } });
    expect(out.answers).toBeUndefined();
  });

  it('maps kind to the right content schema', () => {
    expect(contentSchemaForKind('edit')).toBe(DraftContent);
  });
});
