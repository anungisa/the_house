/**
 * Representative authority application service.
 *
 * Validates command input at the boundary, delegates the atomic write to the store, and maps
 * store outcomes onto stable {@link AppError} codes and representative-safe views. It also exposes
 * the read paths used by the Button provider and admin surfaces.
 *
 * A trusted identity IDENTIFIES the actor; this service NEVER manufactures authority from identity
 * alone. Authority exists only when a governed grant is persisted, in-window, and un-revoked.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import { resolveEffectiveAuthorities, resolveEffectiveState } from './effectiveStatus.js';
import {
  type GrantAuthorityCommand,
  type RepresentativeAuthorityStore,
  type RevokeAuthorityCommand,
} from './RepresentativeAuthorityStore.js';
import type {
  EffectiveAuthority,
  RepresentativeAuthorityRecord,
  RepresentativeAuthorityType,
  RepresentativeAuthorityView,
} from './RepresentativeAuthorityTypes.js';

function requireNonBlank(value: string, field: string): string {
  const trimmed = value?.trim?.() ?? '';
  if (trimmed === '') {
    throw new AppError(ErrorCode.INVALID_INPUT, `Representative authority ${field} is required.`, {
      details: { field },
    });
  }
  return value;
}

function toView(record: RepresentativeAuthorityRecord, nowIso: string): RepresentativeAuthorityView {
  return {
    authorityId: record.id,
    organizationId: record.organizationId,
    authorityType: record.authorityType,
    status: resolveEffectiveState(record, nowIso),
    validFrom: record.validFrom,
    version: record.version,
    ...(record.validUntil !== undefined ? { validUntil: record.validUntil } : {}),
  };
}

export class RepresentativeAuthorityService {
  constructor(
    private readonly store: RepresentativeAuthorityStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Grant (or idempotently replay) a governed representative authority. */
  async grant(command: GrantAuthorityCommand): Promise<RepresentativeAuthorityView> {
    requireNonBlank(command.issuer, 'issuer');
    requireNonBlank(command.externalSubject, 'externalSubject');
    requireNonBlank(command.organizationId, 'organizationId');
    requireNonBlank(command.authorityType, 'authorityType');
    requireNonBlank(command.issuedBy, 'issuedBy');
    requireNonBlank(command.sourceReference, 'sourceReference');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    if (
      command.validUntil !== undefined &&
      command.validFrom !== undefined &&
      Date.parse(command.validUntil) <= Date.parse(command.validFrom)
    ) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'validUntil must be after validFrom.', {
        details: { field: 'validUntil' },
      });
    }

    const outcome = await this.store.grant(command);
    if (outcome.outcome === 'conflict') {
      throw new AppError(
        ErrorCode.REPRESENTATIVE_AUTHORITY_CONFLICT,
        'A live active representative authority already exists for this subject and organization.',
        {
          details: {
            organizationId: command.organizationId,
            authorityType: command.authorityType,
          },
        },
      );
    }
    return toView(outcome.record, this.now().toISOString());
  }

  /** Revoke a live representative authority (idempotent once revoked). */
  async revoke(command: RevokeAuthorityCommand): Promise<RepresentativeAuthorityView> {
    requireNonBlank(command.authorityId, 'authorityId');
    requireNonBlank(command.revokedBy, 'revokedBy');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');

    const outcome = await this.store.revoke(command);
    if (outcome.outcome === 'not_found') {
      throw new AppError(
        ErrorCode.REPRESENTATIVE_AUTHORITY_NOT_FOUND,
        'The referenced representative authority does not exist for this tenant.',
        { details: { authorityId: command.authorityId } },
      );
    }
    if (outcome.outcome === 'version_conflict') {
      throw new AppError(
        ErrorCode.REPRESENTATIVE_AUTHORITY_CONFLICT,
        'The representative authority was modified concurrently; retry with the current version.',
        { details: { authorityId: command.authorityId, currentVersion: outcome.record.version } },
      );
    }
    return toView(outcome.record, this.now().toISOString());
  }

  /** Read a single authority head with its derived effective status. */
  async readEffective(
    tenantId: string,
    authorityId: string,
  ): Promise<RepresentativeAuthorityView | undefined> {
    const record = await this.store.getAuthorityById(tenantId, authorityId);
    return record === undefined ? undefined : toView(record, this.now().toISOString());
  }

  /**
   * Resolve the representative-safe effective authorities a trusted identity subject holds RIGHT
   * NOW. Future-dated grants are omitted; at most one authority per organization is returned.
   */
  async listEffectiveForSubject(
    tenantId: string,
    issuer: string,
    externalSubject: string,
    authorityType: RepresentativeAuthorityType,
    nowIso: string = this.now().toISOString(),
  ): Promise<readonly EffectiveAuthority[]> {
    const records = await this.store.listAuthoritiesForSubject(
      tenantId,
      issuer,
      externalSubject,
      authorityType,
    );
    return resolveEffectiveAuthorities(records, nowIso);
  }
}
