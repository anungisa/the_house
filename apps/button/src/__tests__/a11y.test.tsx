import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { MockButtonApiClient } from '../api/client';
import { renderApp, FakeButtonApiClient } from '../test/testUtils';
import { contextWith } from '../test/fixtures';
import { StatusPanel, type StatusPanelKind } from '../components/StatusPanel';

async function expectNoSeriousViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => v.id)).toEqual([]);
}

describe('Button accessibility', () => {
  it('(11a) the affiliation shell has no serious/critical a11y violations', async () => {
    const client = new FakeButtonApiClient(() =>
      Promise.resolve(contextWith({ selected: true, authorityStatus: 'active' })),
    );
    renderApp({ client, initialEntries: ['/button/affiliation'] });
    await screen.findByRole('heading', { name: 'Affiliation overview' });
    await expectNoSeriousViolations(document.body);
  });

  it('(11b) the select-context page has no serious/critical a11y violations', async () => {
    renderApp({
      client: new MockButtonApiClient('representative'),
      initialEntries: ['/button/select-context'],
    });
    await screen.findByRole('heading', { name: 'Select context' });
    await expectNoSeriousViolations(document.body);
  });

  it('(11c) the denied / expired / service-error states have no serious/critical a11y violations', async () => {
    for (const entry of ['/button/access-denied', '/button/authority-expired', '/button/service-unavailable']) {
      const client = new FakeButtonApiClient(() =>
        Promise.resolve(contextWith({ selected: true, authorityStatus: 'active' })),
      );
      const { unmount } = renderApp({ client, initialEntries: [entry] });
      // Each state renders a heading; verify no serious a11y issues, then unmount.
      await expectNoSeriousViolations(document.body);
      unmount();
    }
  });
});

describe('Button status states are distinguishable and accessible', () => {
  const kinds: readonly StatusPanelKind[] = ['loading', 'empty', 'denied', 'expired', 'service-error'];

  it('(12) each state has a distinct kind, an accessible role, and a text status label (not colour-only)', () => {
    for (const kind of kinds) {
      const { unmount } = render(
        <StatusPanel
          kind={kind}
          heading={`Heading ${kind}`}
          body={`Body ${kind}`}
          statusLabel={`Label ${kind}`}
        />,
      );
      const panel = screen.getByRole(kind === 'loading' ? 'status' : 'alert');
      expect(panel).toHaveAttribute('data-status-kind', kind);
      // A visible textual label distinguishes the state without relying on colour alone.
      expect(screen.getByTestId('status-label')).toHaveTextContent(`Label ${kind}`);
      unmount();
    }
  });
});
