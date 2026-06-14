import { describe, it, expect } from 'vitest';
import {
  DraftContent, BriefContent, AnswersContent, FollowupContent, RespondOutput, contentSchemaForKind,
  UpdateConversationInput,
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

  it('maps kind to the right content schema (incl. draft/edit fall-through)', () => {
    expect(contentSchemaForKind('brief')).toBe(BriefContent);
    expect(contentSchemaForKind('answers')).toBe(AnswersContent);
    expect(contentSchemaForKind('draft')).toBe(DraftContent);
    expect(contentSchemaForKind('edit')).toBe(DraftContent);
    expect(contentSchemaForKind('followup')).toBe(FollowupContent);
  });
});

describe('UpdateConversationInput', () => {
  it('accepts an empty object (no-op patch)', () => {
    expect(UpdateConversationInput.parse({})).toEqual({});
  });

  it('allows clearing nullable fields with null', () => {
    const parsed = UpdateConversationInput.parse({
      toneNote: null, styleProfileId: null, provider: null, model: null, emailSubject: null,
    });
    expect(parsed).toEqual({ toneNote: null, styleProfileId: null, provider: null, model: null, emailSubject: null });
  });

  it('accepts editable fields', () => {
    const parsed = UpdateConversationInput.parse({
      title: 'New', type: 'email', emailSubject: 'Hi', theirName: 'Sam', myName: 'Me',
    });
    expect(parsed.title).toBe('New');
    expect(parsed.type).toBe('email');
  });

  it('rejects an empty title', () => {
    expect(() => UpdateConversationInput.parse({ title: '' })).toThrow();
  });

  it('rejects an empty theirName or myName', () => {
    expect(() => UpdateConversationInput.parse({ theirName: '' })).toThrow();
    expect(() => UpdateConversationInput.parse({ myName: '' })).toThrow();
  });
});
