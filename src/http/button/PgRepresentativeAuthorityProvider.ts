/**
 * Governed representative authority provider (HTTP boundary adapter).
 *
 * Bridges the trusted {@link AuthActor} to the persisted, tenant-isolated House authority source.
 * The actor's verified subject IDENTIFIES who is asking; it never, by itself, grants authority.
 * This adapter asks the governed {@link RepresentativeAuthorityService} which representative
 * authorities the subject actually holds RIGHT NOW — active grants only surface as 'active',
 * lapsed grants as 'expired', revoked grants as 'revoked', and future-dated grants not at all.
 *
 * It replaces the role-derived default in every governed (PostgreSQL) composition: a trusted role
 * key or organization header can no longer manufacture representative authority on its own.
 */

import {
  HOUSE_TRUSTED_ISSUER,
  CLUB_AFFILIATION_REPRESENTATIVE_AUTHORITY_TYPE,
  type RepresentativeAuthorityService,
} from '../../domains/representative-authority/index.js';
import type { AuthActor } from '../auth/AuthContext.js';
import type {
  RepresentativeAuthorityProvider,
  ResolvedAuthority,
} from './ButtonContextService.js';

export interface PgRepresentativeAuthorityProviderOptions {
  /** The trusted issuer that names subjects for this deployment (defaults to the House issuer). */
  readonly issuer?: string;
}

export class PgRepresentativeAuthorityProvider implements RepresentativeAuthorityProvider {
  private readonly issuer: string;

  constructor(
    private readonly service: RepresentativeAuthorityService,
    options: PgRepresentativeAuthorityProviderOptions = {},
  ) {
    this.issuer = options.issuer ?? HOUSE_TRUSTED_ISSUER;
  }

  async authoritiesFor(
    tenantId: string,
    actor: AuthActor,
    nowIso: string,
  ): Promise<readonly ResolvedAuthority[]> {
    const subject = actor.userId?.trim() ?? '';
    if (tenantId.trim() === '' || subject === '') return [];
    const effective = await this.service.listEffectiveForSubject(
      tenantId,
      this.issuer,
      subject,
      CLUB_AFFILIATION_REPRESENTATIVE_AUTHORITY_TYPE,
      nowIso,
    );
    return effective.map((authority) => ({
      organizationId: authority.organizationId,
      status: authority.status,
      ...(authority.validUntil !== undefined ? { validUntil: authority.validUntil } : {}),
    }));
  }
}
