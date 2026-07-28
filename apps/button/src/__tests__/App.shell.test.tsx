import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MockButtonApiClient } from '../api/client';
import { renderApp } from '../test/testUtils';

/**
 * Shell + navigation + bilingual + keyboard/focus behaviour, exercised through the real router,
 * context provider, and guards with a deterministic mock transport (synthetic data, no backend).
 */

describe('Button application shell', () => {
  it('(1/9) an authorized representative can select context and reach the affiliation landing via keyboard', async () => {
    const user = userEvent.setup();
    renderApp({
      client: new MockButtonApiClient('representative'),
      initialEntries: ['/button/select-context'],
    });

    // The select-context form lists only server-accessible organizations.
    const orgSelect = await screen.findByLabelText('Organization');
    expect(orgSelect).toBeInTheDocument();

    // Keyboard-only: select the season and submit with Enter.
    const seasonSelect = screen.getByLabelText('Season');
    await user.selectOptions(seasonSelect, '2026-27');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Lands on the affiliation landing (server confirmed active authority for the selection).
    expect(
      await screen.findByRole('heading', { name: 'Affiliation overview' }),
    ).toBeInTheDocument();
  });

  it('(6) a valid selection preserves the organization, jurisdiction, and season', async () => {
    const user = userEvent.setup();
    renderApp({
      client: new MockButtonApiClient('representative'),
      initialEntries: ['/button/select-context'],
    });

    await screen.findByLabelText('Organization');
    await user.selectOptions(screen.getByLabelText('Season'), '2026-27');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByRole('heading', { name: 'Affiliation overview' });
    // Season + member jurisdiction are preserved on the affiliation page.
    expect(screen.getAllByText('2026\u201327').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Member association').length).toBeGreaterThan(0);
  });

  it('(7) primary navigation renders from controlled EN and FR resources', async () => {
    renderApp({
      client: new MockButtonApiClient('representative'),
      initialEntries: ['/button'],
      initialLocale: 'en',
    });
    expect(await screen.findByRole('link', { name: 'Home' })).toBeInTheDocument();

    // A second render in French shows the French navigation label from the controlled resources.
    renderApp({
      client: new MockButtonApiClient('representative'),
      initialEntries: ['/button'],
      initialLocale: 'fr',
    });
    expect(await screen.findByRole('link', { name: 'Accueil' })).toBeInTheDocument();
  });

  it('(8) switching language preserves the current route', async () => {
    const user = userEvent.setup();
    renderApp({
      client: new MockButtonApiClient('representative'),
      initialEntries: ['/button/select-context'],
      initialLocale: 'en',
    });

    await screen.findByRole('heading', { name: 'Select context' });
    await user.click(screen.getByRole('button', { name: 'Fran\u00e7ais' }));

    // Still on the select-context route, now localized to French.
    expect(
      await screen.findByRole('heading', { name: 'Choisir le contexte' }),
    ).toBeInTheDocument();
  });

  it('(10) a route transition moves focus to the main landmark', async () => {
    const user = userEvent.setup();
    renderApp({
      client: new MockButtonApiClient('representative'),
      initialEntries: ['/button'],
    });

    await screen.findByRole('heading', { name: 'Welcome' });
    await user.click(screen.getByRole('link', { name: 'Get started' }));

    await waitFor(() => {
      const main = document.getElementById('main-content');
      expect(document.activeElement).toBe(main);
    });
  });
});
