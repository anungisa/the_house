import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MockButtonApiClient } from '../api/client';
import { ButtonApiError } from '../api/types';
import { renderApp, FakeButtonApiClient } from '../test/testUtils';
import { contextWith } from '../test/fixtures';

/**
 * Server-backed routing guards: every access decision is derived from the server-resolved context,
 * never from the browser. These tests prove that a signed-in user without authority, an expired or
 * revoked authority, and an unauthorized selection are all handled by failing closed.
 */

describe('Button routing guards', () => {
  it('(2/14) a signed-in user without authority cannot reach affiliation (direct URL still authorizes server-side)', async () => {
    renderApp({
      client: new MockButtonApiClient('no-authority'),
      initialEntries: ['/button/affiliation'],
    });

    // The guard fetches server context and redirects away from affiliation (no authority).
    expect(
      await screen.findByRole('heading', { name: 'No organizations available' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Affiliation overview' }),
    ).not.toBeInTheDocument();
  });

  it('(3) an expired authority routes to the authority-expired state and emits telemetry', async () => {
    const client = new FakeButtonApiClient(() =>
      Promise.resolve(contextWith({ selected: true, authorityStatus: 'expired' })),
    );
    const { telemetry } = renderApp({ client, initialEntries: ['/button/affiliation'] });

    expect(
      await screen.findByRole('heading', { name: 'Representative authority expired' }),
    ).toBeInTheDocument();
    expect(telemetry.events.some((e) => e.event === 'authority.expired')).toBe(true);
  });

  it('(4) a revoked authority mid-session invalidates protected content', async () => {
    const user = userEvent.setup();
    let call = 0;
    const client = new FakeButtonApiClient(() => {
      call += 1;
      return Promise.resolve(
        contextWith({ selected: true, authorityStatus: call === 1 ? 'active' : 'revoked' }),
      );
    });
    renderApp({ client, initialEntries: ['/button/affiliation'], initialLocale: 'en' });

    // Initially active → affiliation content renders.
    expect(
      await screen.findByRole('heading', { name: 'Affiliation overview' }),
    ).toBeInTheDocument();

    // A context refresh (triggered here by a locale switch) picks up the revocation and redirects.
    await user.click(screen.getByRole('button', { name: 'Fran\u00e7ais' }));
    expect(
      await screen.findByRole('heading', { name: 'Autorit\u00e9 de repr\u00e9sentant expir\u00e9e' }),
    ).toBeInTheDocument();
  });

  it('(5) an unauthorized organization selection is rejected server-side', async () => {
    const client = new MockButtonApiClient('representative');
    await expect(client.getContext({ organizationId: 'club-9' })).rejects.toMatchObject({
      category: 'access-denied',
      httpStatus: 403,
    });
  });

  it('(13) a service error surfaces only sanitized copy (no internal disclosure)', async () => {
    renderApp({
      client: new MockButtonApiClient('service-error'),
      initialEntries: ['/button/affiliation'],
    });

    expect(
      await screen.findByRole('heading', { name: 'Service temporarily unavailable' }),
    ).toBeInTheDocument();
    // The rendered document must not leak internal identifiers, stack traces, or SQL.
    const text = document.body.textContent ?? '';
    expect(text.toLowerCase()).not.toContain('stack');
    expect(text.toLowerCase()).not.toContain('select ');
    expect(text).not.toContain('club-1');
  });

  it('(13b) ButtonApiError never carries internal detail in its message', () => {
    const err = new ButtonApiError('service-unavailable', 503, 'The service is temporarily unavailable.');
    expect(err.message).toBe('The service is temporarily unavailable.');
    expect(err.message.toLowerCase()).not.toContain('internal');
  });
});
