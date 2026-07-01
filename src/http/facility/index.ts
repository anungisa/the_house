/**
 * Facility Registry HTTP endpoint surface — public exports.
 *
 * READ transport: list + detail over the Facility Registry read store, plus one organization's
 * facilities list. WRITE transport (phase 1): create + update over the validated
 * {@link FacilityRegistryService}. The write handlers NEVER enqueue outbox messages, touch governed
 * state, invoke the Governance Kernel, or mutate the Organization Registry (the service only READS
 * it). Read authorization is the centralized `facility.read` action; create/update use
 * `facility.write`. A facility STATUS transition is a deliberately separate future pass — no
 * `facility.status.write` action or status-transition route exists yet.
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
  handleFacilityCreate,
  handleFacilityUpdate,
  facilityWriteErrorToHttpResult,
  type FacilityWriteHttpDeps,
  type FacilityExistenceReader,
} from './FacilityWriteHttpAdapter.js';

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

export {
  FACILITY_CREATE_BODY_KEYS,
  FACILITY_UPDATE_BODY_KEYS,
  type FacilityCreateRequestBody,
  type FacilityUpdateRequestBody,
  type FacilityCreateHttpRequest,
  type FacilityUpdateHttpRequest,
  type FacilityWriteResponseBody,
} from './FacilityWriteHttpDtos.js';
