import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders.tsx';
import { BriefForm } from './BriefForm.tsx';

it('requires a goal before submitting', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(<BriefForm onSubmit={onSubmit} pending={false} />);
  await userEvent.click(screen.getByRole('button', { name: /start drafting/i }));
  expect(onSubmit).not.toHaveBeenCalled();
});

it('submits the brief when a goal is provided', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(<BriefForm onSubmit={onSubmit} pending={false} />);
  await userEvent.type(screen.getByLabelText(/goal/i), 'Reply warmly');
  await userEvent.type(screen.getByLabelText(/background/i), 'Old friend');
  await userEvent.click(screen.getByRole('button', { name: /start drafting/i }));
  expect(onSubmit).toHaveBeenCalledWith({ goal: 'Reply warmly', background: 'Old friend', questions: undefined });
});
