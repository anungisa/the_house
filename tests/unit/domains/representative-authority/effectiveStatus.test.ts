import { describe, expect, it } from 'vitest';

import {
  resolveEffectiveAuthorities,
  resolveEffectiveState,
} from '../../../../src/domains/representative-authority/effectiveStatus.js';
import type { RepresentativeAuthorityRecord } from '../../../../src/domains/representative-authority/RepresentativeAuthorityTypes.js';

const NOW = '2026-01-01T00:00:00.000Z';

function record(over: Partial<RepresentativeAuthorityRecord> = {}): RepresentativeAuthorityRecord {
  return {
    id: 'auth-1',
    tenantId: 'tenant-a',
    identitySubjectId: 'subj-1',
    organizationId: 'org-1',
    authorityType: 'club_affiliation_representative',
    status: 'active',
    validFrom: '2025-09-01T00:00:00.000Z',
    issuedBy: 'admin',
    issuedAt: '2025-09-01T00:00:00.000Z',
    sourceReference: 'seed:1',
    idempotencyKey: 'idem-1',
    version: 1,
    createdAt: '2025-09-01T00:00:00.000Z',
    updatedAt: '2025-09-01T00:00:00.000Z',
    ...over,
  };
}

describe('resolveEffectiveState', () => {
  it('active in-window resolves to active', () => {
    expect(resolveEffectiveState(record(), NOW)).toBe('active');
  });

  it('active open-ended (no validUntil) resolves to active', () => {
    expect(resolveEffectiveState(record({ validUntil: undefined }), NOW)).toBe('active');
  });

  it('active past its validUntil resolves to expired (no mutation)', () => {
    expect(
      resolveEffectiveState(record({ validUntil: '2025-12-31T00:00:00.000Z' }), NOW),
    ).toBe('expired');
  });

  it('a future-dated grant (now < validFrom) resolves to pending', () => {
    expect(
      resolveEffectiveState(record({ validFrom: '2026-06-01T00:00:00.000Z' }), NOW),
    ).toBe('pending');
  });

  it('a revoked grant resolves to revoked regardless of window', () => {
    expect(
      resolveEffectiveState(record({ status: 'revoked', validUntil: undefined }), NOW),
    ).toBe('revoked');
  });

  it('validUntil exactly equal to now is treated as expired (inclusive boundary)', () => {
    expect(resolveEffectiveState(record({ validUntil: NOW }), NOW)).toBe('expired');
  });
});

describe('resolveEffectiveAuthorities', () => {
  it('projects active authorities and carries validUntil only when active', () => {
    const result = resolveEffectiveAuthorities(
      [record({ organizationId: 'org-1', validUntil: '2026-08-31T00:00:00.000Z' })],
      NOW,
    );
    expect(result).toEqual([
      { organizationId: 'org-1', status: 'active', validUntil: '2026-08-31T00:00:00.000Z' },
    ]);
  });

  it('omits future-dated (pending) grants entirely', () => {
    const result = resolveEffectiveAuthorities(
      [record({ organizationId: 'org-1', validFrom: '2026-06-01T00:00:00.000Z' })],
      NOW,
    );
    expect(result).toEqual([]);
  });

  it('does not leak validUntil for an expired projection', () => {
    const result = resolveEffectiveAuthorities(
      [record({ organizationId: 'org-1', validUntil: '2025-12-31T00:00:00.000Z' })],
      NOW,
    );
    expect(result).toEqual([{ organizationId: 'org-1', status: 'expired' }]);
  });

  it('collapses duplicate rows for one organization to the strongest status (never widens)', () => {
    const result = resolveEffectiveAuthorities(
      [
        record({ id: 'a', organizationId: 'org-1', status: 'revoked', idempotencyKey: 'k1' }),
        record({
          id: 'b',
          organizationId: 'org-1',
          validUntil: '2025-12-31T00:00:00.000Z',
          idempotencyKey: 'k2',
        }),
      ],
      NOW,
    );
    // revoked + expired -> expired is stronger than revoked, but neither is active.
    expect(result).toEqual([{ organizationId: 'org-1', status: 'expired' }]);
  });

  it('an active row wins over an expired/revoked row for the same organization', () => {
    const result = resolveEffectiveAuthorities(
      [
        record({ id: 'a', organizationId: 'org-1', status: 'revoked', idempotencyKey: 'k1' }),
        record({ id: 'b', organizationId: 'org-1', idempotencyKey: 'k2' }),
      ],
      NOW,
    );
    expect(result).toEqual([{ organizationId: 'org-1', status: 'active' }]);
  });

  it('keeps distinct organizations separate', () => {
    const result = resolveEffectiveAuthorities(
      [
        record({ id: 'a', organizationId: 'org-1', idempotencyKey: 'k1' }),
        record({ id: 'b', organizationId: 'org-2', idempotencyKey: 'k2' }),
      ],
      NOW,
    );
    expect(result.map((r) => r.organizationId).sort()).toEqual(['org-1', 'org-2']);
  });
});
