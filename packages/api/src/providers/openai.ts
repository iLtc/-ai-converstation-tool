import type OpenAI from 'openai';
import { encode } from 'gpt-tokenizer';
import { RespondOutput } from '@app/shared';
import { ProviderError } from '../errors.js';
import {
  RESPOND_TOOL_NAME, RESPOND_TOOL_DESCRIPTION, respondInputSchema,
} from './respondTool.js';
import type {
  Provider, CompleteRequest, CompleteResult, CompleteTextRequest, CountTokensInput,
} from './types.js';

export class OpenAIProvider implements Provider {
  readonly name = 'openai' as const;
  constructor(private readonly client: Pick<OpenAI, 'chat'>) {}

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    let res: any;
    try {
      res = await this.client.chat.completions.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        messages: [
          { role: 'system', content: req.system },
          ...req.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        tools: [{
          type: 'function',
          function: {
            name: RESPOND_TOOL_NAME,
            description: RESPOND_TOOL_DESCRIPTION,
            parameters: respondInputSchema as any,
          },
        }],
        tool_choice: { type: 'function', function: { name: RESPOND_TOOL_NAME } },
      });
    } catch (err) {
      throw toProviderError(err);
    }
    const call = res.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new ProviderError('OpenAI returned no tool call', false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch {
      throw new ProviderError('OpenAI tool arguments were not valid JSON', false);
    }
    const output = RespondOutput.parse(parsed);
    return { output, provider: this.name, model: req.model };
  }

  async completeText(req: CompleteTextRequest): Promise<string> {
    let res: any;
    try {
      res = await this.client.chat.completions.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        messages: [
          { role: 'system', content: req.system },
          ...req.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
    } catch (err) {
      throw toProviderError(err);
    }
    return res.choices?.[0]?.message?.content ?? '';
  }

  async countTokens(input: CountTokensInput): Promise<number> {
    // OpenAI has no count endpoint; tokenize locally. Approximate per-message
    // overhead (~4 tokens/message) is folded into the global safety margin.
    const parts = [input.system, ...input.messages.map((m) => m.content)];
    return parts.reduce((sum, p) => sum + encode(p).length, 0);
  }
}

function toProviderError(err: unknown): ProviderError {
  const status = (err as any)?.status;
  const retryable = status === 429 || (typeof status === 'number' && status >= 500);
  return new ProviderError(`OpenAI request failed: ${(err as Error).message}`, retryable);
}
