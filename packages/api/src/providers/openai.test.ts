import { runProviderContract, type ContractHarness } from './contractTests.js';
import { OpenAIProvider } from './openai.js';

function makeHarness(): ContractHarness {
  let toolArgs: unknown = { draft: { body: 'x' } };
  let text = '';
  let lastReq: any = null;
  const client: any = {
    chat: {
      completions: {
        create: async (req: any) => {
          lastReq = req;
          if (req.tools) {
            return {
              choices: [{
                message: {
                  tool_calls: [{
                    function: { name: 'respond', arguments: JSON.stringify(toolArgs) },
                  }],
                },
              }],
            };
          }
          return { choices: [{ message: { content: text } }] };
        },
      },
    },
  };
  const provider = new OpenAIProvider(client);
  return {
    provider,
    simulateRespond: (raw) => { toolArgs = raw; },
    simulateText: (t) => { text = t; },
    lastCompleteRequest: () => lastReq,
  };
}

runProviderContract('openai', makeHarness);
