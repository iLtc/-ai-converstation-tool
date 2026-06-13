/** JSON Schema for the forced respond tool. Shared by both vendors. */
export const RESPOND_TOOL_NAME = 'respond';

export const respondInputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    answers: {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: { type: 'array', items: { type: 'string' } },
      },
      required: ['items'],
    },
    draft: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['body'],
    },
  },
  required: ['draft'],
};

export const RESPOND_TOOL_DESCRIPTION =
  'Return your reply. Put answers to the user\'s questions in `answers.items` ' +
  '(omit if none), and the editable message draft in `draft` (`subject` only for emails).';
