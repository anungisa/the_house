/**
 * The Button HTTP surface — barrel export.
 *
 * Public entry points for the representative-safe `GET /v1/button/context` endpoint and its
 * assembly service, types, and default policy-derived providers.
 */

export * from './ButtonContextTypes.js';
export {
  ButtonContextService,
  RoleDerivedRepresentativeAuthorityProvider,
  ClockDerivedSeasonCatalog,
  OrganizationTypeJurisdictionResolver,
} from './ButtonContextService.js';
export type {
  ButtonContextServiceDeps,
  ButtonContextSelection,
  RepresentativeAuthorityProvider,
  ResolvedAuthority,
  SeasonCatalog,
  JurisdictionResolver,
} from './ButtonContextService.js';
export {
  handleButtonContext,
} from './ButtonContextHttpAdapter.js';
export type {
  ButtonContextHttpDeps,
  ButtonContextHttpRequest,
  ButtonContextHttpResult,
} from './ButtonContextHttpAdapter.js';
