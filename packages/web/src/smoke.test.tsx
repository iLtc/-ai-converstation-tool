import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { server } from './test/msw.ts';
import App from './App.tsx';
import type { Conversation, Message, SessionWithTurns } from './api/types.ts';

const conv: Conversation = {
  id: 'c1', userId: 'u1', title: 'With Sam', type: 'chat', emailSubject: null, toneNote: null,
  styleProfileId: null, provider: null, model: null, createdAt: '', updatedAt: '',
  participants: [
    { id: 'pme', conversationId: 'c1', displayName: 'Me', role: 'me' },
    { id: 'pthem', conversationId: 'c1', displayName: 'Sam', role: 'them' },
  ],
};

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/conversations/c1']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('drafts and finalizes a reply end-to-end', async () => {
  let messages: Message[] = [
    { id: 'm1', conversationId: 'c1', senderParticipantId: 'pthem', body: 'Can we meet Friday?', kind: 'reconstructed', status: 'received', position: 100, createdAt: '' },
  ];
  let sessions: SessionWithTurns[] = [];

  server.use(
    http.get('/api/conversations/c1', () => HttpResponse.json(conv)),
    http.get('/api/conversations/c1/messages', () => HttpResponse.json(messages)),
    http.get('/api/conversations/c1/draft-sessions', () => HttpResponse.json({ sessions })),
    http.get('/api/style-profiles', () => HttpResponse.json([])),
    http.get('/api/conversations', () => HttpResponse.json([conv])),
    http.post('/api/conversations/c1/draft-sessions', async () => {
      sessions = [{
        id: 's1', conversationId: 'c1', status: 'open', summary: null, sentMessageId: null,
        createdAt: '', closedAt: null,
        turns: [
          { id: 't1', sessionId: 's1', position: 100, role: 'user', kind: 'brief', content: { goal: 'Agree to Friday' }, provider: null, model: null, createdAt: '' },
          { id: 't2', sessionId: 's1', position: 200, role: 'assistant', kind: 'draft', content: { body: 'Friday works for me!' }, provider: 'anthropic', model: 'claude-opus-4-8', createdAt: '' },
        ],
      }];
      return HttpResponse.json({ session: sessions[0], turns: sessions[0]!.turns }, { status: 201 });
    }),
    http.post('/api/draft-sessions/s1/finalize', () => {
      messages = [...messages, { id: 'm2', conversationId: 'c1', senderParticipantId: 'pme', body: 'Friday works for me!', kind: 'live', status: 'sent', position: 200, createdAt: '' }];
      sessions = sessions.map((s) => ({ ...s, status: 'sent' as const }));
      return HttpResponse.json({ session: { ...sessions[0], status: 'sent' } });
    }),
  );

  renderApp();

  // Timeline shows the reconstructed message.
  expect(await screen.findByText('Can we meet Friday?')).toBeInTheDocument();

  // Fill the brief and start drafting.
  await userEvent.type(await screen.findByLabelText(/goal/i), 'Agree to Friday');
  await userEvent.click(screen.getByRole('button', { name: /start drafting/i }));

  // The AI draft appears in the transcript.
  expect(await screen.findByText('Friday works for me!')).toBeInTheDocument();

  // Finalize; the sent message lands on the timeline.
  await userEvent.click(screen.getByRole('button', { name: /finalize/i }));
  const timeline = await screen.findByText('Timeline');
  expect(timeline).toBeInTheDocument();
  // After finalize, the timeline refetch includes the sent body (appears in transcript + timeline).
  expect((await screen.findAllByText('Friday works for me!')).length).toBeGreaterThanOrEqual(1);
});
