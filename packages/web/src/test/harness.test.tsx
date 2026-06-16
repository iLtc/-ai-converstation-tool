import { screen } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders.tsx';

it('renders through providers', () => {
  renderWithProviders(<div>hello harness</div>);
  expect(screen.getByText('hello harness')).toBeInTheDocument();
});
