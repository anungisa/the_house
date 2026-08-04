/**
 * Governed jurisdiction application service.
 *
 * Validates command input at the boundary, delegates the atomic write to the store, and maps store
 * outcomes onto stable {@link AppError} codes. It also exposes representative-safe READ paths (the
 * published catalog + a single published-jurisdiction lookup by code) used by admin/synthetic setup
 * and by tests. Governed jurisdiction RESOLUTION for an organization lives in
 * {@link GovernedJurisdictionResolver}, not here.
 *
 * PUBLISH / ASSIGN COMPLETENESS is enforced HERE (not as a table CHECK): a jurisdiction may only be
 * published with bilingual labels; an assignment may only reference a PUBLISHED jurisdiction and
 * requires a source reference for governed provenance.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import {
  type AssignPrimaryJurisdictionCommand,
  type CreateJurisdictionDraftCommand,
  type JurisdictionAssignmentOutcome,
  type JurisdictionMutationOutcome,
  type JurisdictionStore,
  type PublishJurisdictionCommand,
  type ReplacePrimaryJurisdictionCommand,
  type RetireJurisdictionCommand,
  type RevokeJurisdictionAssignmentCommand,
  type ReviseJurisdictionDraftCommand,
} from './JurisdictionStore.js';
import {
  toJurisdictionView,
  type JurisdictionAssignmentRecord,
  type JurisdictionLocale,
  type JurisdictionRecord,
  type JurisdictionView,
} from './JurisdictionTypes.js';

function requireNonBlank(value: string | undefined, field: string): string {
  const trimmed = value?.trim?.() ?? '';
  if (trimmed === '') {
    throw new AppError(ErrorCode.INVALID_INPUT, `Jurisdiction ${field} is required.`, {
      details: { field },
    });
  }
  return value as string;
}

function assertValidityOrder(validFrom: string | undefined, validUntil: string | undefined): void {
  if (
    validFrom !== undefined &&
    validUntil !== undefined &&
    Date.parse(validUntil) <= Date.parse(validFrom)
  ) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Assignment validUntil must be after validFrom.', {
      details: { field: 'validUntil' },
    });
  }
}

export class JurisdictionCatalogService {
  constructor(
    private readonly store: JurisdictionStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---- Reads ----------------------------------------------------------------------------------

  /** The published jurisdiction catalog for a tenant, projected safely at a locale. */
  async publishedCatalog(
    tenantId: string,
    locale: JurisdictionLocale = 'en',
  ): Promise<readonly JurisdictionView[]> {
    const records = await this.store.listPublishedForTenant(tenantId);
    return records.map((r) => toJurisdictionView(r, locale));
  }

  /** Read a single jurisdiction head by code (operational/admin path), regardless of status. */
  async getJurisdiction(tenantId: string, code: string): Promise<JurisdictionRecord | undefined> {
    return this.store.getByCode(tenantId, code);
  }

  /** The active primary assignments for an organization (operational/admin path). */
  async activeAssignments(
    tenantId: string,
    organizationId: string,
  ): Promise<readonly JurisdictionAssignmentRecord[]> {
    return this.store.activeAssignmentsForOrganization(tenantId, organizationId);
  }

  // ---- Catalog commands -----------------------------------------------------------------------

  async createDraft(command: CreateJurisdictionDraftCommand): Promise<JurisdictionRecord> {
    requireNonBlank(command.code, 'code');
    requireNonBlank(command.labelEn, 'labelEn');
    requireNonBlank(command.labelFr, 'labelFr');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');

    const outcome = await this.store.createDraft(command);
    if (outcome.outcome === 'conflict') {
      throw new AppError(
        ErrorCode.JURISDICTION_CONFLICT,
        'A jurisdiction with this code already exists.',
        { details: { code: command.code } },
      );
    }
    if (outcome.outcome === 'parent_not_found') {
      throw new AppError(
        ErrorCode.JURISDICTION_NOT_FOUND,
        'The referenced parent jurisdiction does not exist.',
        { details: { parentJurisdictionCode: command.parentJurisdictionCode } },
      );
    }
    return outcome.record;
  }

  async reviseDraft(command: ReviseJurisdictionDraftCommand): Promise<JurisdictionRecord> {
    requireNonBlank(command.code, 'code');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    return this.applyOrThrow(command.code, await this.store.reviseDraft(command));
  }

  async publish(command: PublishJurisdictionCommand): Promise<JurisdictionRecord> {
    requireNonBlank(command.code, 'code');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');

    const head = await this.store.getByCode(command.tenantId, command.code);
    if (head === undefined) {
      throw new AppError(
        ErrorCode.JURISDICTION_NOT_FOUND,
        'The referenced jurisdiction does not exist.',
        { details: { code: command.code } },
      );
    }
    if (head.status === 'draft') {
      const missing: string[] = [];
      if ((head.labelEn ?? '').trim() === '') missing.push('labelEn');
      if ((head.labelFr ?? '').trim() === '') missing.push('labelFr');
      if (missing.length > 0) {
        throw new AppError(
          ErrorCode.JURISDICTION_CONFLICT,
          'A jurisdiction must have bilingual labels before it can be published.',
          { details: { code: command.code, missing } },
        );
      }
    }
    return this.applyOrThrow(command.code, await this.store.publish(command));
  }

  async retire(command: RetireJurisdictionCommand): Promise<JurisdictionRecord> {
    requireNonBlank(command.code, 'code');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    return this.applyOrThrow(command.code, await this.store.retire(command));
  }

  // ---- Assignment commands --------------------------------------------------------------------

  async assignPrimary(
    command: AssignPrimaryJurisdictionCommand,
  ): Promise<JurisdictionAssignmentRecord> {
    requireNonBlank(command.organizationId, 'organizationId');
    requireNonBlank(command.jurisdictionCode, 'jurisdictionCode');
    requireNonBlank(command.sourceReference, 'sourceReference');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    assertValidityOrder(command.validFrom, command.validUntil);
    return this.assignmentOrThrow(await this.store.assignPrimary(command));
  }

  async replacePrimary(
    command: ReplacePrimaryJurisdictionCommand,
  ): Promise<JurisdictionAssignmentRecord> {
    requireNonBlank(command.organizationId, 'organizationId');
    requireNonBlank(command.jurisdictionCode, 'jurisdictionCode');
    requireNonBlank(command.sourceReference, 'sourceReference');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    assertValidityOrder(command.validFrom, command.validUntil);
    return this.assignmentOrThrow(await this.store.replacePrimary(command));
  }

  async revoke(
    command: RevokeJurisdictionAssignmentCommand,
  ): Promise<JurisdictionAssignmentRecord> {
    requireNonBlank(command.organizationId, 'organizationId');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    return this.assignmentOrThrow(await this.store.revoke(command));
  }

  // ---- Outcome mapping ------------------------------------------------------------------------

  private applyOrThrow(
    code: string,
    outcome: JurisdictionMutationOutcome,
  ): JurisdictionRecord {
    switch (outcome.outcome) {
      case 'applied':
      case 'replayed':
        return outcome.record;
      case 'not_found':
        throw new AppError(
          ErrorCode.JURISDICTION_NOT_FOUND,
          'The referenced jurisdiction does not exist.',
          { details: { code } },
        );
      case 'version_conflict':
        throw new AppError(
          ErrorCode.JURISDICTION_CONFLICT,
          'The jurisdiction was modified concurrently; retry with the current version.',
          { details: { code, currentVersion: outcome.record.version } },
        );
      case 'invalid_state':
        throw new AppError(
          ErrorCode.JURISDICTION_CONFLICT,
          'The jurisdiction is not in a state that permits this change.',
          { details: { code, status: outcome.record.status } },
        );
      case 'parent_not_found':
        throw new AppError(
          ErrorCode.JURISDICTION_NOT_FOUND,
          'The referenced parent jurisdiction does not exist.',
          { details: { code } },
        );
    }
  }

  private assignmentOrThrow(
    outcome: JurisdictionAssignmentOutcome,
  ): JurisdictionAssignmentRecord {
    switch (outcome.outcome) {
      case 'assigned':
      case 'replaced':
      case 'revoked':
      case 'replayed':
        return outcome.record;
      case 'conflict':
        throw new AppError(
          ErrorCode.JURISDICTION_CONFLICT,
          'The organization already has an active primary jurisdiction, or the assignment was ' +
            'modified concurrently.',
          outcome.record !== undefined
            ? { details: { currentVersion: outcome.record.version } }
            : {},
        );
      case 'not_found':
        throw new AppError(
          ErrorCode.JURISDICTION_NOT_FOUND,
          'No active primary jurisdiction assignment exists for the organization.',
        );
      case 'jurisdiction_unavailable':
        throw new AppError(
          ErrorCode.JURISDICTION_UNAVAILABLE,
          'The referenced jurisdiction is not published and cannot be assigned.',
        );
    }
  }
}
