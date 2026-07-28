import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MockAffiliationApiClient, type AffiliationApiClient } from '../api/affiliationClient';
import { AffiliationMockStore } from '../api/affiliationMockData';
import {
  AffiliationApiError,
  type AffiliationApplicationProjection,
  type AffiliationOverview,
} from '../api/affiliationTypes';
import { renderApp, FakeButtonApiClient } from '../test/testUtils';
import { contextWith } from '../test/fixtures';

/** A context client that always resolves an active, selected representative context for club-1. */
function activeContextClient(): FakeButtonApiClient {
  return new FakeButtonApiClient(() =>
    Promise.resolve(contextWith({ selected: true, authorityStatus: 'active' })),
  );
}

describe('Button affiliation requirements experience', () => {
  it('begins a new application and renders the versioned requirements checklist', async () => {
    const user = userEvent.setup();
    renderApp({
      client: activeContextClient(),
      affiliationClient: new MockAffiliationApiClient(),
      initialEntries: ['/button/affiliation'],
    });

    await screen.findByRole('heading', { name: 'Affiliation overview' });
    await user.click(await screen.findByRole('button', { name: 'Start affiliation' }));

    await screen.findByRole('heading', { name: 'Affiliation requirements' });
    expect(screen.getByText('Confirm organization profile')).toBeInTheDocument();
    expect(screen.getByText('Primary affiliation contact')).toBeInTheDocument();
    expect(screen.getByText('Governing document')).toBeInTheDocument();
    // Version is shown (immutable bound version).
    expect(screen.getAllByText('Version 1').length).toBeGreaterThan(0);
    // Progress is server-derived.
    expect(screen.getByTestId('requirements-progress')).toHaveTextContent('0 of 4 complete');
  });

  it('saves a response and reflects it as complete on return (persist + resume)', async () => {
    const user = userEvent.setup();
    const store = new AffiliationMockStore();
    store.initiate('club-1', '2025-26', 'new_affiliation'); // app-0001
    renderApp({
      client: activeContextClient(),
      affiliationClient: new MockAffiliationApiClient(store),
      initialEntries: ['/button/affiliation/app-0001/requirements/ORG_PROFILE_CONFIRMATION'],
    });

    await screen.findByRole('heading', { name: 'Confirm organization profile' });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save response' }));
    await screen.findByText('Response saved');

    // Return to the checklist: the requirement is now server-derived complete.
    await user.click(screen.getByRole('link', { name: 'Back to requirements' }));
    await screen.findByRole('heading', { name: 'Affiliation requirements' });
    expect(screen.getByTestId('status-ORG_PROFILE_CONFIRMATION')).toHaveTextContent('Complete');
    expect(screen.getByTestId('requirements-progress')).toHaveTextContent('1 of 4 complete');
  });

  it('resumes an existing draft from the overview', async () => {
    const user = userEvent.setup();
    const store = new AffiliationMockStore();
    store.initiate('club-1', '2025-26', 'new_affiliation');
    renderApp({
      client: activeContextClient(),
      affiliationClient: new MockAffiliationApiClient(store),
      initialEntries: ['/button/affiliation'],
    });

    await screen.findByRole('heading', { name: 'Resume your draft' });
    await user.click(screen.getByRole('button', { name: 'Continue draft' }));
    await screen.findByRole('heading', { name: 'Affiliation requirements' });
  });

  it('deep-links directly to a requirement form and safely loads it', async () => {
    const store = new AffiliationMockStore();
    store.initiate('club-1', '2025-26', 'new_affiliation');
    renderApp({
      client: activeContextClient(),
      affiliationClient: new MockAffiliationApiClient(store),
      initialEntries: ['/button/affiliation/app-0001/requirements/PRIMARY_CONTACT_DETAILS'],
    });

    await screen.findByRole('heading', { name: 'Primary affiliation contact' });
    expect(screen.getByLabelText('Contact name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('associates governed evidence and shows that association is not acceptance', async () => {
    const user = userEvent.setup();
    const store = new AffiliationMockStore();
    store.initiate('club-1', '2025-26', 'new_affiliation');
    renderApp({
      client: activeContextClient(),
      affiliationClient: new MockAffiliationApiClient(store),
      initialEntries: ['/button/affiliation/app-0001/requirements/GOVERNING_DOCUMENT'],
    });

    await screen.findByRole('heading', { name: 'Governing document' });
    // The evidence section states association is not acceptance.
    expect(
      screen.getByText(/Association is not acceptance/i),
    ).toBeInTheDocument();

    const file = new File([new Uint8Array([1, 2, 3])], 'bylaws.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Attach document'), file);

    expect(await screen.findByText('bylaws.pdf')).toBeInTheDocument();
  });

  it('renders the requirements checklist in French from controlled resources', async () => {
    const store = new AffiliationMockStore();
    store.initiate('club-1', '2025-26', 'new_affiliation');
    renderApp({
      client: activeContextClient(),
      affiliationClient: new MockAffiliationApiClient(store),
      initialEntries: ['/button/affiliation/app-0001'],
      initialLocale: 'fr',
    });

    await screen.findByRole('heading', { name: 'Exigences d\u2019affiliation' });
    expect(screen.getByText('Document constitutif')).toBeInTheDocument();
  });

  it('recovers from a stale-version conflict by reloading the latest draft', async () => {
    const user = userEvent.setup();
    const store = new AffiliationMockStore();
    const base = store.initiate('club-1', '2025-26', 'new_affiliation');
    const conflicting = new ConflictOnceAffiliationClient(base);
    renderApp({
      client: activeContextClient(),
      affiliationClient: conflicting,
      initialEntries: ['/button/affiliation/app-0001/requirements/ORG_PROFILE_CONFIRMATION'],
    });

    await screen.findByRole('heading', { name: 'Confirm organization profile' });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save response' }));

    // The stale write is rejected and the UI surfaces the conflict, then reloads the latest.
    await screen.findByText(/This draft was changed elsewhere/i);
    await waitFor(() => expect(conflicting.reloaded).toBe(true));
  });
});

/**
 * A purpose-built client whose first projection read reports a STALE token ('1') while the server
 * has already advanced to '2'. The first save therefore collides (409); the UI must surface the
 * conflict and reload the latest version — exercising conflict recovery without duplicating a write.
 */
class ConflictOnceAffiliationClient implements AffiliationApiClient {
  reloaded = false;
  private reads = 0;
  private readonly serverVersion = 2;
  constructor(private readonly base: AffiliationApplicationProjection) {}

  async getOverview(): Promise<AffiliationOverview> {
    throw new AffiliationApiError('service-unavailable', 0, 'not used');
  }
  async initiate(): Promise<AffiliationApplicationProjection> {
    return { ...this.base, concurrencyToken: String(this.serverVersion) };
  }
  async getApplication(): Promise<AffiliationApplicationProjection> {
    this.reads += 1;
    if (this.reads > 1) this.reloaded = true;
    const token = this.reads === 1 ? '1' : String(this.serverVersion);
    return { ...this.base, concurrencyToken: token };
  }
  async saveDraft(input: {
    readonly expectedVersion: string;
  }): Promise<AffiliationApplicationProjection> {
    if (input.expectedVersion !== String(this.serverVersion)) {
      throw new AffiliationApiError('version-conflict', 409, 'The draft was changed elsewhere.');
    }
    return { ...this.base, concurrencyToken: String(this.serverVersion + 1) };
  }
  async associateEvidence(): Promise<AffiliationApplicationProjection> {
    return { ...this.base, concurrencyToken: String(this.serverVersion) };
  }
  async removeEvidence(): Promise<AffiliationApplicationProjection> {
    return { ...this.base, concurrencyToken: String(this.serverVersion) };
  }
}
