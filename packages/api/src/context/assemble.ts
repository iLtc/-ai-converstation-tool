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

  const buildWith = (priorSection: string) => [
    '[Conversation timeline]', input.timeline,
    '', '[Prior drafting sessions]', priorSection,
    '', '[Current session]', input.current,
  ].join('\n');

  const build = () => {
    const priorBlocks = input.priors.map((p, i) =>
      `[Prior session ${p.sessionId}]\n${summarized[i] ? p.summary : p.full}`,
    );
    return buildWith(priorBlocks.join('\n\n') || '(none)');
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
  // Measure the SAME formatted output build() produces, but with no prior sessions —
  // this is the floor below which compression cannot help.
  const incompressible = input.system + '\n' + buildWith('(none)');
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
