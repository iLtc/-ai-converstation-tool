import { expect, it, describe } from 'vitest';
import type { Provider } from './types.js';

/** What each provider test supplies to exercise the shared contract. */
export interface ContractHarness {
  provider: Provider;
  /** Queue the raw tool output the fake SDK should return from complete(). */
  simulateRespond(raw: unknown): void;
  /** Queue the plain text the fake SDK should return from completeText(). */
  simulateText(text: string): void;
  /** The request object handed to the fake SDK on the last complete() call. */
  lastCompleteRequest(): any;
}

export function runProviderContract(label: string, makeHarness: () => ContractHarness): void {
  describe(`${label} provider contract`, () => {
    it('returns a validated respond output', async () => {
      const h = makeHarness();
      h.simulateRespond({ answers: { items: ['yes'] }, draft: { body: 'Hello' } });
      const res = await h.provider.complete({
        system: 'sys', messages: [{ role: 'user', content: 'hi' }],
        model: 'm', maxOutputTokens: 100,
      });
      expect(res.output.draft.body).toBe('Hello');
      expect(res.output.answers?.items).toEqual(['yes']);
      expect(res.provider).toBe(h.provider.name);
    });

    it('forces the respond tool on the request', async () => {
      const h = makeHarness();
      h.simulateRespond({ draft: { body: 'x' } });
      await h.provider.complete({
        system: 's', messages: [{ role: 'user', content: 'hi' }],
        model: 'm', maxOutputTokens: 50,
      });
      const sent = JSON.stringify(h.lastCompleteRequest());
      expect(sent).toContain('respond'); // tool_choice names the respond tool
    });

    it('throws when the model returns a malformed draft', async () => {
      const h = makeHarness();
      h.simulateRespond({ draft: {} }); // missing body
      await expect(h.provider.complete({
        system: 's', messages: [{ role: 'user', content: 'hi' }],
        model: 'm', maxOutputTokens: 50,
      })).rejects.toThrow();
    });

    it('completeText returns plain text', async () => {
      const h = makeHarness();
      h.simulateText('a summary');
      const out = await h.provider.completeText({
        system: 's', messages: [{ role: 'user', content: 'summarize' }],
        model: 'm', maxOutputTokens: 100,
      });
      expect(out).toBe('a summary');
    });

    it('countTokens returns a positive number', async () => {
      const h = makeHarness();
      const n = await h.provider.countTokens({
        system: 'system text', messages: [{ role: 'user', content: 'hello world' }], model: 'm',
      });
      expect(n).toBeGreaterThan(0);
    });
  });
}
