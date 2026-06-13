import type {
  BriefContent, AnswersContent, DraftContent, FollowupContent,
} from '@app/shared';

export interface RenderTurn {
  kind: string;
  content: BriefContent | AnswersContent | DraftContent | FollowupContent;
}

export function renderBrief(b: BriefContent): string {
  const lines = [`Goal: ${b.goal}`];
  if (b.background) lines.push(`Background: ${b.background}`);
  if (b.questions) lines.push(`Questions: ${b.questions}`);
  return lines.join('\n');
}

export function renderAnswers(a: AnswersContent): string {
  return a.items.map((x, i) => `${i + 1}. ${x}`).join('\n');
}

export function renderDraft(d: DraftContent): string {
  return d.subject ? `Subject: ${d.subject}\n\n${d.body}` : d.body;
}

/** Latest draft- or edit-kind turn in a turn list, or null. */
export function latestDraft(turns: RenderTurn[]): DraftContent | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.kind === 'draft' || t.kind === 'edit') return t.content as DraftContent;
  }
  return null;
}

/** Renders the real message timeline. */
export function renderTimeline(
  messages: { body: string; senderRole: 'me' | 'them'; displayName: string }[],
): string {
  if (messages.length === 0) return '(no prior messages)';
  return messages.map((m) => `${m.displayName} (${m.senderRole}): ${m.body}`).join('\n');
}
