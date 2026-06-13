import { getModelMeta } from '../providers/modelConfig.js';
import type { Provider } from '../providers/types.js';

const SUMMARY_SYSTEM =
  'Summarize the drafting session below into a few sentences capturing the goal, ' +
  'key decisions, and the gist of the final draft. This summary may later replace ' +
  'the full session as context, so preserve what would matter for future drafts.';

/** Generates the on-send summary of a session's curated triple (brief + answers + final draft). */
export async function generateSummary(
  provider: Provider, model: string, curatedFull: string,
): Promise<string> {
  const reserve = getModelMeta(model).outputReserve;
  return provider.completeText({
    system: SUMMARY_SYSTEM,
    messages: [{ role: 'user', content: curatedFull }],
    model,
    maxOutputTokens: Math.min(1024, reserve),
  });
}
