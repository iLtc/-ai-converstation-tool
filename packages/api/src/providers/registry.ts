import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getModelMeta, type ProviderName } from './modelConfig.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import type { Provider } from './types.js';

export interface ProviderModel { provider: ProviderName; model: string; }

/** Resolves the effective provider/model from conversation overrides + defaults. */
export function resolveProviderModel(
  overrides: { provider: string | null; model: string | null },
  defaults: { provider: string; model: string },
): ProviderModel {
  const model = overrides.model ?? defaults.model;
  const meta = getModelMeta(model); // fails loud on unknown model
  if (overrides.provider && overrides.provider !== meta.provider) {
    throw new Error(
      `Provider "${overrides.provider}" does not serve model "${model}" (a ${meta.provider} model)`,
    );
  }
  // If the caller specified a provider, honor it; otherwise derive from the model.
  const provider = (overrides.provider ?? (overrides.model ? meta.provider : defaults.provider)) as ProviderName;
  return { provider, model };
}

/** Builds a live Provider with a real SDK client. Injected into services. */
export type ProviderFactory = (name: ProviderName) => Provider;

// Builds a fresh SDK client per call — construct once at startup and reuse the
// returned Provider rather than calling this per request.
export const defaultProviderFactory: ProviderFactory = (name) => {
  if (name === 'anthropic') {
    return new AnthropicProvider(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
  }
  return new OpenAIProvider(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
};
