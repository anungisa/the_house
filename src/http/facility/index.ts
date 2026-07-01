/**
 * Facility Registry HTTP endpoint surface — public exports.
 *
 * A single narrow, READ-ONLY transport: list + detail over the Facility Registry read store, plus
 * one organization's facilities list. These endpoints NEVER mutate the registry, enqueue outbox
 * messages, touch governed state, invoke the Governance Kernel, or mutate the Organization
 * Registry. Authorization is the centralized `facility.read` action.
 */

export {
  handleFacilityList,
  handleFacilityDetail,
  handleOrganizationFacilityList,
  facilityReadErrorToHttpResult,
  toFacilityDto,
  FACILITY_HTTP_LIST_MAX_LIMIT,
  type FacilityReadHttpDeps,
  type FacilityReadHttpResult,
  type FacilityReadStore,
} from './FacilityReadHttpAdapter.js';

export {
  type FacilityDto,
  type FacilityPageDto,
  type FacilityListHttpRequest,
  type FacilityDetailHttpRequest,
  type OrganizationFacilityListHttpRequest,
  type FacilityListResponseBody,
  type FacilityDetailResponseBody,
  type OrganizationFacilityListResponseBody,
} from './FacilityReadHttpDtos.js';
