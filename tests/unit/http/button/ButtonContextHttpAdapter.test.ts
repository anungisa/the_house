import { describe, it, expect } from 'vitest';

import {
  handleButtonContext,
  type ButtonContextHttpDeps,
} from '../../../../src/http/button/ButtonContextHttpAdapter.js';
import {
  ButtonContextService,
  ClockDerivedSeasonCatalog,
  OrganizationTypeJurisdictionResolver,
  RoleDerivedRepresentativeAuthorityProvider,
} from '../../../../src/http/button/ButtonContextService.js';
import { CLUB_AFFILIATION_REPRESENTATIVE_ROLE } from '../../../../src/http/button/ButtonContextTypes.js';
import type { OrganizationReadStore } from '../../../../src/http/organization/OrganizationReadHttpAdapter.js';
import type {
  OrganizationListFilter,
  OrganizationListResult,
  OrganizationView,
} from '../../../../src/domains/organization-registry/OrganizationTypes.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { InMemoryTelemetry } from '../../../../src/observability/index.js';
import { TelemetryCounters } from '../../../../src/observability/TelemetryEvents.js';

/**
 * Unit tests for the Button `GET /v1/button/context` HTTP adapter.
 *
 * Protocol-pure and hermetic: identity is carried in the shared `x-house-*` trusted-header
 * contract, the backing store is in-memory, and the handler is called directly. NO database, NO
 * Docker, NO Azure/Entra. Proves HTTP status mapping, header-sourced identity, telemetry, and
 * that the response body never leaks internal/cross-tenant fields.
 */

const DEMO = new DemoAuthContextResolver();
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const NOW_ISO = '2026-01-15T00:00:00.000Z';

function org(over: Partial<OrganizationView> & { organizationId: string }): OrganizationView {
  return {
    tenantId: TENANT_A,
    organizationType: 'local',
    displayName: 'Riverside Curling Club',
    status: 'active',
    source: 'manual',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...over,
  };
}

class FakeOrganizationReadStore implements OrganizationReadStore {
  constructor(private readonly rows: readonly OrganizationView[]) {}
  list(_tenantId: string, _filter: OrganizationListFilter): Promise<OrganizationListResult> {
    return Promise.resolve({ items: [] });
  }
  getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined> {
    return Promise.resolve(
      this.rows.find((r) => r.tenantId === tenantId && r.organizationId === organizationId),
    );
  }
}

function build(rows: readonly OrganizationView[]): {
  deps: ButtonContextHttpDeps;
  telemetry: InMemoryTelemetry;
} {
  const telemetry = new InMemoryTelemetry();
  const service = new ButtonContextService({
    organizations: new FakeOrganizationReadStore(rows),
    authorities: new RoleDerivedRepresentativeAuthorityProvider(),
    seasons: new ClockDerivedSeasonCatalog(),
    jurisdictions: new OrganizationTypeJurisdictionResolver(),
    nowIso: () => NOW_ISO,
  });
  return { deps: { service, telemetry }, telemetry };
}

function repHeaders(
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'user-1',
    'x-house-actor-role-keys': CLUB_AFFILIATION_REPRESENTATIVE_ROLE,
    'x-house-organization-id': 'club-1',
    ...extra,
  };
}

/** Keys the representative-safe context envelope may ever expose (closed allow-list). */
const ALLOWED_CONTEXT_KEYS = new Set([
  'user',
  'locale',
  'representativeAuthorities',
  'accessibleOrganizations',
  'availableSeasons',
  'currentContext',
  'capabilities',
  'supportReference',
]);

describe('button context HTTP adapter', () => {
  it('returns 200 with a representative-safe context for an authorized representative', async () => {
    const { deps, telemetry } = build([org({ organizationId: 'club-1' })]);
    const result = await handleButtonContext(
      deps,
      { headers: repHeaders(), query: {} },
      'req-1',
      DEMO,
    );

    expect(result.status).toBe(200);
    expect(result.body['status']).toBe('ok');
    const context = result.body['context'] as Record<string, unknown>;
    for (const key of Object.keys(context)) {
      expect(ALLOWED_CONTEXT_KEYS.has(key)).toBe(true);
    }
    expect(
      telemetry.counterTotal(TelemetryCounters.buttonContextRead),
    ).toBeGreaterThan(0);
  });

  it('honours a valid organization + season selection from the query string', async () => {
    const { deps } = build([org({ organizationId: 'club-1' })]);
    const result = await handleButtonContext(
      deps,
      { headers: repHeaders(), query: { organizationId: 'club-1', season: '2025-26' } },
      'req-2',
      DEMO,
    );
    expect(result.status).toBe(200);
    const context = result.body['context'] as Record<string, unknown>;
    const current = context['currentContext'] as Record<string, unknown>;
    expect(current['organizationId']).toBe('club-1');
  });

  it('rejects an unauthorized organization selection with 403 (fail closed)', async () => {
    const { deps } = build([org({ organizationId: 'club-1' })]);
    const result = await handleButtonContext(
      deps,
      { headers: repHeaders(), query: { organizationId: 'club-9' } },
      'req-3',
      DEMO,
    );
    expect(result.status).toBe(403);
    expect(result.body['code']).toBe('FORBIDDEN');
  });

  it('returns 401 when no trusted identity is supplied', async () => {
    const { deps } = build([org({ organizationId: 'club-1' })]);
    const result = await handleButtonContext(deps, { headers: {}, query: {} }, 'req-4', DEMO);
    expect(result.status).toBe(401);
    expect(result.body['code']).toBe('UNAUTHENTICATED');
  });

  it('serializes to JSON without leaking internal identifiers', async () => {
    const { deps } = build([org({ organizationId: 'club-1' })]);
    const result = await handleButtonContext(
      deps,
      { headers: repHeaders(), query: { organizationId: 'club-1' } },
      'req-5',
      DEMO,
    );
    const serialized = JSON.stringify(result.body);
    // The demo actor's user id must not appear in the representative-safe payload.
    expect(serialized).not.toContain('user-1');
    // No raw role/permission/guard internals leak.
    expect(serialized.toLowerCase()).not.toContain('rolekeys');
    expect(serialized.toLowerCase()).not.toContain('permissionkeys');
  });
});
