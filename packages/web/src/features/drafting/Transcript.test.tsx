import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.tsx';
import { Transcript } from './Transcript.tsx';
import type { DraftTurn } from '../../api/types.ts';

const turns: DraftTurn[] = [
  { id: 't1', sessionId: 's1', position: 100, role: 'user', kind: 'brief', content: { goal: 'Reply warmly' }, provider: null, model: null, createdAt: '' },
  { id: 't2', sessionId: 's1', position: 200, role: 'assistant', kind: 'answers', content: { items: ['Be kind'] }, provider: 'anthropic', model: 'claude-opus-4-8', createdAt: '' },
  { id: 't3', sessionId: 's1', position: 300, role: 'assistant', kind: 'draft', content: { body: 'Hello friend!' }, provider: 'anthropic', model: 'claude-opus-4-8', createdAt: '' },
];

it('renders all turns and marks the latest draft current', () => {
  renderWithProviders(<Transcript turns={turns} onRestore={() => {}} />);
  expect(screen.getByText('Reply warmly')).toBeInTheDocument();
  expect(screen.getByText('Be kind')).toBeInTheDocument();
  expect(screen.getByText('Hello friend!')).toBeInTheDocument();
  expect(screen.getByText(/draft · current/i)).toBeInTheDocument();
});
