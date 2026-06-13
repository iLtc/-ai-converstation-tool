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

/** Renders a session's curated triple: brief + AI answers + final draft (only present sections). */
export function renderSessionFull(turns: RenderTurn[]): string {
  const brief = turns.find((t) => t.kind === 'brief');
  const answers = turns.find((t) => t.kind === 'answers');
  const draft = latestDraftOrEdit(turns);
  const sections: string[] = [];
  if (brief) sections.push(`[Brief]\n${renderBrief(brief.content as BriefContent)}`);
  if (answers) sections.push(`[AI answers]\n${renderAnswers(answers.content as AnswersContent)}`);
  if (draft) sections.push(`[Final draft]\n${renderDraft(draft)}`);
  return sections.join('\n\n');
}

/**
 * Curates a *prior* (sent) draft session into brief + answers + final draft,
 * excluding intermediate revisions. Priors always have a summary.
 */
export function curateSession(input: CurateInput): CuratedSession {
  if (input.summary == null) {
    throw new Error(`Prior session ${input.sessionId} has no summary; cannot curate for context`);
  }
  return { sessionId: input.sessionId, full: renderSessionFull(input.turns), summary: input.summary };
}
