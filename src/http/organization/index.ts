/**
 * Organization Registry HTTP endpoint surface — public exports.
 *
 * A single narrow, READ-ONLY transport: list + detail over the Organization Registry read store.
 * These endpoints NEVER mutate the registry, enqueue outbox messages, touch governed state, or
 * invoke the Governance Kernel. Authorization is the centralized `organization.read` action.
 */

export {
  handleOrganizationList,
  handleOrganizationDetail,
  organizationReadErrorToHttpResult,
  type OrganizationReadHttpDeps,
  type OrganizationReadHttpResult,
  type OrganizationReadStore,
} from './OrganizationReadHttpAdapter.js';

export {
  type OrganizationDto,
  type OrganizationPageDto,
  type OrganizationListHttpRequest,
  type OrganizationDetailHttpRequest,
  type OrganizationListResponseBody,
  type OrganizationDetailResponseBody,
} from './OrganizationReadHttpDtos.js';
