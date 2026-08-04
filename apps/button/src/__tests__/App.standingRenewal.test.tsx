import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MockAffiliationApiClient } from '../api/affiliationClient';
import type {
  InitiateStandingRenewalInput,
} from '../api/affiliationClient';
import type {
  StandingDetail,
  StandingRenewal,
  StandingRenewalInitiation,
} from '../api/affiliationTypes';
import { renderApp, FakeButtonApiClient } from '../test/testUtils';
import { contextWith } from '../test/fixtures';

function activeContextClient(): FakeButtonApiClient {
  return new FakeButtonApiClient(() =>
    Promise.resolve(contextWith({ selected: true, authorityStatus: 'active' })),
  );
}

/** A mock client that overlays a server-derived renewal projection + captures the bounded command. */
class RenewalMockClient extends MockAffiliationApiClient {
  readonly initiations: InitiateStandingRenewalInput[] = [];
  constructor(
    private readonly renewal: StandingRenewal,
    private readonly initiationResult: StandingRenewalInitiation,
  ) {
    super();
  }

  override async getStanding(standingId: string): Promise<StandingDetail> {
    const detail = await super.getStanding(standingId);
    return { standing: detail.standing, renewal: this.renewal };
  }

  async initiateStandingRenewal(
    input: InitiateStandingRenewalInput,
  ): Promise<StandingRenewalInitiation> {
    this.initiations.push(input);
    return this.initiationResult;
  }
}

describe('Button standing renewal experience', () => {
  it('offers eligible renewal, and starting it routes into the application workflow', async () => {
    const user = userEvent.setup();
    const client = new RenewalMockClient(
      {
        posture: 'eligible',
        pathway: 'continuity',
        targetSeasons: [
          { id: '2026-27', label: '2026-27 season', phase: 'upcoming', acceptingApplications: true },
        ],
      },
      { posture: 'eligible', created: true, resumed: false, renewalApplicationId: 'renewal-app-1' },
    );

    renderApp({
      client: activeContextClient(),
      affiliationClient: client,
      initialEntries: ['/button/standing/standing-0001'],
    });

    await screen.findByRole('heading', { name: 'Affiliation standing detail' });
    expect(screen.getByRole('heading', { name: 'Renewal' })).toBeInTheDocument();
    expect(screen.getByText('This standing is eligible for renewal.')).toBeInTheDocument();
    expect(screen.getByText('Continuity renewal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start renewal' }));

    await waitFor(() => expect(client.initiations).toHaveLength(1));
    expect(client.initiations[0]).toMatchObject({
      standingId: 'standing-0001',
      targetSeasonId: '2026-27',
    });
    // A stable idempotency key is supplied by the client so a double-submit resumes, never duplicates.
    expect(client.initiations[0]!.idempotencyKey).toContain('standing-0001');
  });

  it('resumes an in-progress renewal instead of starting a new one', async () => {
    renderApp({
      client: activeContextClient(),
      affiliationClient: new RenewalMockClient(
        {
          posture: 'in_progress',
          targetSeasons: [],
          renewalApplicationId: 'renewal-app-9',
        },
        { posture: 'in_progress', created: false, resumed: true, renewalApplicationId: 'renewal-app-9' },
      ),
      initialEntries: ['/button/standing/standing-0001'],
    });

    await screen.findByRole('heading', { name: 'Affiliation standing detail' });
    expect(screen.getByText('A renewal is already in progress for this standing.')).toBeInTheDocument();
    const continueLink = screen.getByRole('link', { name: 'Continue renewal' });
    expect(continueLink).toHaveAttribute('href', '/button/affiliation/renewal-app-9');
    // No start affordance is offered when a renewal is already in flight.
    expect(screen.queryByRole('button', { name: 'Start renewal' })).not.toBeInTheDocument();
  });

  it('shows a representative-safe message when a standing is not eligible', async () => {
    renderApp({
      client: activeContextClient(),
      affiliationClient: new RenewalMockClient(
        { posture: 'not_eligible', reasonCode: 'renewal_window_not_open', targetSeasons: [] },
        { posture: 'not_eligible', created: false, resumed: false, renewalApplicationId: '' },
      ),
      initialEntries: ['/button/standing/standing-0001'],
    });

    await screen.findByRole('heading', { name: 'Affiliation standing detail' });
    expect(
      screen.getByText('This standing is not currently eligible for renewal.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start renewal' })).not.toBeInTheDocument();
  });

  it('surfaces a reconciliation notice without offering a start action', async () => {
    renderApp({
      client: activeContextClient(),
      affiliationClient: new RenewalMockClient(
        { posture: 'reconciliation_required', targetSeasons: [] },
        { posture: 'reconciliation_required', created: false, resumed: false, renewalApplicationId: '' },
      ),
      initialEntries: ['/button/standing/standing-0001'],
    });

    await screen.findByRole('heading', { name: 'Affiliation standing detail' });
    expect(
      screen.getByText(
        'This standing\u2019s status is being updated. Renewal cannot be started yet.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start renewal' })).not.toBeInTheDocument();
  });

  it('reports an error without leaking internals when initiation fails', async () => {
    const user = userEvent.setup();
    const client = new RenewalMockClient(
      {
        posture: 'eligible',
        pathway: 'renewal_with_remediation',
        targetSeasons: [
          { id: '2026-27', label: '2026-27 season', phase: 'upcoming', acceptingApplications: true },
        ],
      },
      { posture: 'eligible', created: true, resumed: false, renewalApplicationId: 'renewal-app-1' },
    );
    vi.spyOn(client, 'initiateStandingRenewal').mockRejectedValue(new Error('boom'));

    renderApp({
      client: activeContextClient(),
      affiliationClient: client,
      initialEntries: ['/button/standing/standing-0001'],
    });

    await screen.findByRole('heading', { name: 'Affiliation standing detail' });
    await user.click(screen.getByRole('button', { name: 'Start renewal' }));

    expect(
      await screen.findByText('The renewal could not be started. Please try again.'),
    ).toBeInTheDocument();
  });
});
