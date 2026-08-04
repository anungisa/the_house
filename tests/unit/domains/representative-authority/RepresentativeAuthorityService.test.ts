import { describe, expect, it } from 'vitest';

import { RepresentativeAuthorityService } from '../../../../src/domains/representative-authority/RepresentativeAuthorityService.js';
import type {
  GrantAuthorityCommand,
  GrantAuthorityOutcome,
  RepresentativeAuthorityStore,
  RevokeAuthorityCommand,
  RevokeAuthorityOutcome,
} from '../../../../src/domains/representative-authority/RepresentativeAuthorityStore.js';
import type {
  IdentitySubjectRecord,
  RepresentativeAuthorityRecord,
  RepresentativeAuthorityType,
} from '../../../../src/domains/representative-authority/RepresentativeAuthorityTypes.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

/** A minimal in-memory store modelling idempotency, active-uniqueness, and revoke-once. */
class InMemoryStore implements RepresentativeAuthorityStore {
  readonly records: RepresentativeAuthorityRecord[] = [];
  private seq = 0;

  grant(command: GrantAuthorityCommand): Promise<GrantAuthorityOutcome> {
    const byKey = this.records.find(
      (r) => r.tenantId === command.tenantId && r.idempotencyKey === command.idempotencyKey,
    );
    if (byKey !== undefined) return Promise.resolve({ outcome: 'replayed', record: byKey });

    const liveActive = this.records.find(
      (r) =>
        r.tenantId === command.tenantId &&
        r.organizationId === command.organizationId &&
        r.authorityType === command.authorityType &&
        r.status === 'active' &&
        r.identitySubjectId === command.externalSubject,
    );
    if (liveActive !== undefined) {
      return Promise.resolve({ outcome: 'conflict', record: liveActive });
    }

    this.seq += 1;
    const record: RepresentativeAuthorityRecord = {
      id: `auth-${this.seq}`,
      tenantId: command.tenantId,
      identitySubjectId: command.externalSubject,
      organizationId: command.organizationId,
      authorityType: command.authorityType,
      status: 'active',
      validFrom: command.validFrom ?? NOW.toISOString(),
      issuedBy: command.issuedBy,
      issuedAt: NOW.toISOString(),
      sourceReference: command.sourceReference,
      idempotencyKey: command.idempotencyKey,
      version: 1,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      ...(command.validUntil !== undefined ? { validUntil: command.validUntil } : {}),
    };
    this.records.push(record);
    return Promise.resolve({ outcome: 'granted', record });
  }

  revoke(command: RevokeAuthorityCommand): Promise<RevokeAuthorityOutcome> {
    const idx = this.records.findIndex(
      (r) => r.tenantId === command.tenantId && r.id === command.authorityId,
    );
    if (idx === -1) return Promise.resolve({ outcome: 'not_found' });
    const current = this.records[idx]!;
    if (current.status === 'revoked') return Promise.resolve({ outcome: 'replayed', record: current });
    if (command.expectedVersion !== undefined && command.expectedVersion !== current.version) {
      return Promise.resolve({ outcome: 'version_conflict', record: current });
    }
    const revoked: RepresentativeAuthorityRecord = {
      ...current,
      status: 'revoked',
      revokedBy: command.revokedBy,
      revokedAt: NOW.toISOString(),
      version: current.version + 1,
      ...(command.revocationReasonCode !== undefined
        ? { revocationReasonCode: command.revocationReasonCode }
        : {}),
    };
    this.records[idx] = revoked;
    return Promise.resolve({ outcome: 'revoked', record: revoked });
  }

  getAuthorityById(
    tenantId: string,
    authorityId: string,
  ): Promise<RepresentativeAuthorityRecord | undefined> {
    return Promise.resolve(
      this.records.find((r) => r.tenantId === tenantId && r.id === authorityId),
    );
  }

  listAuthoritiesForSubject(
    tenantId: string,
    _issuer: string,
    externalSubject: string,
    authorityType: RepresentativeAuthorityType,
  ): Promise<readonly RepresentativeAuthorityRecord[]> {
    return Promise.resolve(
      this.records.filter(
        (r) =>
          r.tenantId === tenantId &&
          r.identitySubjectId === externalSubject &&
          r.authorityType === authorityType,
      ),
    );
  }

  getIdentitySubject(): Promise<IdentitySubjectRecord | undefined> {
    return Promise.resolve(undefined);
  }
}

function grantCommand(over: Partial<GrantAuthorityCommand> = {}): GrantAuthorityCommand {
  return {
    tenantId: 'tenant-a',
    issuer: 'house.trusted',
    externalSubject: 'subject-1',
    organizationId: 'org-1',
    authorityType: 'club_affiliation_representative',
    issuedBy: 'admin',
    sourceReference: 'seed:1',
    idempotencyKey: 'idem-1',
    ...over,
  };
}

function service(store: InMemoryStore): RepresentativeAuthorityService {
  return new RepresentativeAuthorityService(store, () => NOW);
}

describe('RepresentativeAuthorityService.grant', () => {
  it('grants a new active authority and returns a representative-safe view', async () => {
    const store = new InMemoryStore();
    const view = await service(store).grant(grantCommand());
    expect(view.status).toBe('active');
    expect(view.organizationId).toBe('org-1');
    expect(view.version).toBe(1);
  });

  it('is idempotent: a replayed key returns the original grant', async () => {
    const store = new InMemoryStore();
    const first = await service(store).grant(grantCommand());
    const second = await service(store).grant(grantCommand());
    expect(second.authorityId).toBe(first.authorityId);
    expect(store.records).toHaveLength(1);
  });

  it('rejects a second live active grant for the same subject+org as a conflict', async () => {
    const store = new InMemoryStore();
    await service(store).grant(grantCommand({ idempotencyKey: 'k1' }));
    await expect(
      service(store).grant(grantCommand({ idempotencyKey: 'k2' })),
    ).rejects.toMatchObject({ code: ErrorCode.REPRESENTATIVE_AUTHORITY_CONFLICT });
  });

  it('rejects a blank issuer/subject/organization (fail closed at the boundary)', async () => {
    const store = new InMemoryStore();
    await expect(service(store).grant(grantCommand({ issuer: '  ' }))).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    });
    await expect(
      service(store).grant(grantCommand({ externalSubject: '' })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a validity window whose validUntil is not after validFrom', async () => {
    const store = new InMemoryStore();
    await expect(
      service(store).grant(
        grantCommand({
          validFrom: '2026-01-01T00:00:00.000Z',
          validUntil: '2025-01-01T00:00:00.000Z',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });
});

describe('RepresentativeAuthorityService.revoke', () => {
  it('revokes a live authority and reflects the revoked status', async () => {
    const store = new InMemoryStore();
    const granted = await service(store).grant(grantCommand());
    const view = await service(store).revoke({
      tenantId: 'tenant-a',
      authorityId: granted.authorityId,
      revokedBy: 'admin',
      idempotencyKey: 'rev-1',
    });
    expect(view.status).toBe('revoked');
    expect(view.version).toBe(2);
  });

  it('is idempotent: revoking an already-revoked authority replays the revoked view', async () => {
    const store = new InMemoryStore();
    const granted = await service(store).grant(grantCommand());
    await service(store).revoke({
      tenantId: 'tenant-a',
      authorityId: granted.authorityId,
      revokedBy: 'admin',
      idempotencyKey: 'rev-1',
    });
    const again = await service(store).revoke({
      tenantId: 'tenant-a',
      authorityId: granted.authorityId,
      revokedBy: 'admin',
      idempotencyKey: 'rev-2',
    });
    expect(again.status).toBe('revoked');
  });

  it('rejects an unknown authority as not found', async () => {
    const store = new InMemoryStore();
    await expect(
      service(store).revoke({
        tenantId: 'tenant-a',
        authorityId: 'missing',
        revokedBy: 'admin',
        idempotencyKey: 'rev-1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.REPRESENTATIVE_AUTHORITY_NOT_FOUND });
  });

  it('rejects a stale optimistic-concurrency version as a conflict', async () => {
    const store = new InMemoryStore();
    const granted = await service(store).grant(grantCommand());
    await expect(
      service(store).revoke({
        tenantId: 'tenant-a',
        authorityId: granted.authorityId,
        revokedBy: 'admin',
        expectedVersion: 99,
        idempotencyKey: 'rev-1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.REPRESENTATIVE_AUTHORITY_CONFLICT });
  });
});

describe('RepresentativeAuthorityService.listEffectiveForSubject', () => {
  it('returns the active effective authorities a subject holds and omits future/revoked ones', async () => {
    const store = new InMemoryStore();
    const svc = service(store);
    await svc.grant(grantCommand({ organizationId: 'org-1', idempotencyKey: 'k1' }));
    await svc.grant(
      grantCommand({
        organizationId: 'org-2',
        idempotencyKey: 'k2',
        validFrom: '2026-06-01T00:00:00.000Z',
      }),
    );
    const effective = await svc.listEffectiveForSubject(
      'tenant-a',
      'house.trusted',
      'subject-1',
      'club_affiliation_representative',
    );
    expect(effective).toEqual([{ organizationId: 'org-1', status: 'active' }]);
  });
});
