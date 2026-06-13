import { ContextTooLargeError, NeedsManualSelectionError } from '../errors.js';
import type { CuratedSession } from './curate.js';

export interface AssembleInput {
  system: string;
  timeline: string;          // incompressible
  current: string;           // incompressible (current session, full)
  priors: CuratedSession[];  // oldest -> newest
  budget: number;            // inputBudget(model)
  /** Counts tokens of the assembled (system + userContent) text. */
  countText: (text: string) => Promise<number>;
}

export interface AssembleResult {
  userContent: string;
  usedSummaryFor: string[]; // session ids rendered as summaries
}

/**
 * Builds the single user-message string, preferring full curated priors and
 * sliding the OLDEST priors to summaries one at a time until under budget.
 */
export async function assembleContext(input: AssembleInput): Promise<AssembleResult> {
  // false = full, true = summarized. Start all full.
  const summarized = input.priors.map(() => false);

  const build = () => {
    const priorBlocks = input.priors.map((p, i) =>
      summarized[i] ? p.summary : p.full,
    );
    return [input.timeline, priorBlocks.join('\n\n') || '(none)', input.current].join('\n\n');
  };

  const total = async () => input.countText(input.system + '\n' + build());

  if ((await total()) <= input.budget) {
    return { userContent: build(), usedSummaryFor: [] };
  }

  // Slide oldest -> newest to summaries until it fits.
  for (let i = 0; i < summarized.length; i++) {
    summarized[i] = true;
    if ((await total()) <= input.budget) {
      return { userContent: build(), usedSummaryFor: idsOf(input.priors, summarized) };
    }
  }

  // Still over budget with everything summarized. Is the incompressible part alone too big?
  const incompressible = [input.system, input.timeline, input.current].join('\n');
  if ((await input.countText(incompressible)) > input.budget) {
    throw new ContextTooLargeError(
      'Conversation timeline and current session alone exceed the model context budget',
    );
  }
  // Incompressible fits, but priors don't even as summaries — defer to manual selection.
  throw new NeedsManualSelectionError(input.priors.map((p) => p.sessionId));
}

function idsOf(priors: CuratedSession[], summarized: boolean[]): string[] {
  return priors.filter((_, i) => summarized[i]).map((p) => p.sessionId);
}
