export type ProviderName = 'anthropic' | 'openai';

export interface ModelMeta {
  provider: ProviderName;
  contextWindow: number; // total tokens
  outputReserve: number; // tokens reserved for the model's output
}

/** Global safety margin subtracted from every input budget. */
export const SAFETY_MARGIN = 2000;

/**
 * Static, code-checked model metadata. Edit this map when adopting a new model.
 * An unknown model id fails loud rather than guessing a context window.
 */
export const MODELS: Record<string, ModelMeta> = {
  'claude-opus-4-8': { provider: 'anthropic', contextWindow: 200_000, outputReserve: 8_000 },
  'claude-sonnet-4-6': { provider: 'anthropic', contextWindow: 200_000, outputReserve: 8_000 },
  'claude-haiku-4-5-20251001': { provider: 'anthropic', contextWindow: 200_000, outputReserve: 8_000 },
  'gpt-4.1': { provider: 'openai', contextWindow: 1_000_000, outputReserve: 16_000 },
  'gpt-4o': { provider: 'openai', contextWindow: 128_000, outputReserve: 8_000 },
};

export function getModelMeta(model: string): ModelMeta {
  const meta = MODELS[model];
  if (!meta) {
    throw new Error(`Unknown model "${model}" — add it to MODELS in providers/modelConfig.ts`);
  }
  return meta;
}

/** Token budget available for assembled input for this model. */
export function inputBudget(model: string): number {
  const m = getModelMeta(model);
  return m.contextWindow - m.outputReserve - SAFETY_MARGIN;
}
