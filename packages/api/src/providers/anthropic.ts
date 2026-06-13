import Anthropic from '@anthropic-ai/sdk';
import { RespondOutput } from '@app/shared';
import { ProviderError } from '../errors.js';
import {
  RESPOND_TOOL_NAME, RESPOND_TOOL_DESCRIPTION, respondInputSchema,
} from './respondTool.js';
import type {
  Provider, CompleteRequest, CompleteResult, CompleteTextRequest, CountTokensInput,
} from './types.js';

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic' as const;
  constructor(private readonly client: Pick<Anthropic, 'messages' | 'beta'>) {}

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    let res: any;
    try {
      res = await this.client.messages.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: [{
          name: RESPOND_TOOL_NAME,
          description: RESPOND_TOOL_DESCRIPTION,
          input_schema: respondInputSchema as any,
        }],
        tool_choice: { type: 'tool', name: RESPOND_TOOL_NAME },
      });
    } catch (err) {
      throw toProviderError(err);
    }
    const block = (res.content ?? []).find((b: any) => b.type === 'tool_use');
    if (!block) throw new ProviderError('Anthropic returned no tool_use block', false);
    const output = RespondOutput.parse(block.input);
    return { output, provider: this.name, model: req.model };
  }

  async completeText(req: CompleteTextRequest): Promise<string> {
    let res: any;
    try {
      res = await this.client.messages.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      });
    } catch (err) {
      throw toProviderError(err);
    }
    return (res.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
  }

  async countTokens(input: CountTokensInput): Promise<number> {
    try {
      const res = await this.client.beta.messages.countTokens({
        model: input.model,
        system: input.system,
        messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      } as any);
      return res.input_tokens;
    } catch (err) {
      throw toProviderError(err);
    }
  }
}

function toProviderError(err: unknown): ProviderError {
  const status = (err as any)?.status;
  const retryable = status === 429 || (typeof status === 'number' && status >= 500);
  return new ProviderError(`Anthropic request failed: ${(err as Error).message}`, retryable);
}
