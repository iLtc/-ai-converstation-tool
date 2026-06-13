import { describe, it, expect } from 'vitest';
import { resolveProviderModel } from './registry.js';

describe('resolveProviderModel', () => {
  const defaults = { provider: 'anthropic', model: 'claude-opus-4-8' };

  it('uses defaults when the conversation has no overrides', () => {
    expect(resolveProviderModel({ provider: null, model: null }, defaults))
      .toEqual({ provider: 'anthropic', model: 'claude-opus-4-8' });
  });

  it('prefers conversation overrides', () => {
    expect(resolveProviderModel({ provider: 'openai', model: 'gpt-4o' }, defaults))
      .toEqual({ provider: 'openai', model: 'gpt-4o' });
  });

  it('derives provider from the model metadata when only model is overridden', () => {
    expect(resolveProviderModel({ provider: null, model: 'gpt-4o' }, defaults))
      .toEqual({ provider: 'openai', model: 'gpt-4o' });
  });

  it('fails loud for an unknown model override', () => {
    expect(() => resolveProviderModel({ provider: null, model: 'nope' }, defaults)).toThrow(/unknown model/i);
  });

  it('rejects a provider override that does not serve the model', () => {
    expect(() => resolveProviderModel({ provider: 'anthropic', model: 'gpt-4o' }, defaults))
      .toThrow(/does not serve/i);
  });
});
