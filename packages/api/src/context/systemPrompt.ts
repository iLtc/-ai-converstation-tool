import type { ConversationType } from '@app/shared';

export interface SystemPromptInput {
  type: ConversationType;
  styleProfile: { instructions: string } | null;
  toneNote: string | null;
}

const TYPE_GUIDANCE: Record<ConversationType, string> = {
  chat: 'You are drafting a chat message. Keep it conversational and concise.',
  email: 'You are drafting an email. Use an appropriate subject line and structure.',
};

/**
 * Sections run general -> specific so the more specific (later) instruction wins:
 * type guidance -> style profile -> tone note.
 */
export function buildSystemPrompt(input: SystemPromptInput): string {
  const sections: string[] = [
    'You help the user draft messages. When you reply, call the `respond` tool: ' +
    'put any answers to the user\'s questions in `answers.items`, and the editable ' +
    'message in `draft`. If a later instruction conflicts with an earlier one, follow the later one.',
    `[Message type: ${input.type}]\n${TYPE_GUIDANCE[input.type]}`,
  ];
  if (input.styleProfile) sections.push(`[Style profile]\n${input.styleProfile.instructions}`);
  if (input.toneNote) sections.push(`[Tone note]\n${input.toneNote}`);
  return sections.join('\n\n');
}
