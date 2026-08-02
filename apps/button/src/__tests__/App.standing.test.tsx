import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MockAffiliationApiClient } from '../api/affiliationClient';
import { MockButtonApiClient } from '../api/client';
import { renderApp, FakeButtonApiClient } from '../test/testUtils';
import { contextWith } from '../test/fixtures';

/** A context client that always resolves an active, selected representative context for club-1. */
function activeContextClient(): FakeButtonApiClient {
  return new FakeButtonApiClient(() =>
    Promise.resolve(contextWith({ selected: true, authorityStatus: 'active' })),
  );
}

describe('Button affiliation standing views (read-only)', () => {
  it('lists governed standing records with derived expiry, bilingually', async () => {
    const user = userEvent.setup();
    renderApp({
      client: activeContextClient(),
      affiliationClient: new MockAffiliationApiClient(),
      initialEntries: ['/button/standing'],
    });

    await screen.findByRole('heading', { name: 'Affiliation standing' });
    // Active record shows governed status + clock-derived expiry hint.
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Expires in 120 day(s)')).toBeInTheDocument();
    // Lapsed record surfaces the governed renewal-required fact (never a claim).
    expect(screen.getByText('Lapsed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This standing has lapsed. Renewal is required to re-establish an active affiliation.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Français' }));
    expect(await screen.findByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Expire dans 120 jour(s)')).toBeInTheDocument();
    expect(screen.getByText('Expir\u00e9')).toBeInTheDocument();
  });

  it('opens a standing detail with the effective period', async () => {
    const user = userEvent.setup();
    renderApp({
      client: activeContextClient(),
      affiliationClient: new MockAffiliationApiClient(),
      initialEntries: ['/button/standing'],
    });

    await screen.findByRole('heading', { name: 'Affiliation standing' });
    await user.click(screen.getAllByRole('link', { name: 'View standing detail' })[0]!);

    await screen.findByRole('heading', { name: 'Affiliation standing detail' });
    expect(screen.getByText('Affiliation application')).toBeInTheDocument();
    expect(screen.getByText('review-app-0001')).toBeInTheDocument();
    expect(screen.getByText('Effective from')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to standing' }));
    await screen.findByRole('heading', { name: 'Affiliation standing' });
  });

  it('shows an opaque not-found message for an out-of-scope standing id', async () => {
    renderApp({
      client: activeContextClient(),
      affiliationClient: new MockAffiliationApiClient(),
      initialEntries: ['/button/standing/standing-does-not-exist'],
    });

    await screen.findByRole('heading', { name: 'Affiliation standing detail' });
    expect(
      await screen.findByText('This standing record is not available for your current context.'),
    ).toBeInTheDocument();
  });

  it('denies representatives without the standing-view capability', async () => {
    renderApp({
      client: new MockButtonApiClient('representative'),
      affiliationClient: new MockAffiliationApiClient(),
      initialEntries: ['/button/standing'],
    });
    await screen.findByRole('heading', { name: 'Access not available' });
  });
});
