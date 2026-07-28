/**
 * Requirement catalog read port + implementations.
 *
 * The catalog is INSTITUTIONAL reference data (all versions, active and retired). Resolution uses
 * active definitions; projection of an EXISTING application looks up the EXACT bound version so a
 * later catalog revision can never silently rewrite the basis of a saved draft.
 */

import pg from 'pg';
import { getPool, queryRaw } from '../../db/pool.js';
import {
  DEFAULT_AFFILIATION_REQUIREMENT_CATALOG,
  type RequirementApplicability,
  type RequirementDefinition,
  type RequirementResponseType,
} from './RequirementCatalog.js';

export interface RequirementCatalogStore {
  /** Return ALL catalog definitions (every version, active + retired). */
  listAll(): Promise<readonly RequirementDefinition[]>;
}

/** In-memory catalog (defaults to the authoritative v1 seed). */
export class InMemoryRequirementCatalogStore implements RequirementCatalogStore {
  constructor(
    private readonly definitions: readonly RequirementDefinition[] = DEFAULT_AFFILIATION_REQUIREMENT_CATALOG,
  ) {}

  async listAll(): Promise<readonly RequirementDefinition[]> {
    return this.definitions;
  }
}

/**
 * PostgreSQL catalog reader. `requirement_definition` is institutional reference data (NOT under
 * RLS), so it is read tenant-agnostically. Read-only; never mutates.
 */
export class PgRequirementCatalogStore implements RequirementCatalogStore {
  constructor(private readonly pool: pg.Pool = getPool()) {}

  async listAll(): Promise<readonly RequirementDefinition[]> {
    const rows = await queryRaw<{
      id: string;
      code: string;
      version: number;
      response_type: RequirementResponseType;
      evidence_required: boolean;
      title_en: string;
      guidance_en: string;
      title_fr: string;
      guidance_fr: string;
      applicability: RequirementApplicability;
      effective_season: string | null;
      institutional_source: string;
      active: boolean;
    }>(
      `SELECT id, code, version, response_type, evidence_required,
              title_en, guidance_en, title_fr, guidance_fr,
              applicability, effective_season, institutional_source, active
         FROM affiliation.requirement_definition
        ORDER BY code ASC, version ASC`,
      undefined,
      this.pool,
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      version: r.version,
      responseType: r.response_type,
      evidenceRequired: r.evidence_required,
      titleEn: r.title_en,
      guidanceEn: r.guidance_en,
      titleFr: r.title_fr,
      guidanceFr: r.guidance_fr,
      applicability: r.applicability,
      ...(r.effective_season !== null ? { effectiveSeason: r.effective_season } : {}),
      institutionalSource: r.institutional_source,
      active: r.active,
    }));
  }
}
