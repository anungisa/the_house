import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MockButtonApiClient } from '../api/client';
import { MockAffiliationApiClient } from '../api/affiliationClient';
import { renderApp } from '../test/testUtils';

describe('Button affiliation finance workbench', () => {
  it('shows persisted financial facts and executes governed reconciliation bilingually', async () => {
    const user = userEvent.setup();
    renderApp({
      client: new MockButtonApiClient('finance'),
      affiliationClient: new MockAffiliationApiClient(),
      initialEntries: ['/button/finance'],
    });

    await screen.findByRole('heading', { name: 'Affiliation finance workbench' });
    expect(screen.getAllByText('$250.00')).toHaveLength(2);
    expect(screen.getByText('Accounting confirmed — reconciliation required')).toBeInTheDocument();
    expect(
      screen.getByText('Blocks affiliation activation until financially cleared'),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText('Reconciliation rationale'),
      'Accounting-confirmed amount matches the current assessment.',
    );
    await user.click(screen.getByRole('button', { name: 'Reconcile confirmed amount' }));
    expect(await screen.findByText('Reconciled')).toBeInTheDocument();
    expect(
      screen.getByText('Financially cleared for affiliation activation'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Français' }));
    expect(await screen.findByText('Rapprochée')).toBeInTheDocument();
    expect(
      screen.getByText('Autorisation financière obtenue pour l’activation de l’affiliation'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/250,00/)).toHaveLength(2);
  });

  it('denies users without the finance-workbench capability', async () => {
    renderApp({
      client: new MockButtonApiClient('representative'),
      affiliationClient: new MockAffiliationApiClient(),
      initialEntries: ['/button/finance'],
    });
    await screen.findByRole('heading', { name: 'Access not available' });
  });
});
