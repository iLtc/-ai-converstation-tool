import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { server } from '../../test/msw.ts';
import { renderWithProviders } from '../../test/renderWithProviders.tsx';
import { Timeline } from './Timeline.tsx';
import type { Conversation, Message } from '../../api/types.ts';

const conv: Conversation = {
  id: 'c1', userId: 'u1', title: 'T', type: 'chat', emailSubject: null, toneNote: null,
  styleProfileId: null, provider: null, model: null, createdAt: '', updatedAt: '',
  participants: [
    { id: 'pme', conversationId: 'c1', displayName: 'Me', role: 'me' },
    { id: 'pthem', conversationId: 'c1', displayName: 'Sam', role: 'them' },
  ],
};
const messages: Message[] = [
  { id: 'm1', conversationId: 'c1', senderParticipantId: 'pthem', body: 'Hi there', kind: 'reconstructed', status: 'received', position: 100, createdAt: '' },
  { id: 'm2', conversationId: 'c1', senderParticipantId: 'pme', body: 'Hello back', kind: 'live', status: 'sent', position: 200, createdAt: '' },
];

it('renders messages with sender names', async () => {
  server.use(http.get('/api/conversations/c1/messages', () => HttpResponse.json(messages)));
  renderWithProviders(<Timeline conversation={conv} />);
  expect(await screen.findByText('Hi there')).toBeInTheDocument();
  expect(await screen.findByText('Hello back')).toBeInTheDocument();
  expect(screen.getByText('Sam')).toBeInTheDocument();
});
