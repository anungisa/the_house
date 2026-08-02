import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MockButtonApiClient } from '../api/client';
import { renderApp } from '../test/testUtils';

/**
 * Observability contract: the app emits safe, categorized telemetry at the resilience boundaries
 * (context-load failure, denied navigation, locale switch) without leaking user- or tenant-scoped
 * detail. These assertions pin the emitted events so regressions in the guards or providers are
 * caught, and confirm attributes stay limited to non-sensitive categories.
 */

describe('Button resilience telemetry', () => {
  it('emits context.load.failure and route.load.failure when the service is unavailable', async () => {
    const { telemetry } = renderApp({
      client: new MockButtonApiClient('service-error'),
      initialEntries: ['/button/affiliation'],
    });

    expect(
      await screen.findByRole('heading', { name: 'Service temporarily unavailable' }),
    ).toBeInTheDocument();

    const contextFailure = telemetry.events.find((e) => e.event === 'context.load.failure');
    expect(contextFailure).toBeDefined();
    expect(contextFailure?.attributes.errorCategory).toBe('service-unavailable');

    expect(telemetry.events.some((e) => e.event === 'route.load.failure')).toBe(true);

    // Telemetry must never carry tenant/org identifiers or free-form internal detail.
    for (const { attributes } of telemetry.events) {
      expect(JSON.stringify(attributes)).not.toContain('club-1');
    }
  });

  it('emits route.denied when a representative navigates to a route they lack capability for', async () => {
    const { telemetry } = renderApp({
      client: new MockButtonApiClient('representative'),
      initialEntries: ['/button/review'],
    });

    expect(
      await screen.findByRole('heading', { name: 'Access not available' }),
    ).toBeInTheDocument();

    const denied = telemetry.events.find((e) => e.event === 'route.denied');
    expect(denied).toBeDefined();
    expect(denied?.attributes.errorCategory).toBe('access-denied');
  });

  it('emits locale.switch when the representative changes language', async () => {
    const user = userEvent.setup();
    const { telemetry } = renderApp({
      client: new MockButtonApiClient('representative'),
      initialEntries: ['/button/select-context'],
      initialLocale: 'en',
    });

    expect(
      await screen.findByRole('heading', { name: 'Select context' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fran\u00e7ais' }));

    const localeSwitch = telemetry.events.find((e) => e.event === 'locale.switch');
    expect(localeSwitch).toBeDefined();
    expect(localeSwitch?.attributes.locale).toBe('fr');
  });
});
