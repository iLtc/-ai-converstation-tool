import { renderBrief, renderAnswers, renderDraft, latestDraftOrEdit, type RenderTurn } from './render.js';
import type { BriefContent, AnswersContent } from '@app/shared';

export interface CuratedSession {
  sessionId: string;
  full: string;     // brief + answers + final draft
  summary: string;  // stored summary, used under context pressure
}

export interface CurateInput {
  sessionId: string;
  summary: string | null;
  turns: RenderTurn[];
}

/**
 * Curates a *prior* (sent) draft session into brief + answers + final draft,
 * excluding intermediate revisions. Priors always have a summary.
 */
export function curateSession(input: CurateInput): CuratedSession {
  if (input.summary == null) {
    throw new Error(`Prior session ${input.sessionId} has no summary; cannot curate for context`);
  }
  // A session has at most one brief and one answers turn, so find() (first match) is correct;
  // only the draft/edit turn can repeat, which is why latestDraftOrEdit scans in reverse.
  const brief = input.turns.find((t) => t.kind === 'brief');
  const answers = input.turns.find((t) => t.kind === 'answers');
  const draft = latestDraftOrEdit(input.turns);

  const sections: string[] = [];
  if (brief) sections.push(`[Brief]\n${renderBrief(brief.content as BriefContent)}`);
  if (answers) sections.push(`[AI answers]\n${renderAnswers(answers.content as AnswersContent)}`);
  if (draft) sections.push(`[Final draft]\n${renderDraft(draft)}`);

  return { sessionId: input.sessionId, full: sections.join('\n\n'), summary: input.summary };
}
