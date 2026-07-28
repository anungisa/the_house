import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MockButtonApiClient } from '../api/client';
import { MockAffiliationApiClient } from '../api/affiliationClient';
import { renderApp } from '../test/testUtils';

describe('Button affiliation reviewer workbench', () => {
  it('shows only the authorized queue and starts review with explicit confirmation intent', async () => {
    const user = userEvent.setup();
    renderApp({
      client: new MockButtonApiClient('reviewer'),
      affiliationClient: new MockAffiliationApiClient(),
      initialEntries: ['/button/review'],
    });

    await screen.findByRole('heading', { name: 'Affiliation review queue' });
    expect(screen.getByText('Affiliation case review-app-0001')).toBeInTheDocument();
    expect(screen.getByText('Awaiting review')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start review' }));
    expect(await screen.findByText('Under review')).toBeInTheDocument();
    expect(screen.getByText('Assigned to you')).toBeInTheDocument();
  });

  it('denies a representative without reviewer capability', async () => {
    renderApp({
      client: new MockButtonApiClient('representative'),
      affiliationClient: new MockAffiliationApiClient(),
      initialEntries: ['/button/review'],
    });
    await screen.findByRole('heading', { name: 'Access not available' });
  });
});
