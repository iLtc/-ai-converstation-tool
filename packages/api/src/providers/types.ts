import type { RespondOutput } from '@app/shared';
import type { ProviderName } from './modelConfig.js';

export type { ProviderName };

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompleteRequest {
  system: string;
  messages: ProviderMessage[];
  model: string;
  maxOutputTokens: number;
}

export interface CompleteResult {
  output: RespondOutput;     // validated { answers?, draft }
  provider: ProviderName;
  model: string;
}

/** Plain-text completion request — same shape as CompleteRequest. */
export type CompleteTextRequest = CompleteRequest;

export interface CountTokensInput {
  system: string;
  messages: ProviderMessage[];
  model: string;
}

export interface Provider {
  readonly name: ProviderName;
  /** Forces the structured respond({ answers?, draft }) tool. */
  complete(req: CompleteRequest): Promise<CompleteResult>;
  /** Plain-text completion (used for on-send summaries). */
  completeText(req: CompleteTextRequest): Promise<string>;
  /** Token count of the assembled input, for budgeting. */
  countTokens(input: CountTokensInput): Promise<number>;
}
