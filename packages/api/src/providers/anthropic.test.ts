import { runProviderContract, type ContractHarness } from './contractTests.js';
import { AnthropicProvider } from './anthropic.js';

/** Minimal fake of the Anthropic SDK surface the provider touches. */
function makeHarness(): ContractHarness {
  let toolInput: unknown = { draft: { body: 'x' } };
  let text = '';
  let lastReq: any = null;
  let queuedError: { status: number } | null = null;
  const maybeThrow = () => {
    if (queuedError) { throw Object.assign(new Error('simulated'), { status: queuedError.status }); }
  };
  const client: any = {
    messages: {
      create: async (req: any) => {
        lastReq = req;
        maybeThrow();
        if (req.tool_choice) {
          return { content: [{ type: 'tool_use', name: 'respond', input: toolInput }] };
        }
        return { content: [{ type: 'text', text }] };
      },
    },
    beta: {
      messages: {
        countTokens: async (_req: any) => { maybeThrow(); return { input_tokens: 42 }; },
      },
    },
  };
  const provider = new AnthropicProvider(client);
  return {
    provider,
    simulateRespond: (raw) => { toolInput = raw; },
    simulateText: (t) => { text = t; },
    simulateError: (status) => { queuedError = { status }; },
    lastCompleteRequest: () => lastReq,
  };
}

runProviderContract('anthropic', makeHarness);
